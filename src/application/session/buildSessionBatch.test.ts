import { describe, expect, it } from "vitest";
import {
  BATCH_CARD_CAP,
  BATCH_FP_CAP,
  FIRST_SESSION_SEED_WORDS,
  NEW_PER_DAY,
} from "~/domain/constants.js";
import { buildSessionBatch } from "./buildSessionBatch.js";
import { card, KIT_NOW, makeBuildDeps } from "./sessionBatchTestKit.js";

const INPUT = { userId: "u1", frontierBand: "B2", utcOffsetMinutes: 0, batchNumber: 1, now: KIT_NOW };

describe("buildSessionBatch", () => {
  it("BAT-14/SEED-10: the first build of a local day seeds the fast-win batch and records the ledger count", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3", "w4", "w5"]);
    const first = await buildSessionBatch(INPUT, deps);
    expect(first.kind).toBe("batch");
    // First session → the fast-win batch (SEED-1), not the full daily pace.
    expect((await deps.cards.listCards("u1")).length).toBe(FIRST_SESSION_SEED_WORDS);
    expect(await deps.seedLedger.read("u1")).toEqual({
      lastSeedAt: KIT_NOW,
      seededCount: FIRST_SESSION_SEED_WORDS,
    });
  });

  it("SEED-10/11: a backlog-throttled partial seed does NOT burn the day — clearing it refills to the cap same day", async () => {
    // 7 due cards throttle SEED-6 pacing below NEW_PER_DAY, so the first seed is partial.
    const backlog = Array.from({ length: 7 }, (_, i) => card(`due${i}`, "Recognized"));
    const deps = makeBuildDeps(backlog, ["w1", "w2", "w3", "w4", "w5"]);

    await buildSessionBatch(INPUT, deps);
    const wSeeded = async () =>
      (await deps.cards.listCards("u1")).filter((c) => c.senseId.startsWith("w")).length;
    const seededFirst = await wSeeded();
    expect(seededFirst).toBeGreaterThan(0);
    expect(seededFirst).toBeLessThan(NEW_PER_DAY); // the backlog held it under the daily cap

    // The learner reviews everything (all due cleared) an hour later, SAME local day.
    const farFuture = new Date(KIT_NOW.getTime() + 7 * 86_400_000);
    for (const c of await deps.cards.listCards("u1")) {
      await deps.cards.save({ ...c, fsrs: { ...c.fsrs, due: farFuture } });
    }
    const laterSameDay = new Date(KIT_NOW.getTime() + 60 * 60_000); // +1h, no gap wait within a day
    await buildSessionBatch({ ...INPUT, now: laterSameDay }, deps);

    expect(await wSeeded()).toBe(NEW_PER_DAY); // refilled to the daily cap, same day
  });

  it("SEED-11: a granted pass that introduces nothing leaves the ledger untouched (day not burned)", async () => {
    const deps = makeBuildDeps([], []); // first-ever seed grants, but the frontier is exhausted
    await buildSessionBatch(INPUT, deps);
    expect(await deps.seedLedger.read("u1")).toBeUndefined(); // no stamp, no count
    expect(deps.seedInstrumentation.granted).toHaveLength(0); // and nothing logged as a grant
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
    // A seed at 23:50 and a rebuild at 00:00 are two calendar days ten minutes apart — the new day
    // resets the count (headroom exists) but the gap clause fails, so no second seed fires.
    const deps = makeBuildDeps([], ["w1", "w2", "w3"]);
    await deps.seedLedger.record("u1", new Date("2026-07-17T23:50:00Z"), NEW_PER_DAY); // yesterday's cap
    const now = new Date("2026-07-18T00:00:00Z");
    await buildSessionBatch({ ...INPUT, now }, deps);
    expect((await deps.cards.listCards("u1")).length).toBe(0); // no cards seeded
    expect(deps.seedInstrumentation.denied).toEqual([
      { userId: "u1", at: now, failingClause: "min_gap" },
    ]);
    expect(deps.seedInstrumentation.granted).toHaveLength(0);
  });

  it("SEED-10/14: a same-local-day rebuild with the cap spent is denied on the daily_cap clause", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3"]);
    await deps.seedLedger.record("u1", KIT_NOW, NEW_PER_DAY); // today's cap already spent
    const now = new Date(KIT_NOW.getTime() + 6 * 3_600_000); // +6h, still 2026-07-17 (gap alone would pass)
    await buildSessionBatch({ ...INPUT, now }, deps);
    expect((await deps.cards.listCards("u1")).length).toBe(0);
    expect(deps.seedInstrumentation.denied).toEqual([
      { userId: "u1", at: now, failingClause: "daily_cap" },
    ]);
  });

  it("SEED-10/12/14: returning after an absence grants one batch and logs the grant", async () => {
    const deps = makeBuildDeps([], ["w1", "w2", "w3", "w4", "w5"]);
    await deps.seedLedger.record("u1", new Date("2026-07-15T10:00:00Z"), NEW_PER_DAY); // two days ago
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
    // 3 due cards keep the backlog cap ≥ 1 intro (2 due would zero the pace → no grant to inspect).
    const deps = makeBuildDeps(
      [card("due1", "Recognized"), card("due2", "Recognized"), card("due3", "Recognized")],
      ["w1", "w2", "w3"],
    );
    const res = await buildSessionBatch(INPUT, deps); // ledger empty → grant; due1..3 are due now
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
    // Today's cap already spent → the rail denies, keeping seeding out of the picture.
    await deps.seedLedger.record("u1", KIT_NOW, NEW_PER_DAY);
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
