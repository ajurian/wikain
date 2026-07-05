import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./composition.js";

/** The minimal, serializable session shape the router guard + app-shell chrome need (STACK-4). */
export interface SessionView {
  userId: string;
  name: string;
  email: string;
}

/**
 * Resolve the current session for `__root.beforeLoad` (route guards) and the app-shell user chrome.
 * Returns `null` when unauthenticated — unlike the server functions, a missing session is not an error
 * here (it is exactly what the guard checks to redirect to `/signin`). Reads the cookie server-side
 * (NET-7); only the trimmed `{ userId, name, email }` crosses to the client.
 */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionView | null> => {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session) return null;
    return {
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
  },
);
