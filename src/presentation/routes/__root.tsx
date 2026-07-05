import { useState } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../styles.css?url";
import { getSessionFn } from "../server/session";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wikain" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
