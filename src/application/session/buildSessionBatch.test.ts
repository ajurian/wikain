import { describe, expect, it } from "vitest";
import { BATCH_CARD_CAP, BATCH_FP_CAP } from "~/domain/constants.js";
import { buildSessionBatch } from "./buildSessionBatch.js";
import { card, KIT_NOW, makeBuildDeps } from "./sessionBatchTestKit.js";

const INPUT = { userId: "u1", frontierBand: "B2", utcOffsetMinutes: 0, batchNumber: 1, now: KIT_NOW };

describe("buildSessionBatch", () => {
  it("BAT-14: the first build of a local day seeds; a same-day rebuild orders existing cards only", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3"]);
    const first = await buildSessionBatch(INPUT, deps);
    expect(first.kind).toBe("batch");
    const seededCount = (await deps.cards.listCards("u1")).length;
    expect(seededCount).toBeGreaterThan(0);

    const again = await buildSessionBatch(INPUT, deps);
    expect(again.kind).toBe("batch");
    expect((await deps.cards.listCards("u1")).length).toBe(seededCount); // no re-seed
  });

  it("BAT-14: a rolled learner-local day re-enables seeding", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3", "w4", "w5", "w6", "w7"]);
    await buildSessionBatch(INPUT, deps);
    const afterDay1 = await deps.cards.listCards("u1");

    // Clear the due backlog (as real reviews would) so SEED-6's backlog cap doesn't zero the
    // next day's intros — this test pins the day-guard, not the pacing math.
    const nextDay = new Date(KIT_NOW.getTime() + 24 * 3_600_000);
    const farFuture = new Date(nextDay.getTime() + 7 * 86_400_000);
    for (const c of afterDay1) {
      await deps.cards.save({ ...c, fsrs: { ...c.fsrs, due: farFuture } });
    }

    await buildSessionBatch({ ...INPUT, now: nextDay }, deps);
    expect((await deps.cards.listCards("u1")).length).toBeGreaterThan(afterDay1.length);
  });

  it("SEED-10: the midnight double (11:50pm→12:00am) is blocked by the min-gap clause", async () => {
    // A seed at 23:50 and a rebuild at 00:00 are two calendar days ten minutes apart — the
    // calendar-day clause passes but the gap clause fails, so no second seed fires.
    const deps = makeBuildDeps([], ["w1", "w2", "w3"]);
    await deps.seedLedger.recordSeedAt("u1", new Date("2026-07-17T23:50:00Z"));
    const now = new Date("2026-07-18T00:00:00Z");
    await buildSessionBatch({ ...INPUT, now }, deps);
    expect((await deps.cards.listCards("u1")).length).toBe(0); // no cards seeded
    expect(deps.seedInstrumentation.denied).toEqual([
      { userId: "u1", at: now, failingClause: "min_gap" },
    ]);
    expect(deps.seedInstrumentation.granted).toHaveLength(0);
  });

  it("SEED-10/14: a same-local-day rebuild is denied on the calendar-day clause", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3"]);
    await deps.seedLedger.recordSeedAt("u1", KIT_NOW); // seeded 10:00Z
    const now = new Date(KIT_NOW.getTime() + 6 * 3_600_000); // +6h, still 2026-07-17 (gap alone would pass)
    await buildSessionBatch({ ...INPUT, now }, deps);
    expect((await deps.cards.listCards("u1")).length).toBe(0);
    expect(deps.seedInstrumentation.denied).toEqual([
      { userId: "u1", at: now, failingClause: "calendar_day" },
    ]);
  });

  it("SEED-10/12/14: returning after an absence grants one batch and logs the grant", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3", "w4", "w5"]);
    await deps.seedLedger.recordSeedAt("u1", new Date("2026-07-15T10:00:00Z")); // two days ago
    const res = await buildSessionBatch(INPUT, deps); // now = KIT_NOW: new day AND ≫ 5h gap
    expect(res.kind).toBe("batch");
    expect(deps.seedInstrumentation.granted).toHaveLength(1);
    const g = deps.seedInstrumentation.granted[0]!;
    expect(g.seededAt).toEqual(KIT_NOW);
    expect(g.count).toBeGreaterThan(0);
    expect(g.hadBacklog).toBe(false); // only fresh seeds in the queue, no prior due debt
    expect(deps.seedInstrumentation.denied).toHaveLength(0);
  });

  it("SEED-14: a grant on a day with existing due cards records hadBacklog=true", async () => {
    const deps = makeBuildDeps(
      [card("due1", "Recognized"), card("due2", "Recognized")],
      ["w1", "w2", "w3"],
    );
    const res = await buildSessionBatch(INPUT, deps); // ledger empty → grant; due1/due2 are due now
    expect(res.kind).toBe("batch");
    expect(deps.seedInstrumentation.granted[0]!.hadBacklog).toBe(true);
  });

  it("BAT-2: entries carry the tier the shared router resolves (Recognized→cued, Productive→free)", async () => {
    const deps = makeBuildDeps([card("a", "Recognized"), card("b", "Productive")]);
    const res = await buildSessionBatch(INPUT, deps);
    if (res.kind !== "batch") throw new Error("expected a batch");
    const tiers = new Map(res.state.entries.map((e) => [e.senseId, e.tier]));
    expect(tiers.get("a")).toBe("cued");
    expect(tiers.get("b")).toBe("free");
  });

  it("BAT-3: the built batch honors the caps (12 Seen recognition cards → CARD_CAP)", async () => {
    const cards = Array.from({ length: 12 }, (_, i) => card(`s${i}`, "Seen"));
    const deps = makeBuildDeps(cards);
    const res = await buildSessionBatch(INPUT, deps);
    if (res.kind !== "batch") throw new Error("expected a batch");
    expect(res.state.entries).toHaveLength(BATCH_CARD_CAP);
    expect(res.state.progressIndex).toBe(0);
  });

  it("BAT-3/5: free-production cards are capped at BATCH_FP_CAP per batch", async () => {
    const cards = Array.from({ length: 4 }, (_, i) => card(`f${i}`, "Productive"));
    const deps = makeBuildDeps(cards);
    const res = await buildSessionBatch(INPUT, deps);
    if (res.kind !== "batch") throw new Error("expected a batch");
    expect(res.state.entries.filter((e) => e.tier === "free")).toHaveLength(BATCH_FP_CAP);
  });

  it("BAT-16: the instrumentation row records the planned composition", async () => {
    const deps = makeBuildDeps([card("a", "Recognized"), card("b", "Productive")]);
    const res = await buildSessionBatch(INPUT, deps);
    if (res.kind !== "batch") throw new Error("expected a batch");
    expect(deps.batchStore.created).toHaveLength(1);
    const row = deps.batchStore.created[0]!;
    expect(row.batchId).toBe(res.state.batchId);
    expect(row.plannedCards).toBe(2);
    expect(row.plannedUnits).toBe(12); // cued 2 + free 10
    expect(row.plannedTierCounts).toEqual({ recognition: 0, cloze: 0, cued: 1, free: 1 });
  });

  it("returns empty (and clears any state row) when nothing is due", async () => {
    const future = new Date(KIT_NOW.getTime() + 86_400_000);
    const deps = makeBuildDeps([card("later", "Recognized", future)]);
    // A same-instant ledger entry fails both rail clauses, keeping seeding out of the picture.
    await deps.seedLedger.recordSeedAt("u1", KIT_NOW);
    const res = await buildSessionBatch(INPUT, deps);
    expect(res.kind).toBe("empty");
    expect(deps.sessionStatePeek("u1")).toBeUndefined();
  });

  it("dev tier pin: the batcher tags with the SAME override the grader/prompt receive", async () => {
    const deps = { ...makeBuildDeps([card("a", "Recognized")]), tierOverride: "free" as const };
    const res = await buildSessionBatch(INPUT, deps);
    if (res.kind !== "batch") throw new Error("expected a batch");
    expect(res.state.entries[0]!.tier).toBe("free");
  });
});
