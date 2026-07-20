/**
 * The BetterAuth server instance (STACK-4) — the single place the auth library is constructed. The
 * `db` handle is injected (pglite in tests, Neon in prod), so this module reads no env of its own; the
 * secret/baseURL are passed by the (server-only) composition root that reads them (NET-7). BetterAuth
 * itself lives ONLY here in infrastructure; use-cases receive a plain `userId: string`, never this.
 *
 * `advanced.database.generateId` returns a v4 uuid for the id columns (authSchema declares them
 * `uuid`) — matching the app tables' `user_id` and needing no DB-side default. (The string form
 * `"uuid"` is silently unsupported in this better-auth version — a function is required.)
 * `tanstackStartCookies()` MUST be the last plugin so the session cookie is set on sign-in/up.
 */
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { DrizzleDb } from "../persistence/drizzleCardRepository.js";
import { account, session, user, verification } from "../db/authSchema.js";

export interface AuthConfig {
  /** Signing secret (BETTER_AUTH_SECRET). Read server-side by the composition root. */
  secret: string;
  /** Public base URL (BETTER_AUTH_URL). Optional for direct `auth.api` calls (tests). */
  baseURL?: string;
}

export function makeAuth(db: DrizzleDb, config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: { enabled: true },
    advanced: {
      database: { generateId: () => randomUUID() },
      disableOriginCheck: process.env.NODE_ENV === "development",
    },
    plugins: [tanstackStartCookies()], // last plugin (sets the session cookie)
  });
}

export type Auth = ReturnType<typeof makeAuth>;
