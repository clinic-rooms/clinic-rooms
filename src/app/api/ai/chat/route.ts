import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getClinicSettings, getScheduleConfig } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import { adminChatSystemPrompt } from "@/lib/ai/prompts";
import { toolDefinitions, executeTool, createToolContext, type ProposalCard } from "@/lib/ai/tools";
import { aiAvailable } from "@/lib/ai/enabled";
import { getAnthropicKey } from "@/lib/ai/key";

export const maxDuration = 60;

const MODEL = process.env.AI_CHAT_MODEL || "claude-sonnet-4-5";
const MAX_ROUNDS = 8;

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Agentic loop with ndjson event stream:
 *   {type:"tool", name}  — a tool round started (UI shows "בודק זמינות…")
 *   {type:"text", text}  — final assistant text
 *   {type:"proposal", proposal} — change-set card for admin confirmation
 *   {type:"error", message} / {type:"done"}
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await aiAvailable())) {
    return Response.json({
      offline: true,
      message: "העוזר החכם כבוי כרגע. אפשר להפעיל אותו מהגדרות הניהול. כל שאר המערכת עובדת כרגיל.",
    });
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return new Response("Bad request", { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: (await getAnthropicKey()).key ?? undefined });
  const settings = await getClinicSettings();
  const cfg = await getScheduleConfig();
  const system = adminChatSystemPrompt(settings.clinicName, todayIL(), settings.activeDays, cfg);
  const ctx = createToolContext();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const convo: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const proposals: ProposalCard[] = [];

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 2000,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            tools: toolDefinitions,
            messages: convo,
          });

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
            const text = response.content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n");
            emit({ type: "text", text });
            for (const p of proposals) emit({ type: "proposal", proposal: p });
            emit({ type: "done" });
            controller.close();
            return;
          }

          convo.push({ role: "assistant", content: response.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: "tool", name: tu.name });
            try {
              const { result, proposal } = await executeTool(
                ctx,
                tu.name,
                tu.input as Record<string, unknown>
              );
              if (proposal) proposals.push(proposal);
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(result),
              });
            } catch (e) {
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify({ error: e instanceof Error ? e.message : "שגיאה" }),
                is_error: true,
              });
            }
          }
          convo.push({ role: "user", content: results });
        }

        emit({ type: "text", text: "הבדיקה מורכבת מדי — נסו לפצל את השאלה לשלבים קטנים יותר." });
        emit({ type: "done" });
        controller.close();
      } catch (e) {
        console.error(e);
        emit({
          type: "error",
          message: "שגיאה בעוזר החכם — נסו שוב. אם זה חוזר, בדקו את מפתח ה-API.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
