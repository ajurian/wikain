/**
 * BetterAuth adapter integration (STACK-4) against a real, migrated pglite database — no HTTP, driving
 * `auth.api` directly. Proves email+password sign-up mints a UUID principal and that two accounts are
 * isolated (the multi-tenant guarantee every `user_id`-scoped store relies on).
 */
import { describe, expect, it } from "vitest";
import { makeAuth } from "./auth.js";
import { makePgliteDb } from "../db/pglite.js";

const SECRET = "test-secret-please-ignore-0123456789abcdef";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function makeTestAuth() {
  return makeAuth(await makePgliteDb(), { secret: SECRET });
}

/** Sign up a user and return their id + the session cookie for a follow-up getSession. */
async function signUp(auth: Awaited<ReturnType<typeof makeTestAuth>>, email: string) {
  const res = await auth.api.signUpEmail({
    body: { email, password: "hunter2-strong-pw", name: email.split("@")[0]! },
    asResponse: true,
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? ""; // "better-auth.session_token=..."
  return cookie;
}

describe("BetterAuth adapter (pglite)", () => {
  it("STACK-4: sign-up mints a UUID user id, resolvable from the session cookie", async () => {
    const auth = await makeTestAuth();
    const cookie = await signUp(auth, "amihan@example.com");

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session).not.toBeNull();
    expect(session!.user.id).toMatch(UUID);
  });

  it("multi-tenant: two sign-ups get distinct principals", async () => {
    const auth = await makeTestAuth();
    const cookieA = await signUp(auth, "a@example.com");
    const cookieB = await signUp(auth, "b@example.com");

    const a = await auth.api.getSession({ headers: new Headers({ cookie: cookieA }) });
    const b = await auth.api.getSession({ headers: new Headers({ cookie: cookieB }) });
    expect(a!.user.id).not.toBe(b!.user.id);
  });
});
