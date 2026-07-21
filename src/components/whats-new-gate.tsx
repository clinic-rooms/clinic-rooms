import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { APP_VERSION, entriesSince } from "@/lib/version";
import { WhatsNew } from "@/components/whats-new";

/**
 * Server gate for the after-update "what's new" dialog.
 * - fresh user (null) → record the current version silently, no dialog
 * - older version   → show the entries they missed
 */
export async function WhatsNewGate({ userId }: { userId: string }) {
  const [row] = await db
    .select({ lastSeenVersion: t.user.lastSeenVersion })
    .from(t.user)
    .where(eq(t.user.id, userId));
  const lastSeen = row?.lastSeenVersion ?? null;
  if (lastSeen === APP_VERSION) return null;

  const entries = lastSeen === null ? [] : entriesSince(lastSeen);
  return <WhatsNew version={APP_VERSION} entries={entries} silent={entries.length === 0} />;
}
