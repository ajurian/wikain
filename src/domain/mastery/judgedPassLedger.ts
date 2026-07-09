import type { ReviewLog } from "../review/review.js";

/**
 * The judged-pass ledger (spec/01 SM-5, spec/10 CNT-2) — pure reductions over a word's ReviewLog
 * history. Both the Fluent gate and the counter reduce to the same primitive: *successful free
 * **judged** productions on separate calendar days*. INV-4: only `tier === "free"` passes count;
 * recognition/cloze/cued passes never do, so they are filtered out here once, centrally.
 *
 * Derived from the persisted logs (DM-6) rather than a running Card field, so there is one source of
 * truth and no drift.
 */

/** A free judged production that passed the gate (Good on the free tier — INV-4). */
function isJudgedPass(log: ReviewLog): boolean {
  return log.tier === "free" && log.rating === "Good";
}

/**
 * The user-local calendar day (`YYYY-MM-DD`) a review fell on. SM-5/CNT-2 require *separate calendar
 * days* in the user's timezone; per-user tz storage is a seeding/presentation concern (deferred), so
 * the boundary is an injected UTC-offset in minutes (default 0 / UTC) until the real tz wires in.
 */
export function localDayKey(at: Date, utcOffsetMinutes: number): string {
  return new Date(at.getTime() + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * SM-5(a/b) + CNT-2: the number of distinct calendar days bearing at least one passing free judged
 * production. Two passes on the same day collapse to one — this single metric encodes both the count
 * and the spacing requirement.
 */
export function distinctPassDays(logs: readonly ReviewLog[], utcOffsetMinutes = 0): number {
  const days = new Set<string>();
  for (const log of logs) {
    if (isJudgedPass(log)) days.add(localDayKey(log.reviewedAt, utcOffsetMinutes));
  }
  return days.size;
}

/**
 * CNT-8: the number of passing free judged productions on the calendar day of `now` — the daily
 * USE-goal progress. Counts *uses*, not distinct days (two passes today advance the goal by two),
 * which is what distinguishes it from `distinctPassDays`. INV-4 still filters deterministic tiers, so
 * a new introduction (a `Seen` interaction) never advances the goal (CNT-8 scenario).
 */
export function judgedUsesOnDay(
  logs: readonly ReviewLog[],
  now: Date,
  utcOffsetMinutes = 0,
): number {
  const today = localDayKey(now, utcOffsetMinutes);
  let uses = 0;
  for (const log of logs) {
    if (isJudgedPass(log) && localDayKey(log.reviewedAt, utcOffsetMinutes) === today) uses += 1;
  }
  return uses;
}

/**
 * SM-5(d) / SM-9: whether the most recent passing free production was scaffolded. A scaffolded pass
 * still rates Good (RAT-3) but does not satisfy Fluent's unscaffolded condition. Absent flag or no
 * passing production → unscaffolded (false); promotion is gated elsewhere when there are too few
 * passes anyway.
 */
export function mostRecentPassScaffolded(logs: readonly ReviewLog[]): boolean {
  let latest: ReviewLog | undefined;
  for (const log of logs) {
    if (!isJudgedPass(log)) continue;
    if (latest === undefined || log.reviewedAt > latest.reviewedAt) latest = log;
  }
  return latest?.scaffolded ?? false;
}
