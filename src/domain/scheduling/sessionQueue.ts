import type { Card } from "../mastery/card.js";

/**
 * LOOP-1 step 1 (spec/11): surface the due words for a session as an ordered list of `senseId`s the
 * loop walks one at a time through `runReviewPass`. Pure ordering over data — no I/O (ARCH-2/COMP-3),
 * like `tier.ts` / `onRampLedger.ts`.
 *
 * Ordering:
 *  - **Due filter** — only cards with `fsrs.due <= now` (inclusive; a freshly seeded card has
 *    `due ≈ now` and so is due). Mirrors `seedIntroductions`' due-backlog check.
 *  - **Reviews** — the due cards NOT in `introSenseIds`, ordered by `fsrs.due` ascending
 *    (most-overdue-first — the sensible FSRS-surfacing default; order among due cards is not otherwise
 *    normative), tiebroken by `senseId` for determinism.
 *  - **Intros** — the due cards named in `introSenseIds` (freshly created this session), kept in the
 *    caller's given order (the list-stack / zipf_rank order the seeder returned), then **evenly
 *    interleaved** among the reviews (SEED-6: "interleaved with due reviews"). With no reviews the
 *    queue is just the intros.
 *
 * The fresh-intro set is passed in explicitly (the seeder knows exactly which cards it just created)
 * rather than inferred from `fsrs.reps`/mastery — no heuristic, and no INV-3 concern.
 */
export function orderSessionQueue(
  cards: readonly Card[],
  introSenseIds: readonly string[],
  now: Date,
): string[] {
  const t = now.getTime();
  const dueSenseIds = new Set(cards.filter((c) => c.fsrs.due.getTime() <= t).map((c) => c.senseId));

  const introSet = new Set(introSenseIds);
  // Intros in the given (list-stack) order, restricted to those actually due/present.
  const intros = introSenseIds.filter((s) => dueSenseIds.has(s));

  const reviews = cards
    .filter((c) => dueSenseIds.has(c.senseId) && !introSet.has(c.senseId))
    .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime() || (a.senseId < b.senseId ? -1 : 1))
    .map((c) => c.senseId);

  return interleaveEvenly(reviews, intros);
}

/**
 * SEED-6: merge two ordered streams so `intros` are spread evenly through `reviews` (never all-front
 * or all-back). Both streams keep their own relative order. The rule advances whichever stream is
 * "behind" its proportional share (midpoint comparison), which distributes the shorter stream evenly.
 */
function interleaveEvenly(reviews: readonly string[], intros: readonly string[]): string[] {
  const R = reviews.length;
  const I = intros.length;
  if (I === 0) return [...reviews];
  if (R === 0) return [...intros];

  const out: string[] = [];
  let ri = 0;
  let ii = 0;
  while (ri < R || ii < I) {
    if (ii >= I) out.push(reviews[ri++]!);
    else if (ri >= R) out.push(intros[ii++]!);
    else if ((ii + 0.5) / I <= (ri + 0.5) / R) out.push(intros[ii++]!);
    else out.push(reviews[ri++]!);
  }
  return out;
}
