import { describe, it, expect } from "vitest";
import { composeSeeding, composeReviewPass, DEV_JUDGE_VERSIONS } from "../composition.js";
import { makeTestStores } from "../testStores.js";
import { FakeJudge, passingVerdict } from "../judge/fakeJudge.js";
import { seedIntroductions } from "~/application/session/seedIntroductions.js";
import { runReviewPass, type RunReviewPassDeps } from "~/application/review/runReviewPass.js";
import { FIRST_SESSION_SEED_WORDS } from "~/domain/constants.js";
import { USER_A } from "../testIds.js";

/**
 * Smoke test of first-session seeding (spec/09) over the REAL catalog (build/out/items.json) with REAL
 * ts-fsrs + pglite-backed Drizzle stores — no external services. Proves lazy card creation (SEED-7), the
 * entry state (SM-11 / SEED-3), cold-start (SEED-8), and that a seeded card is reviewable end-to-end.
 * "B2" is the default ~B2+NAWL frontier (SEED-5) and the largest band present. Each test uses its own
 * fresh store, so `USER_A` is reused without cross-test collision.
 */
describe("first-session seeding (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const now = new Date("2026-07-02T00:00:00Z");

  /** Deterministic frontier picks for a fresh user (selection is stable — SEED-5). */
  async function firstPicks(): Promise<string[]> {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const created = await seedIntroductions(
      { userId: USER_A, frontierBand: BAND, now },
      composeSeeding(cards, marks, catalog, wordSource),
    );
    return created.map((c) => c.senseId);
  }

  it("SEED-1/6/7: a brand-new user is seeded FIRST_SESSION_SEED_WORDS lazily-created cards, all Seen", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const created = await seedIntroductions(
      { userId: USER_A, frontierBand: BAND, now },
      composeSeeding(cards, marks, catalog, wordSource),
    );

    expect(created).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(created.every((c) => c.mastery === "Seen")).toBe(true); // SEED-3: no marks → no skip
    // SEED-7: the cards are actually persisted (nothing exists for the rest of the catalog).
    expect(await cards.listCards(USER_A)).toHaveLength(FIRST_SESSION_SEED_WORDS);
    // SEED-8: cold-started difficulty applied; a fresh card is due immediately (reviewable now).
    expect(created.every((c) => c.fsrs.difficulty > 0)).toBe(true);
    expect(created.every((c) => c.fsrs.due.getTime() <= now.getTime())).toBe(true);
  });

  it("SEED-1: onboarding relevel — deleting the prior seed reseeds a fresh first-session batch", async () => {
    // Reproduces the /onboarding refresh-and-repick fix (seedFirstSessionFn). A brand-new user gets a
    // first-session batch; a naive re-seed while those cards exist would seed NONE (SEED-6 backlog pacing
    // treats them as a non-first session), which is why the flow deletes them before reseeding.
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const deps = composeSeeding(cards, marks, catalog, wordSource);

    const first = await seedIntroductions({ userId: USER_A, frontierBand: BAND, now }, deps);
    expect(first).toHaveLength(FIRST_SESSION_SEED_WORDS);

    // The bug: with the seed cards still present, a second pass seeds nothing (pacing → 0).
    const noDelete = await seedIntroductions({ userId: USER_A, frontierBand: BAND, now }, deps);
    expect(noDelete).toHaveLength(0);

    // The fix: delete the prior seed (as seedFirstSessionFn does), then reseed → a fresh batch, not doubled.
    for (const c of await cards.listCards(USER_A)) await cards.deleteCard(USER_A, c.senseId);
    const reseed = await seedIntroductions({ userId: USER_A, frontierBand: BAND, now }, deps);
    expect(reseed).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(await cards.listCards(USER_A)).toHaveLength(FIRST_SESSION_SEED_WORDS);
  });

  it("SM-11/SEED-3: a placement-known word enters Recognized; an unmarked one stays Seen", async () => {
    const picks = await firstPicks();
    const known = picks[0]!;
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    const created = await seedIntroductions(
      { userId: USER_A, frontierBand: BAND, placementKnown: new Set([known]), now },
      composeSeeding(cards, marks, catalog, wordSource),
    );

    const knownCard = created.find((c) => c.senseId === known)!;
    const otherCard = created.find((c) => c.senseId !== known)!;
    expect(knownCard.mastery).toBe("Recognized"); // SM-11: skips Seen
    expect(otherCard.mastery).toBe("Seen"); // SEED-3: unmarked word does not skip
  });

  it("end-to-end: a placement-known seeded card (Recognized) is immediately reviewable via runReviewPass", async () => {
    const picks = await firstPicks();
    const known = picks[0]!;
    const { cards, marks, memo, catalog, wordSource, analyzer, healQueue } = await makeTestStores();

    // Seed the word as placement-known → it enters Recognized (the cued tier, SM-1/SM-11).
    const seedDeps = composeSeeding(cards, marks, catalog, wordSource);
    await seedIntroductions(
      { userId: USER_A, frontierBand: BAND, placementKnown: new Set([known]), now },
      seedDeps,
    );

    // Review it through the loop, sharing the same repository the seeder wrote to.
    const reviewDeps: RunReviewPassDeps = composeReviewPass(
      new FakeJudge(passingVerdict()),
      cards,
      memo,
      DEV_JUDGE_VERSIONS,
      catalog,
      analyzer,
      healQueue,
    );
    const lemma = seedDeps.catalog.get(known)!.lemma;
    const res = await runReviewPass({ userId: USER_A, senseId: known, response: lemma, now }, reviewDeps);

    expect(res.tier).toBe("cued"); // LOOP-1/SM-1: Recognized → cued
    if (res.tier === "cued" && res.outcome.kind === "graded") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Productive"); // SM-4: one cued pass promotes
    }
  });

  it("composeSeeding wires seeding without throwing", async () => {
    const { cards, marks, catalog, wordSource } = await makeTestStores();
    expect(() => composeSeeding(cards, marks, catalog, wordSource)).not.toThrow();
  });
});
