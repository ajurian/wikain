import { describe, it, expect } from "vitest";
import { composeSeeding, composeReviewPass } from "./composition.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { FakeJudge, passingVerdict } from "./fakeJudge.js";
import { seedIntroductions } from "../application/seedIntroductions.js";
import { runReviewPass, type RunReviewPassDeps } from "../application/runReviewPass.js";
import { FIRST_SESSION_SEED_WORDS } from "../domain/constants.js";

/**
 * Smoke test of first-session seeding (spec/09) over the REAL catalog (build/out/items.json) with REAL
 * ts-fsrs + an in-memory repo — no external services. Proves lazy card creation (SEED-7), the entry
 * state (SM-11 / SEED-3), cold-start (SEED-8), and that a seeded card is reviewable end-to-end (the
 * now-continuous ladder). "B2" is the default ~B2+NAWL frontier (SEED-5) and the largest band present.
 */
describe("first-session seeding (smoke: real catalog + ts-fsrs)", () => {
  const BAND = "B2";
  const now = new Date("2026-07-02T00:00:00Z");

  /** Deterministic frontier picks for a fresh user (selection is stable — SEED-5). */
  async function firstPicks(): Promise<string[]> {
    const created = await seedIntroductions(
      { userId: "probe", frontierBand: BAND, now },
      composeSeeding(new InMemoryCardRepository()),
    );
    return created.map((c) => c.senseId);
  }

  it("SEED-1/6/7: a brand-new user is seeded FIRST_SESSION_SEED_WORDS lazily-created cards, all Seen", async () => {
    const cards = new InMemoryCardRepository();
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: BAND, now },
      composeSeeding(cards),
    );

    expect(created).toHaveLength(FIRST_SESSION_SEED_WORDS);
    expect(created.every((c) => c.mastery === "Seen")).toBe(true); // SEED-3: no marks → no skip
    // SEED-7: the cards are actually persisted (nothing exists for the rest of the catalog).
    expect(await cards.listCards("u1")).toHaveLength(FIRST_SESSION_SEED_WORDS);
    // SEED-8: cold-started difficulty applied; a fresh card is due immediately (reviewable now).
    expect(created.every((c) => c.fsrs.difficulty > 0)).toBe(true);
    expect(created.every((c) => c.fsrs.due.getTime() <= now.getTime())).toBe(true);
  });

  it("SM-11/SEED-3: a placement-known word enters Recognized; an unmarked one stays Seen", async () => {
    const picks = await firstPicks();
    const known = picks[0]!;
    const cards = new InMemoryCardRepository();
    const created = await seedIntroductions(
      { userId: "u2", frontierBand: BAND, placementKnown: new Set([known]), now },
      composeSeeding(cards),
    );

    const knownCard = created.find((c) => c.senseId === known)!;
    const otherCard = created.find((c) => c.senseId !== known)!;
    expect(knownCard.mastery).toBe("Recognized"); // SM-11: skips Seen
    expect(otherCard.mastery).toBe("Seen"); // SEED-3: unmarked word does not skip
  });

  it("end-to-end: a placement-known seeded card (Recognized) is immediately reviewable via runReviewPass", async () => {
    const picks = await firstPicks();
    const known = picks[0]!;
    const cards = new InMemoryCardRepository();

    // Seed the word as placement-known → it enters Recognized (the cued tier, SM-1/SM-11).
    const seedDeps = composeSeeding(cards);
    await seedIntroductions(
      { userId: "u3", frontierBand: BAND, placementKnown: new Set([known]), now },
      seedDeps,
    );

    // Review it through the loop, sharing the same repository the seeder wrote to.
    const reviewDeps: RunReviewPassDeps = {
      ...composeReviewPass(new FakeJudge(passingVerdict())),
      cards,
    };
    const lemma = seedDeps.catalog.get(known)!.lemma;
    const res = await runReviewPass(
      { userId: "u3", senseId: known, response: lemma, now },
      reviewDeps,
    );

    expect(res.tier).toBe("cued"); // LOOP-1/SM-1: Recognized → cued
    if (res.tier === "cued") {
      expect(res.outcome.passed).toBe(true);
      expect(res.outcome.mastery).toBe("Productive"); // SM-4: one cued pass promotes
    }
  });

  it("composeSeeding wires seeding without throwing", () => {
    expect(() => composeSeeding()).not.toThrow();
  });
});
