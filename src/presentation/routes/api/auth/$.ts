import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../server/composition.js";

/**
 * The BetterAuth catch-all HTTP handler (STACK-4): every `/api/auth/*` request (sign-in, sign-up,
 * sign-out, get-session) is delegated to the server `auth.handler`. Server-only — no `component`, so it
 * never enters the client bundle and the auth secret / DB stay off the client (NET-7). The auth *client*
 * (`lib/auth-client.ts`) calls these endpoints over HTTP.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
