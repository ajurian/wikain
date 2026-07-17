/*
 * /words — the learner's word list: mastery, live retrievability vs the
 * counter floor (CNT-2/3), counted-status. WIRED to the real read-model.
 */
import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { DURATION, EASE } from "@/lib/motion";
import { ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { MasteryChip } from "@/components/mastery-chip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { wordsListFn } from "@/server/words";
import { COUNTER_R_FLOOR } from "~/domain/constants.js";
import type { MasteryState } from "~/domain/mastery/card.js";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_onboarded/words/")({
  component: WordsBrowser,
});

const FILTERS: (MasteryState | "All")[] = ["All", "Seen", "Recognized", "Productive", "Fluent"];

function WordsBrowser() {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  // Per-word read-model (CNT-2/3): counted-status + live retrievability off the persisted cards.
  const { data } = useQuery({ queryKey: ["words-list"], queryFn: () => wordsListFn() });
  const all = data?.words ?? [];
  // `New` filtering + the mastery filter stay client-side (the read-model returns every carded word).
  const words = all.filter(
    (w) => w.mastery !== "New" && (filter === "All" || w.mastery === filter),
  );

  return (
    <AppShell>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE }}
        className="space-y-5"
      >
        <h1 className="text-xl font-semibold text-ink">Your words</h1>

        {/*
         * A real toggle group, not styled buttons: this is one exclusive choice, so it needs the
         * roving focus and pressed state the primitive provides.
         */}
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(f) => {
            // The primitive emits "" when the active item is re-pressed; the list always has a filter.
            if (f) setFilter(f as (typeof FILTERS)[number]);
          }}
          variant="outline"
          size="sm"
          // Separate tags, not a joined segmented control (the default spacing={0}).
          spacing={2}
          className="w-full flex-wrap"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f} value={f} aria-label={`Show ${f} words`}>
              {f === "All" ? "All" : f.toLowerCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {words.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">
            {all.length === 0
              ? "No words yet — start a session to begin building your list."
              : "No words at this rung yet."}
          </p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-paper-raised">
            {words.map((w) => (
              <Link
                key={w.senseId}
                to="/words/$wordId"
                params={{ wordId: w.senseId }}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper-sunken/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-serif text-lg text-ink">{w.lemma}</span>
                    {/* counted in "words you can use" (CNT-2) — the marigold counted-dot */}
                    {w.counted ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-marigold"
                        title="In your usable words"
                      />
                    ) : null}
                  </div>
                  {/* live retrievability vs COUNTER_R_FLOOR (CNT-3) */}
                  <div className="mt-1.5 h-1 w-24 overflow-hidden rounded-sm bg-paper-sunken">
                    <div
                      className={cn("h-full rounded-sm", w.aboveFloor ? "bg-moss" : "bg-terracotta")}
                      style={{ width: `${w.retrievability * 100}%` }}
                    />
                  </div>
                </div>
                <MasteryChip state={w.mastery} />
                <ChevronRight className="size-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-ink-faint">
          The marigold dot marks words in your usable count — 2+ real sentences on separate days, and
          memory strength still above {Math.round(COUNTER_R_FLOOR * 100)}%.
        </p>
      </motion.div>
    </AppShell>
  );
}
