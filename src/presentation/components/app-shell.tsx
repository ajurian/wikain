import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, House, Settings } from "lucide-react";
import { Wordmark } from "./wordmark";
import { usableCounterFn } from "@/server/counter";
import { useSession } from "@/lib/auth-client";

const NAV = [
  { to: "/", label: "Home", icon: House },
  { to: "/words", label: "Words", icon: BookOpenText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * App chrome for the main surfaces: sticky top bar + bottom tab nav on mobile,
 * inline top nav on sm+. The review session is chromeless (focus mode) and
 * does not use this shell.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // The same wired counter the dashboard headline reads (CNT-2); shared query key dedupes the fetch.
  const { data: counter } = useQuery({
    queryKey: ["usable-counter"],
    queryFn: () => usableCounterFn(),
  });

  // The authenticated user (STACK-4). The initial is the identity chrome; it links to /settings, where
  // the account card + sign-out live.
  const { data: session } = useSession();
  const initial = session?.user.name?.trim()?.[0]?.toUpperCase() ?? "";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
          <Link to="/" aria-label="Wikain home">
            <Wordmark className="text-xl" />
          </Link>
          <div className="flex items-center gap-5">
            <nav className="hidden items-center gap-4 sm:flex">
              {NAV.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-sm font-medium text-ink-soft hover:text-ink [&.active]:text-ink"
                  activeOptions={{ exact: to === "/" }}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {/* compact counter — the headline value, always visible (CNT-2) */}
            <span className="text-sm text-ink-soft">
              <span className="font-mono text-sm font-medium text-ink tabular-nums">
                {counter?.count ?? 0}
              </span>{" "}
              usable
            </span>
            {/* identity chrome — the user's initial, linking to the account card + sign-out (STACK-4) */}
            {initial && (
              <Link
                to="/settings"
                aria-label="Account and settings"
                className="flex size-8 items-center justify-center rounded-full bg-ink/10 text-sm font-semibold text-ink hover:bg-ink/15"
              >
                {initial}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-24 sm:pb-10">{children}</main>

      {/* bottom tab nav — mobile only */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised sm:hidden">
        <div className="mx-auto flex max-w-xl items-stretch justify-around">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-ink-faint [&.active]:text-ink"
            >
              <Icon className="size-5" strokeWidth={1.5} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
