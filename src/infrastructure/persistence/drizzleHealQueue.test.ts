/**
 * DrizzleHealQueue over a real, migrated pglite database (spec/13 FIT-11, DM-10). The port exposes
 * only `record` (the runtime never reads the queue), so — unlike the other adapters — there is no
 * shared port contract to run: the assertions query the table directly, because the dedup/anonymity
 * guarantees live in the SQL shape itself.
 */
import { describe, expect, it } from "vitest";
import { DrizzleHealQueue } from "./drizzleHealQueue.js";
import { clozeHealQueue } from "../db/schema.js";
import { makePgliteDb } from "../db/pglite.js";

const ENTRY = {
  senseId: "owe_verb_01",
  typedLemma: "borrow",
  clozedSentence: "I still _ my brother fifty pesos.",
};

describe("DrizzleHealQueue (pglite)", () => {
  it("FIT-11: records a wrong-path word with the cloze sentence as presented", async () => {
    const db = await makePgliteDb();
    await new DrizzleHealQueue(db).record(ENTRY);

    const rows = await db.select().from(clozeHealQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.senseId).toBe("owe_verb_01");
    expect(rows[0]!.typedLemma).toBe("borrow");
    expect(rows[0]!.clozedSentence).toBe(ENTRY.clozedSentence);
    expect(rows[0]!.queuedAt).toBeInstanceOf(Date);
    expect(rows[0]!.processedAt).toBeNull(); // stamped only by the offline heal tooling, never here
  });

  it("FIT-11 / DM-10: a repeat (sense, lemma) write is a no-op — the first snapshot wins", async () => {
    const db = await makePgliteDb();
    const queue = new DrizzleHealQueue(db);
    await queue.record(ENTRY);
    await queue.record({ ...ENTRY, clozedSentence: "A later fit_set_version rewrote the frame." });

    const rows = await db.select().from(clozeHealQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clozedSentence).toBe(ENTRY.clozedSentence);
  });

  it("DM-10: distinct lemmas for the same sense are separate gaps (separate rows)", async () => {
    const db = await makePgliteDb();
    const queue = new DrizzleHealQueue(db);
    await queue.record(ENTRY);
    await queue.record({ ...ENTRY, typedLemma: "pay" });

    expect(await db.select().from(clozeHealQueue)).toHaveLength(2);
  });

  it("DM-10: the row is anonymous — no user identity column exists at all", async () => {
    const db = await makePgliteDb();
    await new DrizzleHealQueue(db).record(ENTRY);

    const [row] = await db.select().from(clozeHealQueue);
    expect(Object.keys(row!)).toEqual([
      "senseId",
      "typedLemma",
      "clozedSentence",
      "queuedAt",
      "processedAt",
    ]);
  });
});
