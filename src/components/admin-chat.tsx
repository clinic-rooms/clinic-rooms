"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Sparkles, Check, Wrench } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { applyProposal, type ProposalChange } from "@/actions/admin-schedule";

type Proposal = { summary: string; changes: ProposalChange[]; description: string[] };

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; proposals?: Proposal[] };

const TOOL_LABELS: Record<string, string> = {
  get_day_schedule: "קורא את לוח היום…",
  get_week_overview: "סוקר את השבוע…",
  find_free_rooms: "בודק זמינות חדרים…",
  build_placement_plan: "בונה תוכניות שיבוץ…",
  get_user_schedule: "בודק לו״ז של מטפל/ת…",
  list_users: "עובר על רשימת הצוות…",
  list_rooms: "בודק את החדרים…",
  check_recurring_slot: "בודק זמינות קבועה…",
  propose_changes: "מנסח הצעת שינויים…",
};

const SUGGESTIONS = [
  "איזה חדרים פנויים מחר בבוקר?",
  "אני מגייס עובד חדש לשלושה בקרים — איפה אפשר לשבץ אותו?",
  "סטודנט שיכול רק בימים א' ו-ד' אחה\"צ — איפה לשבץ?",
  "איזה חדר עם חלון פנוי ביום שלישי ב-10:00?",
  "מה מצב התפוסה השבוע?",
];

export function AdminChat({ hasApiKey }: { hasApiKey: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activity]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setInput("");
    const nextMessages: Msg[] = [...messages, { role: "user", text: content }];
    setMessages(nextMessages);
    setBusy(true);
    setActivity("חושב…");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.text)
            .map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      if (!res.ok) throw new Error("bad status");
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const j = await res.json();
        setMessages((prev) => [...prev, { role: "assistant", text: j.message ?? "שגיאה" }]);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      const proposals: Proposal[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "tool") setActivity(TOOL_LABELS[ev.name] ?? "בודק…");
          else if (ev.type === "text") finalText = ev.text;
          else if (ev.type === "proposal") proposals.push(ev.proposal);
          else if (ev.type === "error") finalText = ev.message;
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: finalText, proposals: proposals.length ? proposals : undefined },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "שגיאה בתקשורת עם העוזר — נסו שוב." },
      ]);
    } finally {
      setBusy(false);
      setActivity(null);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-180px)] max-w-2xl flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-xl bg-accent p-1.5 text-accent-foreground">
          <Sparkles size={16} />
        </span>
        <div>
          <h1 className="font-bold leading-tight">העוזר החכם</h1>
          <p className="text-xs text-muted-foreground">שאלות שיבוץ, זמינות ותכנון — עם ביצוע באישור שלך</p>
        </div>
      </div>

      {!hasApiKey && (
        <Card className="mb-3 border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
          העוזר החכם כבוי כרגע. אפשר להפעיל אותו במסך ההגדרות. שאר המערכת עובדת כרגיל.
        </Card>
      )}

      <div className="grid-scroll flex-1 space-y-3 overflow-y-auto pb-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-6">
            <p className="text-center text-sm text-muted-foreground">אפשר לשאול למשל:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card"
              )}
            >
              {m.text}
              {m.role === "assistant" &&
                m.proposals?.map((p, j) => <ProposalCardView key={j} proposal={p} />)}
            </div>
          </div>
        ))}

        {activity && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
              <Wrench size={14} className="animate-pulse" />
              {activity}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-border pt-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאלו את העוזר החכם…"
          disabled={busy || !hasApiKey}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim() || !hasApiKey} aria-label="שליחה">
          {busy ? <Spinner /> : <Send size={17} className="-scale-x-100" />}
        </Button>
      </form>
    </div>
  );
}

function ProposalCardView({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);

  function confirm() {
    startTransition(async () => {
      const res = await applyProposal(proposal.changes);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setApplied(true);
      toast.success("השינויים בוצעו ונשלחו התראות למושפעים");
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/40 bg-accent/20 p-3">
      <p className="mb-1 text-sm font-bold">{proposal.summary}</p>
      <ul className="mb-2 space-y-0.5 text-xs text-muted-foreground">
        {proposal.description.map((d, i) => (
          <li key={i}>• {d}</li>
        ))}
      </ul>
      {applied ? (
        <p className="flex items-center gap-1 text-sm font-medium text-primary">
          <Check size={15} />
          בוצע
        </p>
      ) : (
        <Button size="sm" onClick={confirm} disabled={pending}>
          {pending ? <Spinner /> : <Check size={15} />}
          אישור וביצוע
        </Button>
      )}
    </div>
  );
}
