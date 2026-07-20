/*
 * DEV-ONLY in-app dev tools (replaces the `WIKAIN_DEV_TIER` env pin). A fixed launcher opens a small
 * instrument panel that pins the review tier and flips debug toggles by writing the
 * `wikain-dev-overrides` cookie the server reads at the composition edge (`server/devOverrides.ts`).
 *
 * Why a cookie + query invalidation rather than the old env var: the env pin needed a dev-server
 * restart to take effect and could not be changed per-browser. This changes behaviour LIVE — writing
 * the cookie and invalidating the two review queries re-runs the server flow with the new overrides.
 *
 * This module is gated by `import.meta.env.DEV` at its one call site (`__root.tsx`), so Vite
 * tree-shakes the whole thing (and its cookie writes) out of the production bundle. The panel is mono
 * throughout — it is the instrument being configured, not a learner surface.
 */
import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  DEV_OVERRIDES_COOKIE,
  DEV_OVERRIDES_DEFAULT,
  parseDevOverrides,
  readDevOverridesCookie,
  serializeDevOverrides,
  type DevOverrides,
} from "@/lib/devOverrides";
import type { ReviewTier } from "~/domain/review/review.js";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — a dev convenience, not a durable setting.
const TIER_OPTIONS: readonly (ReviewTier | "auto")[] = [
  "auto",
  "recognition",
  "cloze",
  "cued",
  "free",
];

const monoLabel = "font-mono text-[10.5px] uppercase tracking-wide text-ink-faint";

/*
 * A tiny external store OVER the cookie, so the panel has one source of truth and stays hydration-safe
 * without a setState-in-effect: the server snapshot is the default (no `document.cookie` there), the
 * client snapshot is the parsed cookie. `getSnapshot` caches by the raw cookie string so it returns a
 * stable object reference between changes (useSyncExternalStore requires that).
 */
const listeners = new Set<() => void>();
let snapshotRaw: string | null | undefined = undefined;
let snapshotValue: DevOverrides = DEV_OVERRIDES_DEFAULT;

function cookieSnapshot(): DevOverrides {
  const raw = readDevOverridesCookie(document.cookie);
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotValue = parseDevOverrides(raw);
  }
  return snapshotValue;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function writeDevOverrides(next: DevOverrides): void {
  document.cookie = `${DEV_OVERRIDES_COOKIE}=${serializeDevOverrides(next)};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
  snapshotRaw = undefined; // force a recompute on the next read
  for (const cb of listeners) cb();
}

export function DevTools() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const overrides = useSyncExternalStore(
    subscribe,
    cookieSnapshot,
    () => DEV_OVERRIDES_DEFAULT,
  );

  // Any non-default value means the dev tools are actively bending behaviour — mark the launcher.
  const active =
    overrides.tier !== undefined || overrides.includeNotDue || overrides.freezeFsrs;

  function apply(next: DevOverrides) {
    writeDevOverrides(next);
    // The overrides feed the batch build AND every per-card prompt/grade — invalidate both so the
    // change takes effect without a reload. `resetQueries` on the session forces a fresh batch build.
    void queryClient.resetQueries({ queryKey: ["review-session"] });
    void queryClient.invalidateQueries({ queryKey: ["review-prompt"] });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open dev tools"
        className={cn(
          // `bottom-20` on mobile clears the app-shell bottom tab-nav (h-16); `sm:bottom-4` drops it
          // to the corner on desktop, where the nav is top-right.
          "fixed right-3 bottom-20 z-[100] flex size-10 items-center justify-center rounded-full border bg-card text-ink-soft transition-colors hover:text-ink sm:bottom-4",
          active ? "border-marigold-deep text-marigold-deep" : "border-line-strong",
        )}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div className="fixed right-3 bottom-20 z-[100] w-72 rounded-xl border border-line-strong bg-card p-4 text-ink sm:bottom-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-xs font-medium tracking-wide text-ink">
          dev tools
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close dev tools"
          className="text-ink-faint transition-colors hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className={monoLabel}>review tier</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={overrides.tier ?? "auto"}
            onValueChange={(v) => {
              if (v === "") return; // radix emits "" when the active item is re-clicked — ignore.
              const tier = v === "auto" ? undefined : (v as ReviewTier);
              apply({ ...overrides, ...(tier ? { tier } : { tier: undefined }) });
            }}
            className="flex-wrap"
          >
            {TIER_OPTIONS.map((t) => (
              <ToggleGroupItem
                key={t}
                value={t}
                className="font-mono text-[11px] lowercase"
              >
                {t}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2 border-t border-line pt-3">
          <ToggleRow
            label="show cards even when not due"
            pressed={overrides.includeNotDue}
            onPressedChange={(p) => apply({ ...overrides, includeNotDue: p })}
          />
          <ToggleRow
            label="freeze FSRS scheduling"
            pressed={overrides.freezeFsrs}
            onPressedChange={(p) => apply({ ...overrides, freezeFsrs: p })}
          />
        </div>

        <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
          overrides apply live — a review already on screen refreshes on the next card.
        </p>
      </div>
    </div>
  );
}

/** One labelled boolean row: the mono description on the left, an on/off Toggle on the right. */
function ToggleRow({
  label,
  pressed,
  onPressedChange,
}: {
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="font-mono text-[11px] text-ink-soft">{label}</span>
      <Toggle
        variant="outline"
        size="sm"
        pressed={pressed}
        onPressedChange={onPressedChange}
        aria-label={label}
        className="font-mono text-[10.5px] uppercase data-[state=on]:border-marigold-deep data-[state=on]:bg-marigold-wash data-[state=on]:text-marigold-deep"
      >
        {pressed ? "on" : "off"}
      </Toggle>
    </label>
  );
}
