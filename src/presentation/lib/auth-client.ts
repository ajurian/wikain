import { createAuthClient } from "better-auth/react";

/**
 * The browser-safe BetterAuth client (STACK-4). It talks to the `/api/auth/*` handler route over HTTP —
 * no server secret is bundled here (only the auth *client* is client-safe; the server `auth` instance in
 * `server/composition.ts` stays off the client). `baseURL` defaults to the page origin, so no config.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
