/**
 * Drizzle-backed HealQueuePort (spec/13 FIT-11, DM-10, STACK-3/6). Same dialect-agnostic `DrizzleDb`
 * handle as the other adapters (pglite in tests, Neon in production).
 *
 * `onConflictDoNothing` on the `(sense_id, typed_lemma)` PK is the whole design: the write is
 * idempotent under review-loop retries, the FIRST cloze-sentence snapshot wins, and a row that the
 * (deferred) heal-ingest tooling has already processed is never re-queued — the row's existence IS
 * the memory. No read method: the runtime only ever writes; the queue is drained offline.
 */
import type { HealQueueEntry, HealQueuePort } from "~/application/ports/healQueue.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { clozeHealQueue } from "../db/schema.js";

export class DrizzleHealQueue implements HealQueuePort {
  constructor(private readonly db: DrizzleDb) {}

  async record(entry: HealQueueEntry): Promise<void> {
    await this.db
      .insert(clozeHealQueue)
      .values({
        senseId: entry.senseId,
        typedLemma: entry.typedLemma,
        clozedSentence: entry.clozedSentence,
      })
      .onConflictDoNothing();
  }
}
