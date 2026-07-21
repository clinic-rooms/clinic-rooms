import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { loadEngineData, buildScoringContext, getActiveDays, type EngineDataset } from "@/lib/schedule/data";
import { computeDaySchedule, userDayOccupancy } from "@/lib/schedule/engine";
import { rankFreeRooms } from "@/lib/schedule/scoring";
import { buildPlacementPlan, checkRecurring } from "@/lib/schedule/suggestions";
import { maskFor, maskToRanges, fmtMin, fmtRange, dowOf, addDays, DAY_NAMES, countSlots } from "@/lib/schedule/slots";
import { todayIL } from "@/lib/dates";
import type { ProposalChange } from "@/actions/admin-schedule";

// ---------- helpers ----------

function parseTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`שעה לא תקינה: ${s} (פורמט HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(s: string): string {
  if (!DATE_RE.test(s)) throw new Error(`תאריך לא תקין: ${s} (פורמט YYYY-MM-DD)`);
  return s;
}

/** lazy dataset cache for one chat turn — one wide DB load serves all tool calls */
export function createToolContext() {
  let dataset: EngineDataset | null = null;
  let activeDays: number[] | null = null;
  const from = addDays(todayIL(), -7);
  const to = addDays(todayIL(), 90);
  return {
    async data(): Promise<EngineDataset> {
      if (!dataset) dataset = await loadEngineData(from, to);
      return dataset;
    },
    async days(): Promise<number[]> {
      if (!activeDays) activeDays = await getActiveDays();
      return activeDays;
    },
  };
}
export type ToolContext = ReturnType<typeof createToolContext>;

function findUser(ds: EngineDataset, nameOrId: string) {
  const q = nameOrId.trim();
  return (
    ds.users.find((u) => u.id === q) ??
    ds.users.find((u) => u.name === q) ??
    ds.users.find((u) => u.name.includes(q))
  );
}

function roomLabel(ds: EngineDataset, roomId: string): string {
  return ds.rooms.find((r) => r.id === roomId)?.name ?? roomId;
}

function compactDay(ds: EngineDataset, date: string) {
  const schedule = computeDaySchedule(ds.dayData(date));
  return {
    date,
    day: DAY_NAMES[schedule.dow],
    rooms: schedule.rooms
      .filter((rd) => rd.openMask !== 0)
      .map((rd) => ({
        room_id: rd.room.id,
        room: rd.room.name,
        traits: [
          rd.room.hasWindow ? "חלון" : null,
          rd.room.hasSink ? "כיור" : null,
          rd.room.isLarge ? "גדול" : null,
          rd.room.isGroupRoom ? "קבוצות" : null,
          rd.room.isPool ? "חיצוני" : null,
        ].filter(Boolean),
        occupied: rd.occupants
          .filter((o) => o.mask)
          .flatMap((o) =>
            maskToRanges(ds.cfg, o.mask).map((r) => ({
              who: ds.users.find((u) => u.id === o.userId)?.name ?? "?",
              range: fmtRange(r.startMin, r.endMin),
              kind: o.kind === "group" ? "קבוצה" : undefined,
              one_time: o.source === "booking" ? true : undefined,
            }))
          ),
        free: maskToRanges(ds.cfg, rd.freeMask).map((r) => fmtRange(r.startMin, r.endMin)),
      })),
  };
}

// ---------- tool definitions (Anthropic schema) ----------

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_day_schedule",
    description: "לוח מלא של יום: מי בכל חדר ומה פנוי. השתמש כדי לענות על שאלות על יום מסוים.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["date"],
    },
  },
  {
    name: "get_week_overview",
    description: "סיכום תפוסה שבועי קומפקטי: אחוז תפוסה ושעות פנויות לכל חדר בכל יום פעיל.",
    input_schema: {
      type: "object",
      properties: { week_start: { type: "string", description: "תאריך יום ראשון, YYYY-MM-DD" } },
      required: ["week_start"],
    },
  },
  {
    name: "find_free_rooms",
    description: "חדרים פנויים בחלון זמן נתון, מדורגים. אפשר לסנן לפי חלון/גדול/קבוצות ולציין מטפל לניקוד עקביות.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        start: { type: "string", description: "HH:MM" },
        end: { type: "string", description: "HH:MM" },
        has_window: { type: "boolean" },
        is_large: { type: "boolean" },
        is_group_room: { type: "boolean" },
        user_name: { type: "string", description: "לניקוד עקביות חדר (לא חובה)" },
      },
      required: ["date", "start", "end"],
    },
  },
  {
    name: "build_placement_plan",
    description:
      "בניית תוכניות שיבוץ (עד 3, מדורגות) לעובד לפי אילוצים: ימים בשבוע, חלון שעות. כולל 'יום טלאים' כמוצא אחרון. השתמש לשאלות כמו 'איפה לשבץ עובד חדש/סטודנט'.",
    input_schema: {
      type: "object",
      properties: {
        days_of_week: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 5 },
          description: "0=ראשון … 5=שישי",
        },
        start: { type: "string", description: "HH:MM" },
        end: { type: "string", description: "HH:MM" },
        from_date: { type: "string", description: "מתי מתחילים, YYYY-MM-DD. ברירת מחדל: היום" },
        user_name: { type: "string", description: "אם העובד כבר קיים במערכת (לא חובה)" },
        has_window: { type: "boolean" },
        is_large: { type: "boolean" },
      },
      required: ["days_of_week", "start", "end"],
    },
  },
  {
    name: "get_user_schedule",
    description: "הלו״ז הקבוע של מטפל/ת + השבוע הקרוב בפועל (כולל היעדרויות והזמנות).",
    input_schema: {
      type: "object",
      properties: { user_name: { type: "string" } },
      required: ["user_name"],
    },
  },
  {
    name: "list_users",
    description: "רשימת אנשי הצוות: שם, תפקיד ודרגה (המידע על דרגות נשאר בינינו — אל תציין דרגות בפני משתמשים).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_rooms",
    description: "רשימת החדרים ותכונותיהם (חלון, גדול, קבוצות, חיצוני) וחלונות הזמינות שלהם.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "plan_room_vacancy",
    description:
      "תכנון פינוי חדר: מי תופס חדר מסוים בחלון זמן, ולאן אפשר להעביר כל אחד מהם (אפשרויות מדורגות לפי מינימום פגיעה). השתמש לשאלות כמו 'אני רוצה לפנות את חדר X ביום Y — מה צריך לקרות?'. קבוצות אינן ניתנות לעקירה.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start: { type: "string", description: "HH:MM. ברירת מחדל 07:00" },
        end: { type: "string", description: "HH:MM. ברירת מחדל 19:00" },
      },
      required: ["room_name", "date"],
    },
  },
  {
    name: "check_recurring_slot",
    description: "בדיקה אם חדר מסוים פנוי בקביעות (8 מופעים קדימה) ביום ושעה נתונים.",
    input_schema: {
      type: "object",
      properties: {
        room_name: { type: "string" },
        day_of_week: { type: "integer", minimum: 0, maximum: 5 },
        start: { type: "string" },
        end: { type: "string" },
        from_date: { type: "string" },
      },
      required: ["room_name", "day_of_week", "start", "end"],
    },
  },
  {
    name: "propose_changes",
    description:
      "הצעת סט שינויים לביצוע (שיבוצים קבועים/חד־פעמיים, סיום/העברת שיבוץ). השינויים לא מבוצעים — הם מוצגים למנהל ככרטיס עם כפתור אישור. חובה לצרף summary קצר בעברית.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "תיאור קצר בעברית של מה שיקרה" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: [
                  "add_assignment",
                  "end_assignment",
                  "move_assignment",
                  "add_booking",
                  "add_absence",
                ],
              },
              user_name: { type: "string" },
              room_name: { type: "string" },
              day_of_week: { type: "integer" },
              start: { type: "string" },
              end: { type: "string" },
              date: { type: "string", description: "גם עבור add_absence של יום בודד" },
              effective_from: { type: "string" },
              effective_to: { type: "string" },
              assignment_id: { type: "string" },
              new_room_name: { type: "string" },
              new_day_of_week: { type: "integer" },
              kind: { type: "string", enum: ["regular", "group"] },
              note: { type: "string", description: "הערה חופשית ל-add_absence (למשל 'פינוי לטובת קבוצה')" },
            },
            required: ["op"],
          },
        },
      },
      required: ["summary", "changes"],
    },
  },
];

// ---------- executors ----------

export type ProposalCard = { summary: string; changes: ProposalChange[]; description: string[] };

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>
): Promise<{ result: unknown; proposal?: ProposalCard }> {
  const ds = await ctx.data();

  switch (name) {
    case "get_day_schedule": {
      return { result: compactDay(ds, assertDate(String(input.date))) };
    }

    case "get_week_overview": {
      const start = assertDate(String(input.week_start));
      const activeDays = await ctx.days();
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        if (!activeDays.includes(dowOf(d))) continue;
        const schedule = computeDaySchedule(ds.dayData(d));
        days.push({
          date: d,
          day: DAY_NAMES[schedule.dow],
          rooms: schedule.rooms
            .filter((rd) => rd.openMask !== 0)
            .map((rd) => ({
              room: rd.room.name,
              occupancy_pct: Math.round((countSlots(rd.occupiedMask) / countSlots(rd.openMask)) * 100),
              peak_free: maskToRanges(ds.cfg, rd.freeMask & ds.cfg.peakMask).map((r) => fmtRange(r.startMin, r.endMin)),
              free: maskToRanges(ds.cfg, rd.freeMask).map((r) => fmtRange(r.startMin, r.endMin)),
            })),
        });
      }
      return { result: { week_start: start, days } };
    }

    case "find_free_rooms": {
      const date = assertDate(String(input.date));
      const startMin = parseTime(String(input.start));
      const endMin = parseTime(String(input.end));
      const user = input.user_name ? findUser(ds, String(input.user_name)) : undefined;
      const sctx = buildScoringContext(ds, user?.id ?? "__none__", dowOf(date), todayIL());
      const schedule = computeDaySchedule(ds.dayData(date));
      const ranked = rankFreeRooms(schedule, maskFor(ds.cfg, startMin, endMin), sctx, {
        filters: {
          hasWindow: input.has_window === true || undefined,
          isLarge: input.is_large === true || undefined,
          isGroupRoom: input.is_group_room === true || undefined,
        },
      });
      return {
        result: {
          date,
          window: fmtRange(startMin, endMin),
          note: "זמינות לתאריך הספציפי הזה בלבד. ייתכן שחדר פנוי כאן רק בגלל היעדרות חד־פעמית. לשיבוץ קבוע ודא זמינות עם check_recurring_slot או build_placement_plan.",
          free_rooms: ranked.map((r) => ({
            room: r.room.name,
            traits: [
              r.room.hasWindow ? "חלון" : null,
              r.room.hasSink ? "כיור" : null,
              r.room.isLarge ? "גדול" : null,
              r.room.isGroupRoom ? "קבוצות" : null,
              r.room.isPool ? "חיצוני" : null,
            ].filter(Boolean),
            why: r.reasons,
          })),
        },
      };
    }

    case "build_placement_plan": {
      const daysOfWeek = (input.days_of_week as number[]) ?? [];
      const startMin = parseTime(String(input.start));
      const endMin = parseTime(String(input.end));
      const fromDate = input.from_date ? assertDate(String(input.from_date)) : todayIL();
      const activeDays = await ctx.days();
      const badDays = daysOfWeek.filter((d) => !activeDays.includes(d));
      if (badDays.length > 0) {
        return { result: { error: `הימים ${badDays.map((d) => DAY_NAMES[d]).join(", ")} אינם ימי פעילות` } };
      }
      const user = input.user_name ? findUser(ds, String(input.user_name)) : undefined;
      const sctx = buildScoringContext(ds, user?.id ?? "__new__", daysOfWeek[0] ?? 0, todayIL());

      const dayInputs = daysOfWeek.map((dow) => {
        let d = fromDate;
        while (dowOf(d) !== dow) d = addDays(d, 1);
        return { date: d, dayOfWeek: dow, startMin, endMin };
      });

      const plans = buildPlacementPlan((d) => ds.dayData(d), dayInputs, sctx, {
        preferences: {
          hasWindow: input.has_window === true || undefined,
          isLarge: input.is_large === true || undefined,
        },
      });

      return {
        result: {
          plans: plans.map((p) => ({
            label: p.label,
            quality_rank: p.quality,
            days: p.days.map((d) => ({
              day: DAY_NAMES[d.dayOfWeek],
              example_date: d.date,
              segments: d.segments.map((s) => `${s.roomName}: ${fmtRange(s.startMin, s.endMin)}`),
              gaps: d.gaps.map((g) => `${fmtRange(g.startMin, g.endMin)} — אין חדר`),
              contiguous: d.contiguous,
            })),
          })),
          note: "כדי לבצע שיבוץ — הצע propose_changes עם add_assignment לכל מקטע.",
        },
      };
    }

    case "get_user_schedule": {
      const user = findUser(ds, String(input.user_name));
      if (!user) return { result: { error: "מטפל/ת לא נמצא/ה" } };
      const fixed = ds.assignments
        .filter((a) => a.userId === user.id && (!a.effectiveTo || a.effectiveTo >= todayIL()))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin)
        .map((a) => ({
          assignment_id: a.id,
          day: DAY_NAMES[a.dayOfWeek],
          room: roomLabel(ds, a.roomId),
          range: fmtRange(a.startMin, a.endMin),
          kind: a.kind === "group" ? "קבוצה" : undefined,
        }));
      const week: unknown[] = [];
      const activeDays = await ctx.days();
      for (let i = 0; i < 7; i++) {
        const d = addDays(todayIL(), i);
        if (!activeDays.includes(dowOf(d))) continue;
        const schedule = computeDaySchedule(ds.dayData(d));
        const mine = userDayOccupancy(schedule, user.id);
        week.push({
          date: d,
          day: DAY_NAMES[dowOf(d)],
          slots: mine.flatMap(({ roomDay, occupant }) =>
            maskToRanges(ds.cfg, occupant.mask).map((r) => `${roomDay.room.name}: ${fmtRange(r.startMin, r.endMin)}`)
          ),
        });
      }
      return { result: { name: user.name, fixed_schedule: fixed, actual_week: week } };
    }

    case "list_users": {
      const tierLabel: Record<string, string> = { staff: "צוות קבוע", intern: "מתמחה", student: "סטודנט" };
      return {
        result: ds.users
          .filter((u) => u.isActive)
          .map((u) => ({
            name: u.name,
            role: u.role === "admin" ? "ניהול" : tierLabel[u.tier] ?? u.tier,
          })),
      };
    }

    case "list_rooms": {
      return {
        result: ds.rooms.map((r) => ({
          room: r.name,
          traits: [
            r.hasWindow ? "חלון" : null,
            r.hasSink ? "כיור" : null,
            r.isLarge ? "גדול" : null,
            r.isGroupRoom ? "קבוצות" : null,
            r.isPool ? "חיצוני" : null,
          ].filter(Boolean),
          availability: ds.availability
            .filter((a) => a.roomId === r.id)
            .map((a) => `${DAY_NAMES[a.dayOfWeek]} ${fmtMin(a.startMin)}–${fmtMin(a.endMin)}${a.effectiveTo ? ` (עד ${a.effectiveTo})` : ""}`),
        })),
      };
    }

    case "plan_room_vacancy": {
      const room = ds.rooms.find((r) => r.name.includes(String(input.room_name)));
      if (!room) return { result: { error: "חדר לא נמצא" } };
      const date = assertDate(String(input.date));
      const startMin = input.start ? parseTime(String(input.start)) : ds.cfg.dayStartMin;
      const endMin = input.end ? parseTime(String(input.end)) : ds.cfg.dayEndMin;
      const wanted = maskFor(ds.cfg, startMin, endMin);
      const schedule = computeDaySchedule(ds.dayData(date));
      const rd = schedule.rooms.find((r) => r.room.id === room.id);
      if (!rd || rd.openMask === 0) {
        return { result: { note: `${room.name} אינו פעיל בתאריך זה — אין מה לפנות` } };
      }

      const occupants = rd.occupants
        .filter((o) => (o.mask & wanted) !== 0)
        .map((o) => {
          const who = ds.users.find((u) => u.id === o.userId);
          const segments = maskToRanges(ds.cfg, o.mask & wanted).map((seg) => {
            const segMask = maskFor(ds.cfg, seg.startMin, seg.endMin);
            const targetCtx = buildScoringContext(ds, o.userId, dowOf(date), todayIL());
            const relocations = rankFreeRooms(schedule, segMask, targetCtx)
              .filter((r) => r.room.id !== room.id)
              .slice(0, 3);
            return {
              range: fmtRange(seg.startMin, seg.endMin),
              start: fmtMin(seg.startMin),
              end: fmtMin(seg.endMin),
              relocation_options: relocations.map((r) => ({ room: r.room.name, why: r.reasons })),
              can_relocate: relocations.length > 0,
            };
          });
          return {
            who: who?.name ?? "?",
            kind: o.kind === "group" ? "קבוצה — אין לעקור" : "רגיל",
            one_time: o.source === "booking",
            source_ref: o.source === "fixed" ? { assignment_id: o.refId } : { booking_id: o.refId },
            segments,
          };
        });

      return {
        result: {
          room: room.name,
          date,
          window: fmtRange(startMin, endMin),
          already_free: maskToRanges(ds.cfg, rd.freeMask & wanted).map((r) => fmtRange(r.startMin, r.endMin)),
          occupants,
          how_to_execute:
            "לפינוי חד־פעמי: propose_changes עם add_absence למי שמפנה (על החלון בחדר זה) + add_booking עבורו בחדר היעד. לפינוי קבוע: end_assignment או move_assignment.",
        },
      };
    }

    case "check_recurring_slot": {
      const room = ds.rooms.find((r) => r.name.includes(String(input.room_name)));
      if (!room) return { result: { error: "חדר לא נמצא" } };
      const res = checkRecurring(
        (d) => ds.dayData(d),
        room.id,
        input.from_date ? assertDate(String(input.from_date)) : todayIL(),
        Number(input.day_of_week),
        parseTime(String(input.start)),
        parseTime(String(input.end))
      );
      return {
        result: res.ok
          ? { ok: true, room: room.name }
          : {
              ok: false,
              conflicts: res.conflicts.map((c) => ({
                date: c.date,
                occupied_by: c.occupiedBy ? ds.users.find((u) => u.id === c.occupiedBy)?.name : "החדר סגור",
              })),
            },
      };
    }

    case "propose_changes": {
      const raw = (input.changes as Record<string, unknown>[]) ?? [];
      const summary = String(input.summary ?? "");
      const changes: ProposalChange[] = [];
      const description: string[] = [];

      for (const c of raw) {
        const op = String(c.op);
        if (op === "add_assignment" || op === "add_booking") {
          const user = findUser(ds, String(c.user_name ?? ""));
          const room = ds.rooms.find((r) => r.name.includes(String(c.room_name ?? "")));
          if (!user || !room) {
            return { result: { error: `לא נמצא מטפל/חדר: ${c.user_name} / ${c.room_name}` } };
          }
          const startMin = parseTime(String(c.start));
          const endMin = parseTime(String(c.end));
          if (op === "add_assignment") {
            const dow = Number(c.day_of_week);
            changes.push({
              op: "add_assignment",
              userId: user.id,
              roomId: room.id,
              dayOfWeek: dow,
              startMin,
              endMin,
              effectiveFrom: c.effective_from ? assertDate(String(c.effective_from)) : todayIL(),
              kind: c.kind === "group" ? "group" : "regular",
            });
            description.push(`${user.name} → ${room.name}, כל יום ${DAY_NAMES[dow]} ${fmtRange(startMin, endMin)} (קבוע)`);
          } else {
            const date = assertDate(String(c.date));
            changes.push({
              op: "add_booking",
              userId: user.id,
              roomId: room.id,
              date,
              startMin,
              endMin,
              kind: c.kind === "group" ? "group" : "regular",
            });
            description.push(`${user.name} → ${room.name}, ${date} ${fmtRange(startMin, endMin)} (חד־פעמי)`);
          }
        } else if (op === "end_assignment") {
          const id = String(c.assignment_id ?? "");
          const a = ds.assignments.find((x) => x.id === id);
          if (!a) return { result: { error: `שיבוץ ${id} לא נמצא` } };
          const effectiveTo = assertDate(String(c.effective_to ?? todayIL()));
          changes.push({ op: "end_assignment", assignmentId: id, effectiveTo });
          description.push(
            `סיום השיבוץ של ${ds.users.find((u) => u.id === a.userId)?.name} ב${roomLabel(ds, a.roomId)} (יום ${DAY_NAMES[a.dayOfWeek]}) החל מ־${effectiveTo}`
          );
        } else if (op === "add_absence") {
          const user = findUser(ds, String(c.user_name ?? ""));
          if (!user) return { result: { error: `לא נמצא מטפל: ${c.user_name}` } };
          const date = assertDate(String(c.date));
          const hasHours = c.start != null && c.end != null;
          const startMin = hasHours ? parseTime(String(c.start)) : null;
          const endMin = hasHours ? parseTime(String(c.end)) : null;
          changes.push({
            op: "add_absence",
            userId: user.id,
            dateFrom: date,
            dateTo: date,
            startMin,
            endMin,
            note: c.note ? String(c.note) : undefined,
          });
          description.push(
            `${user.name} מפנה את החדר ב־${date}${hasHours ? ` ${fmtRange(startMin!, endMin!)}` : " (יום שלם)"}${c.note ? ` — ${c.note}` : ""}`
          );
        } else if (op === "move_assignment") {
          const id = String(c.assignment_id ?? "");
          const a = ds.assignments.find((x) => x.id === id);
          if (!a) return { result: { error: `שיבוץ ${id} לא נמצא` } };
          const newRoom = c.new_room_name
            ? ds.rooms.find((r) => r.name.includes(String(c.new_room_name)))
            : undefined;
          changes.push({
            op: "move_assignment",
            assignmentId: id,
            newRoomId: newRoom?.id,
            newDayOfWeek: c.new_day_of_week != null ? Number(c.new_day_of_week) : undefined,
          });
          description.push(
            `העברת השיבוץ של ${ds.users.find((u) => u.id === a.userId)?.name}${newRoom ? ` ל${newRoom.name}` : ""}${c.new_day_of_week != null ? ` ליום ${DAY_NAMES[Number(c.new_day_of_week)]}` : ""}`
          );
        }
      }

      if (changes.length === 0) return { result: { error: "לא נוצרו שינויים תקינים" } };
      return {
        result: { ok: true, note: "ההצעה מוצגת למנהל לאישור — אין לבצע שינויים נוספים עד להחלטתו." },
        proposal: { summary, changes, description },
      };
    }

    default:
      return { result: { error: `כלי לא מוכר: ${name}` } };
  }
}
