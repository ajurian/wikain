import { describe, it, expect } from "vitest";
import { composeSeeding, composePlacementSlate, composeRecordPlacementMarks } from "./composition.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";
import { InMemoryPlacementMarks } from "./inMemoryPlacementMarks.js";
import { seedIntroductions } from "../application/seedIntroductions.js";
import { readPlacementSlate } from "../application/readPlacementSlate.js";
import { recordPlacementMarks } from "../application/recordPlacementMarks.js";

/**
 * End-to-end proof of the placement-marks store (spec/09 SEED-2/7) over the REAL catalog + word source +
 * ts-fsrs, with an in-memory marks store + repo (no DB, no network). The whole path: read a slate of
 * frontier candidates → the learner marks one → it persists → the seeder consults the SHARED store and
 * enters that word at `Recognized` (SM-11) instead of `Seen`. The store is the ONLY input carrying the
 * mark (no `placementKnown` is passed to the seeder) — the real onboarding→session wiring.
 */
describe("placement marks (smoke: real catalog + word source, shared store)", () => {
  const BAND = "B2";
  const now = new Date("2026-07-04T00:00:00Z");

  it("SEED-2/7: a word marked via the store enters Recognized when the seeder reaches it", async () => {
    const cards = new InMemoryCardRepository();
    const marks = new InMemoryPlacementMarks();

    // 1. The onboarding slate offers real frontier candidates (excluding any already-carded — none yet).
    const slate = await readPlacementSlate(
      { userId: "u1", frontierBand: BAND, count: 6 },
      composePlacementSlate(cards),
    );
    expect(slate.length).toBeGreaterThan(0);
    const marked = slate[0]!.senseId;

    // 2. The learner marks the first candidate known; it persists to the shared store.
    await recordPlacementMarks({ userId: "u1", senseIds: [marked] }, composeRecordPlacementMarks(marks));
    expect(await marks.list("u1")).toEqual([marked]);

    // 3. The seeder consults the SHARED marks store (no explicit placementKnown) — SEED-7.
    const created = await seedIntroductions(
      { userId: "u1", frontierBand: BAND, now },
      composeSeeding(cards, undefined, marks),
    );

    const markedCard = created.find((c) => c.senseId === marked);
    expect(markedCard?.mastery).toBe("Recognized"); // SM-11: marked → skips Seen
    // An unmarked seeded word (the slate is frontier-ordered, so the seeder also picks the marked one
    // first; any *other* created card must be Seen).
    for (const c of created) {
      if (c.senseId !== marked) expect(c.mastery).toBe("Seen");
    }
  });

  it("SEED-3: with an empty store, no word skips Seen", async () => {
    const cards = new InMemoryCardRepository();
    const marks = new InMemoryPlacementMarks();
    const created = await seedIntroductions(
      { userId: "u2", frontierBand: BAND, now },
      composeSeeding(cards, undefined, marks),
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((c) => c.mastery === "Seen")).toBe(true);
  });
});
