/**
 * Shipped Tagalog lexicon for the rule layer's code-switching check (spec/04 RL-4). Detection MUST be
 * deterministic against shipped data with no LLM call.
 *
 * STUB: a small set of high-frequency Tagalog function words + a few common content words — enough to
 * exercise the Taglish branch end-to-end. Expand from real data later (RL-4 / spec/04 Deferred:
 * "tuning … from real data"). Entries MUST be lowercased to match `NlpToken.normal`. Words that
 * collide with English are deliberately omitted to avoid false code-switching flags on clean English.
 */
export const TAGALOG_LEXICON: ReadonlySet<string> = new Set([
  // function words / particles
  "ang",
  "ng",
  "mga",
  "sa",
  "naman",
  "talaga",
  "kasi",
  "yung",
  "yan",
  "ito",
  "po",
  "ba",
  "lang",
  "din",
  "rin",
  "nga",
  "pala",
  "raw",
  "daw",
  // pronouns
  "ako",
  "ikaw",
  "siya",
  "kami",
  "tayo",
  "kayo",
  "sila",
  "ko",
  "mo",
  "niya",
  "natin",
  "namin",
  "nila",
  // very common content words
  "salamat",
  "kain",
  "gusto",
  "ayoko",
  "mahal",
  "ganda",
  "araw",
  "bahay",
  "trabaho",
]);
