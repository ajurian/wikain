import { useEffect } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { readSettingsFn } from "@/server/settings";
import { useTheme } from "@/lib/theme";

/**
 * The authenticated pathless layout (STACK-4). Every app route lives under it, so this ONE `beforeLoad`
 * guards them all: no session (resolved once by `__root.beforeLoad`) → redirect to `/signin`. `/signin`,
 * `/signup` (under `_public`), and the `/api/auth/*` handler stay outside it and remain public. Pathless
 * (`_authenticated` adds no URL segment), so the child paths are unchanged (`/`, `/review`, `/words`, …).
 *
 * It re-returns the session so descendants (`_onboarded`, `/onboarding`) type it as non-null rather than
 * re-asserting the narrowing this guard already proved.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/signin" });
    return { session: context.session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useThemeFromSettings();
  return <Outlet />;
}

/**
 * Reconcile the persisted `settings.theme` into the client ThemeProvider. This runs only under the auth
 * guard (so `readSettingsFn`, which resolves `userId` server-side, never 401s), and it is what carries the
 * preference to a fresh device where the `wikain-theme` cookie is absent. Converges in one pass: applying
 * the DB value makes `theme === dbTheme`, so the effect no-ops thereafter (no fight with local edits).
 */
function useThemeFromSettings(): void {
  const { theme, setTheme } = useTheme();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => readSettingsFn() });
  const dbTheme = data?.theme;
  useEffect(() => {
    if (dbTheme !== undefined && dbTheme !== theme) setTheme(dbTheme);
  }, [dbTheme, theme, setTheme]);
}
