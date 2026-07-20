import { Suspense, lazy, useState } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import icon from "../favicon.ico?url";
import { getSessionFn } from "@/server/session";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";

// DEV-only dev tools. Lazy + DEV-gated: in a production build `import.meta.env.DEV` folds to `false`, so
// the `import()` sits in a dead branch and Rollup never emits the chunk — the whole panel (and its cookie
// logic) is fully excluded from the prod client bundle. A plain static import + dead ternary was NOT
// enough (the module's top-level store state marks it as side-effectful, defeating tree-shaking).
const DevTools = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/dev-tools").then((m) => ({ default: m.DevTools })),
    )
  : null;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wikain" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: icon },
    ],
  }),
  // Resolve the session ONCE at the root (STACK-4): the `_authenticated` layout reads it to guard the
  // app routes, and the app-shell chrome reads the same value. One fetch shared down the tree.
  beforeLoad: async () => ({ session: await getSessionFn() }),
  component: RootComponent,
});

function RootComponent() {
  // One QueryClient per request on the server, stable across renders on the client (STACK-2).
  const [queryClient] = useState(() => new QueryClient());
  return (
    // suppressHydrationWarning: the pre-paint script below sets `class`/`color-scheme` on <html> before
    // hydration, so the client tree intentionally differs from the server-rendered bare <html>.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Flash-free theme: resolve + apply the theme class before the body paints (incl. signed-out). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Outlet />
            {DevTools ? (
              <Suspense fallback={null}>
                <DevTools />
              </Suspense>
            ) : null}
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
