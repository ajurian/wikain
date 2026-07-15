/**
 * The runtime half of the offline heal loop (spec/13 FIT-11, DM-10). `submitCloze` records an
 * unlisted-but-plausible typed word here; the next catalog build classifies the queue via the FIT-3
 * rubric and merges the result into `cloze_fit_set`, closing the gap fleet-wide.
 *
 * Deliberately anonymous: the entry carries NO user identity — it describes a gap in the catalog,
 * not a learner. Repeat writes of the same (senseId, typedLemma) must be idempotent (the row's
 * existence doubles as the never-re-queue memory across builds).
 */
export interface HealQueueEntry {
  senseId: string;
  typedLemma: string;
  /** The cloze sentence AS PRESENTED — a later fit_set_version may rewrite it, so it is snapshotted. */
  clozedSentence: string;
}

export interface HealQueuePort {
  /** Idempotent on (senseId, typedLemma); never throws a duplicate. */
  record(entry: HealQueueEntry): Promise<void>;
}
