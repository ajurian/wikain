import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The public (unauthenticated-only) pathless layout — the mirror of `_authenticated`. `/signin` and
 * `/signup` live under it, so an already-signed-in learner can never see a sign-in form: they are sent
 * straight to where they belong.
 *
 * Where that is depends on the SAME `onboarded` fact the `_onboarded` guard reads (spec/09 SEED-1), and
 * deciding it here rather than in `signin.tsx` keeps it out of a bounce: sending a half-onboarded user to
 * `/` would only have `_onboarded` redirect them onward to `/onboarding`.
 *
 * `/api/auth/*` stays outside every layout — the BetterAuth handler must remain reachable unguarded.
 */
export const Route = createFileRoute("/_public")({
  beforeLoad: ({ context }) => {
    if (context.session) {
      throw redirect({ to: context.session.onboarded ? "/" : "/onboarding" });
    }
  },
  component: () => <Outlet />,
});
