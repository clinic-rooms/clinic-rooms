import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { clinicSettings } from "@/lib/db/schema";
import { openSecret } from "@/lib/secretbox";

export type AnthropicKeyInfo = {
  key: string | null;
  /** where the active key comes from — the env var wins over the in-app one */
  source: "env" | "app" | null;
};

/**
 * The active Anthropic API key: ANTHROPIC_API_KEY env var if set, otherwise
 * the key the admin pasted in the settings screen (stored encrypted in the DB).
 */
export const getAnthropicKey = cache(async (): Promise<AnthropicKeyInfo> => {
  if (process.env.ANTHROPIC_API_KEY) {
    return { key: process.env.ANTHROPIC_API_KEY, source: "env" };
  }
  try {
    const [row] = await db
      .select({ sealed: clinicSettings.anthropicApiKey })
      .from(clinicSettings)
      .limit(1);
    if (row?.sealed) {
      const key = openSecret(row.sealed);
      if (key) return { key, source: "app" };
    }
  } catch {
    // fresh DB / missing table — just report "no key"
  }
  return { key: null, source: null };
});
