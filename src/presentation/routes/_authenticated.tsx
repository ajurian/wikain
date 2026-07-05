import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The authenticated pathless layout (STACK-4). Every app route lives under it, so this ONE `beforeLoad`
 * guards them all: no session (resolved once by `__root.beforeLoad`) → redirect to `/signin`. `/signin`,
 * `/signup`, and the `/api/auth/*` handler stay outside it and remain public. Pathless (`_authenticated`
 * adds no URL segment), so the child paths are unchanged (`/`, `/review`, `/words`, …).
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/signin" });
  },
  component: () => <Outlet />,
});
