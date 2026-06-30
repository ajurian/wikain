import type { MasteryState } from "./card.js";

/**
 * SM-4: a single deterministic cued-production pass promotes `Recognized → Productive`. Cued is
 * shown only at `Recognized` (SM-1), so any other state is returned unchanged. A cued pass never
 * reaches the counter or `Fluent` (INV-4) — those require judged free productions.
 *
 * SM-6: there is no demotion path here — a deterministic-tier *fail* never demotes; the caller
 * simply leaves the mastery state untouched (the FSRS reschedule is the only effect).
 */
export function promoteOnCuedPass(state: MasteryState): MasteryState {
  return state === "Recognized" ? "Productive" : state;
}

/**
 * SM-6 / SM-7: a failed judged free-production or maintenance review demotes the word exactly one
 * rung, following `Fluent → Productive → Recognized` and flooring at `Recognized` (a production
 * failure breaks the production, not the form–meaning link). Deterministic-tier fails never reach
 * here (SM-6) — only a judged-gate fail does. Below `Productive` the state is returned unchanged.
 */
export function demoteOneRung(state: MasteryState): MasteryState {
  if (state === "Fluent") return "Productive";
  if (state === "Productive") return "Recognized";
  return state;
}
