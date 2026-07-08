import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The onboarded-only pathless layout (spec/09 SEED-1). Nested INSIDE `_authenticated` (which has already
 * guaranteed a session), it makes onboarding the mandatory next step after auth: every app surface — `/`,
 * `/review`, `/words`, `/settings` — bounces to `/onboarding` until the learner finishes.
 *
 * `/onboarding` deliberately sits OUTSIDE this layout (as a direct child of `_authenticated`) and carries
 * the inverse guard. That is what keeps the two redirects from forming a loop, and it is why this is a
 * nested layout rather than a `location.pathname` test inside `_authenticated`.
 *
 * `context.session` is typed non-null here: `_authenticated.beforeLoad` runs first and re-returns it.
 */
export const Route = createFileRoute("/_authenticated/_onboarded")({
  beforeLoad: ({ context }) => {
    if (!context.session.onboarded) throw redirect({ to: "/onboarding" });
  },
  component: () => <Outlet />,
});
