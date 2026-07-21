import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username, admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getBaseUrl } from "@/lib/base-url";

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // no self sign-up — the admin creates users
    disableSignUp: true,
  },
  session: {
    // stay logged in until explicit logout: year-long session, sliding renewal daily
    expiresIn: 60 * 60 * 24 * 365,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min — spare Neon a session lookup on every request
    },
  },
  user: {
    additionalFields: {
      // tier is intentionally NOT listed here — it must never reach the client session.
      color: { type: "string", defaultValue: "#0d9488" },
      mustSetPassword: { type: "boolean", defaultValue: true },
      isActive: { type: "boolean", defaultValue: true },
    },
  },
  // nextCookies must be last — lets server actions set the session cookie
  plugins: [username(), admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
