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
    expect(await ledger.lastSeedAt(USER_A)).toBeUndefined();
  });

  it("SEED-11: the recorded instant round-trips and a later record overwrites it", async () => {
    const ledger = new DrizzleSeedLedger(await makePgliteDb());
    const first = new Date("2026-07-17T10:00:00.000Z");
    const second = new Date("2026-07-18T09:30:00.000Z");
    await ledger.recordSeedAt(USER_A, first);
    expect(await ledger.lastSeedAt(USER_A)).toEqual(first);
    await ledger.recordSeedAt(USER_A, second);
    expect(await ledger.lastSeedAt(USER_A)).toEqual(second);
  });

  it("multi-tenant: user B has their own ledger", async () => {
    const ledger = new DrizzleSeedLedger(await makePgliteDb());
    await ledger.recordSeedAt(USER_A, new Date("2026-07-17T10:00:00.000Z"));
    expect(await ledger.lastSeedAt(USER_B)).toBeUndefined();
  });
});
