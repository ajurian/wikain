/**
 * SEED-10/11 over a real, migrated pglite database. Like the heal queue, the port has one
 * implementation and near-trivial semantics, so its guarantees are asserted here directly
 * rather than through a shared contract file.
 */
import { describe, expect, it } from "vitest";
import { DrizzleSeedLedger } from "./drizzleSeedLedger.js";
import { makePgliteDb } from "../db/pglite.js";
import { USER_A, USER_B } from "../testIds.js";

describe("DrizzleSeedLedger (pglite)", () => {
  it("SEED-11: no ledger row means seeding never ran (undefined, not a fabricated instant)", async () => {
    const ledger = new DrizzleSeedLedger(await makePgliteDb());
    expect(await ledger.read(USER_A)).toBeUndefined();
  });

  it("SEED-11: the instant + day-count round-trip and a later record overwrites both", async () => {
    const ledger = new DrizzleSeedLedger(await makePgliteDb());
    const first = new Date("2026-07-17T10:00:00.000Z");
    const second = new Date("2026-07-18T09:30:00.000Z");
    await ledger.record(USER_A, first, 2);
    expect(await ledger.read(USER_A)).toEqual({ lastSeedAt: first, seededCount: 2 });
    await ledger.record(USER_A, second, 5);
    expect(await ledger.read(USER_A)).toEqual({ lastSeedAt: second, seededCount: 5 });
  });

  it("multi-tenant: user B has their own ledger", async () => {
    const ledger = new DrizzleSeedLedger(await makePgliteDb());
    await ledger.record(USER_A, new Date("2026-07-17T10:00:00.000Z"), 3);
    expect(await ledger.read(USER_B)).toBeUndefined();
  });
});
