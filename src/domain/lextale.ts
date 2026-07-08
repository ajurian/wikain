/**
 * The published LexTALE English instrument (spec/09 SEED-4).
 *
 * Source: Lemhöfer, K., & Broersma, M. (2012). "Introducing LexTALE: A quick and valid Lexical Test for
 * Advanced Learners of English." *Behavior Research Methods*, 44(2), 325–343 — Appendix A, transcribed
 * verbatim (item order preserved, `y`/`n` = word/nonword).
 *
 * SEED-4 forbids authoring our own nonwords: the validity of the whole scalar rests on THESE 20 having
 * been normed. Do not add, drop, reorder, or respell an item. `savoury` is British in an en-US app — it
 * is a published item and stays (nothing lemmatizes it; the task is a yes/no lexical decision).
 *
 * > [FLAG] Licensing. LexTALE is distributed for *research* use. Wikain is a commercial multi-tenant
 * > product, and `spec/09` ("Out-of-scope: the LexTALE instrument internals") never addressed
 * > redistribution. Unresolved — see the matching flag in `spec/09-seeding-placement.md`.
 *
 * Pure data + one pure function: no I/O, so the item list is safe to ship to the client, which renders
 * it (ARCH-2). Scoring stays here (and is re-run server-side) so a client can never post its own scalar.
 */

export interface LexTaleItem {
  /** The stimulus as published; doubles as its stable id (the list is duplicate-free — asserted). */
  readonly item: string;
  /** `true` = a real English word; `false` = one of the 20 validated nonwords. */
  readonly isWord: boolean;
}

/** The three unscored practice trials that precede the test (Appendix A), in published order. */
export const LEXTALE_PRACTICE_ITEMS: readonly LexTaleItem[] = [
  { item: "platery", isWord: false },
  { item: "denial", isWord: true },
  { item: "generic", isWord: true },
];

/** The 60 scored items (40 words / 20 nonwords), in published order. */
export const LEXTALE_ITEMS: readonly LexTaleItem[] = [
  { item: "mensible", isWord: false },
  { item: "scornful", isWord: true },
  { item: "stoutly", isWord: true },
  { item: "ablaze", isWord: true },
  { item: "kermshaw", isWord: false },
  { item: "moonlit", isWord: true },
  { item: "lofty", isWord: true },
  { item: "hurricane", isWord: true },
  { item: "flaw", isWord: true },
  { item: "alberation", isWord: false },
  { item: "unkempt", isWord: true },
  { item: "breeding", isWord: true },
  { item: "festivity", isWord: true },
  { item: "screech", isWord: true },
  { item: "savoury", isWord: true },
  { item: "plaudate", isWord: false },
  { item: "shin", isWord: true },
  { item: "fluid", isWord: true },
  { item: "spaunch", isWord: false },
  { item: "allied", isWord: true },
  { item: "slain", isWord: true },
  { item: "recipient", isWord: true },
  { item: "exprate", isWord: false },
  { item: "eloquence", isWord: true },
  { item: "cleanliness", isWord: true },
  { item: "dispatch", isWord: true },
  { item: "rebondicate", isWord: false },
  { item: "ingenious", isWord: true },
  { item: "bewitch", isWord: true },
  { item: "skave", isWord: false },
  { item: "plaintively", isWord: true },
  { item: "kilp", isWord: false },
  { item: "interfate", isWord: false },
  { item: "hasty", isWord: true },
  { item: "lengthy", isWord: true },
  { item: "fray", isWord: true },
  { item: "crumper", isWord: false },
  { item: "upkeep", isWord: true },
  { item: "majestic", isWord: true },
  { item: "magrity", isWord: false },
  { item: "nourishment", isWord: true },
  { item: "abergy", isWord: false },
  { item: "proom", isWord: false },
  { item: "turmoil", isWord: true },
  { item: "carbohydrate", isWord: true },
  { item: "scholar", isWord: true },
  { item: "turtle", isWord: true },
  { item: "fellick", isWord: false },
  { item: "destription", isWord: false },
  { item: "cylinder", isWord: true },
  { item: "censorship", isWord: true },
  { item: "celestial", isWord: true },
  { item: "rascal", isWord: true },
  { item: "purrage", isWord: false },
  { item: "pulsh", isWord: false },
  { item: "muddy", isWord: true },
  { item: "quirty", isWord: false },
  { item: "pudour", isWord: false },
  { item: "listless", isWord: true },
  { item: "wrought", isWord: true },
];

/**
 * SEED-4: the published **averaged % correct** — `(%correct_words + %correct_nonwords) / 2`.
 *
 * Averaging the two halves separately (rather than `correct / 60`) is the instrument's yes-bias
 * correction, and the reason the 40/20 split is deliberately unbalanced: a learner who answers "yes" to
 * everything scores 50, not 67. An answer of `true` means "I know this word", so a **nonword is correct
 * when answered `false`**.
 *
 * Throws on a missing or unrecognized item rather than scoring a partial run: a silently-dropped answer
 * would shift the scalar and, through it, the learner's frontier band (halt, don't guess).
 */
export function scoreLexTale(answers: ReadonlyMap<string, boolean>): number {
  let correctWords = 0;
  let correctNonwords = 0;
  let words = 0;
  let nonwords = 0;

  for (const { item, isWord } of LEXTALE_ITEMS) {
    const said = answers.get(item);
    if (said === undefined) throw new Error(`scoreLexTale: no answer for item "${item}"`);
    if (isWord) {
      words += 1;
      if (said) correctWords += 1;
    } else {
      nonwords += 1;
      if (!said) correctNonwords += 1;
    }
  }

  if (answers.size !== LEXTALE_ITEMS.length) {
    const known = new Set(LEXTALE_ITEMS.map((i) => i.item));
    const stray = [...answers.keys()].filter((k) => !known.has(k));
    throw new Error(`scoreLexTale: answers for unknown item(s): ${stray.join(", ")}`);
  }

  return ((correctWords / words) * 100 + (correctNonwords / nonwords) * 100) / 2;
}
