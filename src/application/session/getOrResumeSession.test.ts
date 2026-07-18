import { describe, expect, it } from "vitest";
import { BATCH_ABSENCE_T_MINUTES } from "~/domain/constants.js";
import { getOrResumeSession } from "./getOrResumeSession.js";
import { card, KIT_NOW, makeBuildDeps } from "./sessionBatchTestKit.js";

const INPUT = { userId: "u1", frontierBand: "B2", utcOffsetMinutes: 0, now: KIT_NOW };
const minutesLater = (m: number) => new Date(KIT_NOW.getTime() + m * 60_000);

describe("getOrResumeSession", () => {
  it("BAT-11: no state → a fresh batch is built and framed 'fresh'", async () => {
    const deps = makeBuildDeps([card("a", "Recognized")]);
    const res = await getOrResumeSession(INPUT, deps);
    expect(res.kind).toBe("batch");
    if (res.kind === "batch") {
      expect(res.framing).toBe("fresh");
      expect(res.state.progressIndex).toBe(0);
    }
  });

  it("BAT-12: a return within T resumes the SAME batch at true progress — no rebuild", async () => {
    const deps = makeBuildDeps([card("a", "Recognized"), card("b", "Recognized"), card("c", "Recognized")]);
    const first = await getOrResumeSession(INPUT, deps);
    if (first.kind !== "batch") throw new Error("expected a batch");
    await deps.sessionState.save({ ...first.state, progressIndex: 2, lastInteractionAt: KIT_NOW });

    const back = await getOrResumeSession({ ...INPUT, now: minutesLater(15) }, deps);
    expect(back.kind).toBe("batch");
    if (back.kind === "batch") {
      expect(back.framing).toBe("resumed");
      expect(back.state.batchId).toBe(first.state.batchId);
      expect(back.state.progressIndex).toBe(2);
    }
    expect(deps.batchStore.created).toHaveLength(1); // nothing was rebuilt
  });

  it("BAT-12: the boundary is inclusive — exactly T still resumes", async () => {
    const deps = makeBuildDeps([card("a", "Recognized")]);
    const first = await getOrResumeSession(INPUT, deps);
    if (first.kind !== "batch") throw new Error("expected a batch");
    const back = await getOrResumeSession(
      { ...INPUT, now: minutesLater(BATCH_ABSENCE_T_MINUTES) },
      deps,
    );
    if (back.kind !== "batch") throw new Error("expected a batch");
    expect(back.framing).toBe("resumed");
  });

  it("BAT-12: a within-T return at N/N resumes to the seam (choice still pending)", async () => {
    const deps = makeBuildDeps([card("a", "Recognized")]);
    const first = await getOrResumeSession(INPUT, deps);
    if (first.kind !== "batch") throw new Error("expected a batch");
    await deps.sessionState.save({
      ...first.state,
      progressIndex: first.state.entries.length,
      lastInteractionAt: KIT_NOW,
    });
    const back = await getOrResumeSession({ ...INPUT, now: minutesLater(5) }, deps);
    expect(back.kind).toBe("seam");
  });

  it("BAT-13: a return past T finalizes the stale batch as abandoned and presents a fresh 0/M", async () => {
    const deps = makeBuildDeps([
      card("a", "Recognized"),
      card("b", "Productive"),
      card("c", "Recognized"),
    ]);
    const first = await getOrResumeSession(INPUT, deps);
    if (first.kind !== "batch") throw new Error("expected a batch");
    await deps.sessionState.save({ ...first.state, progressIndex: 1, lastInteractionAt: KIT_NOW });

    const back = await getOrResumeSession(
      { ...INPUT, now: minutesLater(BATCH_ABSENCE_T_MINUTES + 1) },
      deps,
    );
    expect(back.kind).toBe("batch");
    if (back.kind === "batch") {
      expect(back.framing).toBe("welcomeBack");
      expect(back.state.batchId).not.toBe(first.state.batchId);
      expect(back.state.progressIndex).toBe(0); // never a visible reset — a NEW batch at 0
    }
    expect(deps.batchStore.finalized).toHaveLength(1);
    const { batchId, f } = deps.batchStore.finalized[0]!;
    expect(batchId).toBe(first.state.batchId);
    expect(f.outcome).toBe("abandoned");
    expect(f.completedCount).toBe(1);
    expect(f.abandonedAtPosition).toBe(1);
    expect(f.abandonedAtTier).toBe(first.state.entries[1]!.tier);
  });

  it("BAT-13/14: an expiry rebuild on the same local day does NOT re-seed", async () => {
    const deps = makeBuildDeps([card("a", "Recognized")], ["w1", "w2", "w3"]);
    await getOrResumeSession(INPUT, deps); // seeds (first build of the day)
    const afterFirst = (await deps.cards.listCards("u1")).length;

    await getOrResumeSession({ ...INPUT, now: minutesLater(BATCH_ABSENCE_T_MINUTES + 5) }, deps);
    expect((await deps.cards.listCards("u1")).length).toBe(afterFirst);
  });

  it("BAT-13: an expired session over an exhausted queue resolves to empty", async () => {
    const deps = makeBuildDeps([card("a", "Recognized", new Date(KIT_NOW.getTime() + 86_400_000))]);
    await deps.seedLedger.recordSeedAt("u1", KIT_NOW); // same-day instant → rail denies re-seed
    await deps.sessionState.save({
      userId: "u1",
      batchId: "stale-batch",
      batchNumber: 1,
      entries: [{ senseId: "gone", tier: "cued" }],
      progressIndex: 0,
      startedAt: KIT_NOW,
      lastInteractionAt: KIT_NOW,
    });
    const res = await getOrResumeSession(
      { ...INPUT, now: minutesLater(BATCH_ABSENCE_T_MINUTES + 1) },
      deps,
    );
    expect(res.kind).toBe("empty");
    expect(deps.sessionStatePeek("u1")).toBeUndefined();
  });
});
