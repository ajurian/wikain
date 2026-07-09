/**
 * Presentation-side verdict view types shared by the review + onboarding UI. They describe what the
 * client RENDERS from a judged free production: the rule-layer bounce kinds it has copy for (spec/04
 * RL-2/3/4) and one inline edit span (spec/07 EDIT-*). The server functions (`server/review.ts`,
 * `server/onboarding.ts`) return values shaped to match. These are UI-render types, so they live in
 * presentation — not the domain, which owns the rules, not their rendering.
 *
 * (Relocated from the deleted design-time `mock/judge.ts`, renamed off the `Mock*` prefix now that the
 * live UI runs on the real backend.)
 */

/** The three rule-layer bounce kinds the UI has copy for (RL-2 absent / RL-3 degenerate / RL-4 taglish). */
export type BounceKind = "absent" | "degenerate" | "taglish";

/** One inline edit the UI renders as strikethrough + insertion (spec/07 EDIT-*). */
export interface Replacement {
  find: string;
  replace: string;
  reason: "sense" | "grammar" | "collocation" | "register";
  oneLineFeedback: string;
}
