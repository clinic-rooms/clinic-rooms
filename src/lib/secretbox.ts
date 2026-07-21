import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Small AES-256-GCM box for values the admin pastes in-app (e.g. the Anthropic
 * API key). The encryption key is derived from BETTER_AUTH_SECRET, which every
 * install already has — so a database leak alone does not expose the secrets.
 */

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** Reverses sealSecret. Returns null for malformed/tampered input. */
export function openSecret(sealed: string): string | null {
  try {
    const [v, ivB, tagB, dataB] = sealed.split(".");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB, "base64url"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
