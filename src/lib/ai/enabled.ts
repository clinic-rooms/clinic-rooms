import "server-only";
import { db } from "@/lib/db";
import { clinicSettings } from "@/lib/db/schema";
import { getAnthropicKey } from "./key";

/** Admin master switch for AI features (defaults to on if no settings row). */
export async function getAiEnabled(): Promise<boolean> {
  const [row] = await db.select({ aiEnabled: clinicSettings.aiEnabled }).from(clinicSettings).limit(1);
  return row?.aiEnabled ?? true;
}

/** AI is usable only when both the admin switch is on AND an API key is set. */
export async function aiAvailable(): Promise<boolean> {
  const { key } = await getAnthropicKey();
  if (!key) return false;
  return getAiEnabled();
}
