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

/**
 * SM-5: a passing judged free production promotes `Productive → Fluent` ONLY when the four-condition
 * gate (`qualifiesForFluent`) is met. Any other state — including a `Fluent` maintenance pass, which
 * stays `Fluent` — is returned unchanged. The gate decision is computed by the caller from the
 * judged-pass ledger + FSRS stability so this transition stays a pure state map.
 */
export function promoteOnJudgedPass(state: MasteryState, qualifiesForFluent: boolean): MasteryState {
  return state === "Productive" && qualifiesForFluent ? "Fluent" : state;
}

/**
 * SM-3: `Seen → Recognized` fires on a passing typed-cloze. A recognition MCQ pass alone does NOT
 * promote (that is the identity map — the caller leaves mastery untouched), so promotion is modelled
 * only for the cloze pass. By construction the on-ramp only presents the cloze after a prior MCQ pass
 * (routing via `onRampLedger.nextSeenTier`), so the "prior MCQ" precondition of SM-3 is guaranteed
 * upstream and not re-checked here. A cloze fail is a deterministic-tier fail (SM-6) — no demotion —
 * so any non-pass or non-`Seen` state is returned unchanged.
 */
export function promoteOnClozePass(state: MasteryState, passed: boolean): MasteryState {
  return state === "Seen" && passed ? "Recognized" : state;
}
