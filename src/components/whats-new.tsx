"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { markVersionSeen } from "@/actions/account";
import type { ChangelogEntry } from "@/lib/version";

/**
 * After an automatic update: a one-time dialog listing what changed.
 * silent=true (fresh users) just records the version without showing anything.
 */
export function WhatsNew({
  version,
  entries,
  silent,
}: {
  version: string;
  entries: ChangelogEntry[];
  silent: boolean;
}) {
  const [open, setOpen] = useState(!silent);

  useEffect(() => {
    if (silent) void markVersionSeen(version);
  }, [silent, version]);

  if (silent || !open) return null;

  function dismiss() {
    setOpen(false);
    void markVersionSeen(version);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" onClick={dismiss}>
      <Card className="w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="font-bold">המערכת התעדכנה 🎉</h2>
              <p className="text-xs text-muted-foreground" dir="ltr">v{version}</p>
            </div>
          </div>
          <button onClick={dismiss} className="rounded-lg p-1 hover:bg-muted" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-72 space-y-3 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.version}>
              {entries.length > 1 && (
                <p className="mb-1 text-xs font-semibold text-muted-foreground" dir="ltr">
                  v{e.version} · {e.date}
                </p>
              )}
              <ul className="space-y-1 text-sm">
                {e.notes.map((n, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Button className="w-full" onClick={dismiss}>
          הבנתי, תודה
        </Button>
      </Card>
    </div>
  );
}
