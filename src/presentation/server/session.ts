import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { readPlacementProfile } from "~/application/placement/readPlacementProfile.js";
import { auth, placementProfileDeps } from "./composition.js";

/** The minimal, serializable session shape the router guards + app-shell chrome need (STACK-4). */
export interface SessionView {
  userId: string;
  name: string;
  email: string;
  /**
   * spec/09 SEED-1: has the learner finished onboarding? The `_onboarded` layout redirects to
   * `/onboarding` when false, `/onboarding` itself redirects to `/` when true, and `_public` picks its
   * post-auth landing route from it. Only the boolean crosses to the client — never the timestamp.
   */
  onboarded: boolean;
}

/**
 * Resolve the current session for `__root.beforeLoad` (route guards) and the app-shell user chrome.
 * Returns `null` when unauthenticated — unlike the server functions, a missing session is not an error
 * here (it is exactly what the guard checks to redirect to `/signin`). Reads the cookie server-side
 * (NET-7); only the trimmed `{ userId, name, email, onboarded }` crosses to the client.
 *
 * `onboarded` is resolved in THIS handler rather than by a second server function: `__root.beforeLoad`
 * already calls `getSessionFn` on every navigation, so folding the profile read in here costs one extra
 * DB query but NO extra round-trip — and it keeps the two guard predicates on one consistent snapshot
 * (a separate fetch could interleave with `completeOnboardingFn` and bounce a just-finished user).
 */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionView | null> => {
    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session) return null;
    const profile = await readPlacementProfile({ userId: session.user.id }, placementProfileDeps());
    return {
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      onboarded: profile.onboardedAt !== null,
    };
  },
);
