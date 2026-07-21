"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth/session";
import { todayIL } from "@/lib/dates";
import { DAY_NAMES, dowOf, fmtRange, fmtMin, addDays, type SlotBounds } from "@/lib/schedule/slots";
import { getScheduleConfig } from "@/lib/schedule/config";
import { aiAvailable } from "@/lib/ai/enabled";
import { getAnthropicKey } from "@/lib/ai/key";

export type ParsedEntry =
  | {
      kind: "absence";
      dateFrom: string;
      dateTo: string;
      startMin: number | null;
      endMin: number | null;
      note?: string;
    }
  | {
      kind: "reduction";
      dayOfWeek: number;
      startMin: number;
      endMin: number;
      effectiveFrom: string;
      note?: string;
    };

export type ParseResult =
  | { error: string }
  | { entry: ParsedEntry; summary: string };

const timeToMin = (s: unknown, bounds: SlotBounds): number | null => {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= bounds.dayStartMin && v <= bounds.dayEndMin ? v : null;
};

/**
 * Turn Hebrew free text ("אני בחופש שבוע הבא", "יוצא מוקדם כל יום שני מ-14:00")
 * into a structured one-time absence or recurring reduction, for user confirmation.
 */
export async function parseAbsenceText(text: string): Promise<ParseResult> {
  await requireUser();
  const input = text.trim().slice(0, 400);
  if (input.length < 3) return { error: "כתבו כמה מילים על ההיעדרות" };
  if (!(await aiAvailable())) {
    return { error: "הבנת טקסט חופשי כבויה כרגע — השתמשו בטופס הרגיל" };
  }

  const today = todayIL();
  const cfg = await getScheduleConfig();
  const dayStart = fmtMin(cfg.dayStartMin);
  const dayEnd = fmtMin(cfg.dayEndMin);
  // concrete calendar for the next 21 days so the model never computes weekdays itself
  const calendar = Array.from({ length: 21 }, (_, i) => {
    const d = addDays(today, i);
    return `${d} = יום ${DAY_NAMES[dowOf(d)] ?? "שבת"}${i === 0 ? " (היום)" : i === 1 ? " (מחר)" : ""}`;
  }).join("\n");
  const anthropic = new Anthropic({ apiKey: (await getAnthropicKey()).key ?? undefined });

  try {
    const response = await anthropic.messages.create({
      model: process.env.AI_PARSE_MODEL || "claude-haiku-4-5",
      max_tokens: 500,
      system: `אתה מפענח בקשות היעדרות של מטפלים במרפאה לעברית מובנית.
היום: ${today} (יום ${DAY_NAMES[dowOf(today)] ?? "שבת"}). שבוע העבודה: ראשון–שישי, שעות הפעילות ${dayStart}–${dayEnd}.

לוח התאריכים הקרובים (השתמש בו במדויק, אל תחשב ימים בעצמך):
${calendar}

כללי המרה:
- תאריכים יחסיים ("מחר", "שני הקרוב", "שבוע הבא") → מצא את התאריך המתאים בלוח למעלה. "יום X הקרוב" = ההופעה הקרובה ביותר של יום X בלוח (לא כולל היום).
- "כל יום X" / "בקביעות" / "כל שבוע" → צמצום קבוע (report_reduction). אחרת → היעדרות חד־פעמית (report_absence).
- מספרי שעות במילים → ספרות: "שלוש" = 15:00 (שעות עבודה), "תשע" = 09:00, "אחת" = 13:00, "שתיים" = 14:00.

זיהוי שעות — קריטי:
- "יוצא/עוזב/מסיים בשעה X" או "עד X" → נעדר מהשעה X עד סוף היום (end=${dayEnd}). start=X, end=${dayEnd}. זו אינה היעדרות של יום שלם!
- "מגיע/מתחיל בשעה X" → נעדר מתחילת היום עד X. start=${dayStart}, end=X.
- "בין X ל-Y" / "מ-X עד Y" → start=X, end=Y.
- רק אם אין שום אזכור של שעה → יום שלם (השמט start/end).

דוגמאות:
- "ביום שלישי הקרוב אני יוצא בשעה שלוש" → report_absence, אותו יום שלישי, start=15:00, end=${dayEnd}.
- "מחר אני מגיע רק בעשר" → report_absence, מחר, start=${dayStart}, end=10:00.
- "כל יום שני אני בהדרכה מ-10 עד 11" → report_reduction, יום 1, start=10:00, end=11:00.
- "בחופש מ-3 עד 10 באוגוסט" → report_absence, יום שלם, טווח תאריכים.

השתמש בטקסט המקורי לניסוח הערה קצרה (סיבה: חופשה/הדרכה/ישיבה/יציאה מוקדמת). אם הטקסט לא ניתן לפענוח כלל — report_unclear.`,
      tools: [
        {
          name: "report_absence",
          description: "היעדרות חד־פעמית או חופשה בטווח תאריכים",
          input_schema: {
            type: "object",
            properties: {
              date_from: { type: "string", description: "YYYY-MM-DD" },
              date_to: { type: "string", description: "YYYY-MM-DD, זהה ל-date_from אם יום בודד" },
              start: { type: "string", description: "HH:MM או השמט ליום שלם" },
              end: { type: "string", description: "HH:MM או השמט ליום שלם" },
              note: { type: "string", description: "סיבה קצרה בעברית" },
            },
            required: ["date_from", "date_to"],
          },
        },
        {
          name: "report_reduction",
          description: "צמצום קבוע — היעדרות שחוזרת כל שבוע באותו יום",
          input_schema: {
            type: "object",
            properties: {
              day_of_week: { type: "integer", minimum: 0, maximum: 5, description: "0=ראשון…5=שישי" },
              start: { type: "string", description: "HH:MM" },
              end: { type: "string", description: "HH:MM" },
              effective_from: { type: "string", description: "YYYY-MM-DD, ברירת מחדל היום" },
              note: { type: "string" },
            },
            required: ["day_of_week", "start", "end"],
          },
        },
        {
          name: "report_unclear",
          description: "הטקסט לא ניתן לפענוח",
          input_schema: {
            type: "object",
            properties: { reason: { type: "string" } },
            required: ["reason"],
          },
        },
      ],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: input }],
    });

    const tu = response.content.find((b) => b.type === "tool_use");
    if (!tu || tu.type !== "tool_use") return { error: "לא הצלחתי להבין — נסו לנסח אחרת" };
    const args = tu.input as Record<string, unknown>;

    if (tu.name === "report_unclear") {
      return { error: `לא הצלחתי להבין: ${args.reason ?? "נסו לציין תאריך ושעות"}` };
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (tu.name === "report_absence") {
      const dateFrom = String(args.date_from ?? "");
      const dateTo = String(args.date_to ?? dateFrom);
      if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo) || dateTo < dateFrom) {
        return { error: "התאריכים לא זוהו — נסו לציין אותם במפורש" };
      }
      const startMin = timeToMin(args.start, cfg);
      const endMin = timeToMin(args.end, cfg);
      const hasHours = startMin != null && endMin != null && endMin > startMin;
      const note = args.note ? String(args.note).slice(0, 100) : undefined;
      const range =
        dateFrom === dateTo
          ? `יום ${DAY_NAMES[dowOf(dateFrom)] ?? ""} ${dateFrom.slice(8, 10)}.${dateFrom.slice(5, 7)}`
          : `${dateFrom.slice(8, 10)}.${dateFrom.slice(5, 7)} עד ${dateTo.slice(8, 10)}.${dateTo.slice(5, 7)}`;
      return {
        entry: {
          kind: "absence",
          dateFrom,
          dateTo,
          startMin: hasHours ? startMin : null,
          endMin: hasHours ? endMin : null,
          note,
        },
        summary: `היעדרות חד־פעמית: ${range}, ${hasHours ? fmtRange(startMin!, endMin!) : "יום שלם"}${note ? ` (${note})` : ""}`,
      };
    }

    if (tu.name === "report_reduction") {
      const dayOfWeek = Number(args.day_of_week);
      const startMin = timeToMin(args.start, cfg);
      const endMin = timeToMin(args.end, cfg);
      const effectiveFrom = DATE_RE.test(String(args.effective_from ?? ""))
        ? String(args.effective_from)
        : today;
      if (!(dayOfWeek >= 0 && dayOfWeek <= 5) || startMin == null || endMin == null || endMin <= startMin) {
        return { error: "היום או השעות לא זוהו — נסו לציין אותם במפורש" };
      }
      const note = args.note ? String(args.note).slice(0, 100) : undefined;
      return {
        entry: { kind: "reduction", dayOfWeek, startMin, endMin, effectiveFrom, note },
        summary: `צמצום קבוע: כל יום ${DAY_NAMES[dayOfWeek]} ${fmtRange(startMin, endMin)}, החל מ־${effectiveFrom.slice(8, 10)}.${effectiveFrom.slice(5, 7)}${note ? ` (${note})` : ""}`,
      };
    }

    return { error: "לא הצלחתי להבין — נסו לנסח אחרת" };
  } catch (e) {
    console.error(e);
    return { error: "שגיאה בפענוח — נסו שוב או השתמשו בטופס הרגיל" };
  }
}
