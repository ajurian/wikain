import { describe, it, expect } from "vitest";
import { seedIntroductions } from "../application/seedIntroductions.js";
import { judgeFirstProduction } from "../application/judgeFirstProduction.js";
import { presentSeededWords } from "../application/presentSeededWords.js";
import { recordLexTaleResult } from "../application/recordLexTaleResult.js";
import { readPlacementProfile } from "../application/readPlacementProfile.js";
import type { JudgePort } from "../application/ports/judge.js";
import { composeSeeding, composeFreeProduction, DEV_JUDGE_VERSIONS } from "./composition.js";
import { makeTestStores } from "./testStores.js";
import { FIRST_SESSION_SEED_WORDS } from "../domain/constants.js";
import { LEXTALE_ITEMS } from "../domain/lextale.js";
import { USER_A } from "./testIds.js";

/** A judge that always passes the gate (offline; no DeepSeek key or network). */
const passingJudge: JudgePort = {
  judge: async ({ intendedSense }) => ({
    used_in_target_sense: true,
    detected_sense: intendedSense ?? "the target sense",
    intended_sense: intendedSense ?? "the target sense",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "",
    enrichment_suggestion: null,
    one_line_feedback: "",
  }),
};

/**
 * spec/09 SEED-1: the onboarding wiring end-to-end, offline over the real composition (pglite-backed
 * Drizzle stores). Seeds the first-session words, renders them, then judges a first production —
 * asserting the win is graded but NOTHING is persisted (judge-don't-persist: the seeded word stays
 * `Seen`, no ReviewLog).
 */
describe("onboarding first-session wiring (SEED-1)", () => {
  it("seeds FIRST_SESSION_SEED_WORDS Seen cards at the frontier band and renders them", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const deps = composeSeeding(cards, marks, catalog, wordSource);

    const seeded = await seedIntroductions({ userId: USER_A, frontierBand: "B2" }, deps);

    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS); // SEED-6: first session seeds ~2
    expect(seeded.every((c) => c.mastery === "Seen")).toBe(true); // SM-11: no placementKnown ⇒ all Seen
    const views = presentSeededWords(seeded, deps.catalog);
    expect(views).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(views.every((v) => v.lemma.length > 0)).toBe(true);
  });

  it("judges the first-win production but persists NOTHING (INV-4: no free log on a Seen word)", async () => {
    const { cards, marks, memo, catalog, wordSource } = await makeTestStores();
    const seedDeps = composeSeeding(cards, marks, catalog, wordSource);
    const seeded = await seedIntroductions({ userId: USER_A, frontierBand: "B2" }, seedDeps);
    const first = seeded[0]!;
    const lemma = seedDeps.catalog.get(first.senseId)!.lemma;

    // A healthy English sentence that embeds the bare lemma (passes RL-2 presence + RL-3 length).
    const sentence = `People often ${lemma} things, and we plan our weekly office schedule around that idea.`;

    // judgeFirstProduction has no cards/scheduler deps of its own — reuse the review-pass wiring (a
    // structural superset) with an offline passing judge.
    const result = await judgeFirstProduction(
      { senseId: first.senseId, response: sentence },
      composeFreeProduction(passingJudge, cards, memo, DEV_JUDGE_VERSIONS, catalog),
    );
    expect(result.kind).toBe("judged");

    // The whole point of judge-don't-persist: the seeded card is untouched, and no ReviewLog exists.
    const card = await cards.load(USER_A, first.senseId);
    expect(card?.mastery).toBe("Seen");
    expect(await cards.logsForWord(USER_A, first.senseId)).toEqual([]);
  });
});

/** A perfect LexTALE run: "yes" to every word, "no" to every nonword ⇒ score 100 ⇒ the C1 frontier. */
const perfectRun = new Map(LEXTALE_ITEMS.map((i) => [i.item, i.isWord]));

/**
 * spec/09 SEED-3, the two published scenarios, run over the real composition (pglite-backed Drizzle stores
 * + the real DB-backed catalog and word source). These are the assertions that keep the three placement
 * mechanisms from quietly collapsing into one.
 */
describe("LexTALE keeps to its lane (SEED-3)", () => {
  it("SEED-3: LexTALE moves the frontier, but the list stack selects the words", async () => {
    const { cards, marks, profile, catalog, wordSource, items } = await makeTestStores();

    const { score, frontierBand } = await recordLexTaleResult(
      { userId: USER_A, answers: perfectRun },
      { profile },
    );
    expect(score).toBe(100);
    expect(frontierBand).toBe("C1");
    // The scalar is persisted as the band; it never names a word.
    expect((await readPlacementProfile({ userId: USER_A }, { profile })).frontierBand).toBe("C1");

    const seeded = await seedIntroductions(
      { userId: USER_A, frontierBand },
      composeSeeding(cards, marks, catalog, wordSource),
    );

    // Every seeded word came from the list stack AT that band — not from LexTALE, whose 60 items are
    // nonwords and low-frequency probes that appear nowhere in the catalog.
    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS);
    const c1SenseIds = new Set(items.filter((i) => i.cefr === "C1").map((i) => i.sense_id));
    expect(seeded.every((c) => c1SenseIds.has(c.senseId))).toBe(true);
    const lextaleWords = new Set(LEXTALE_ITEMS.map((i) => i.item));
    expect(seeded.every((c) => !lextaleWords.has(catalog.get(c.senseId)!.lemma))).toBe(true);
  });

  it("SEED-3: a perfect LexTALE score skips no word's Seen step — only a per-word flag does (SM-11)", async () => {
    const { cards, marks, profile, catalog, wordSource } = await makeTestStores();

    const { frontierBand } = await recordLexTaleResult(
      { userId: USER_A, answers: perfectRun },
      { profile },
    );
    // A top scalar, and NO per-word placement marks recorded.
    expect(await marks.list(USER_A)).toEqual([]);

    const seeded = await seedIntroductions(
      { userId: USER_A, frontierBand },
      composeSeeding(cards, marks, catalog, wordSource),
    );

    expect(seeded).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(seeded.every((c) => c.mastery === "Seen")).toBe(true);
  });

  it("SEED-2/7: the SAME run plus a per-word mark enters that word at Recognized — the flag, not the score", async () => {
    const { cards, marks, profile, catalog, wordSource, items } = await makeTestStores();

    const { frontierBand } = await recordLexTaleResult(
      { userId: USER_A, answers: perfectRun },
      { profile },
    );
    // Mark the first C1 word the list stack will reach (frontier order = zipf_rank asc).
    const target = items
      .filter((i) => i.cefr === "C1")
      .sort((a, b) => a.zipf_rank - b.zipf_rank)[0]!;
    await marks.record(USER_A, [target.sense_id]);

    const seeded = await seedIntroductions(
      { userId: USER_A, frontierBand },
      composeSeeding(cards, marks, catalog, wordSource),
    );

    const marked = seeded.find((c) => c.senseId === target.sense_id);
    expect(marked?.mastery).toBe("Recognized"); // SM-11
    expect(seeded.filter((c) => c.senseId !== target.sense_id).every((c) => c.mastery === "Seen")).toBe(
      true,
    );
  });
});
