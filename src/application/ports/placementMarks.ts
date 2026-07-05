/**
 * The per-user placement-marks store (spec/09-seeding-placement.md SEED-2/7, ARCH-3). One of the three
 * SEPARATE placement mechanisms: per-word known/unknown flags whose ONLY effect is that a marked word
 * skips `Seen` and enters `Recognized` when the pacer lazily creates its card (SEED-7 / SM-11). The
 * frontier band never marks a word (SEED-3), so this is the only input that can skip `Seen`.
 *
 * Narrow by intent (SOLID-4): the onboarding write records marks; the seeder reads them. Both are
 * scoped by `userId` — a mark is never shared across accounts (multi-tenant, like the card repo).
 * A mark is just the existence of the (user, sense) flag; `record` is idempotent (marking a word
 * known twice leaves it known).
 */
export interface PlacementMarksStore {
  /**
   * SEED-2: flag these senseIds placement-known for the user. Idempotent and additive — re-recording
   * an already-marked word is a no-op, and separate calls accumulate. Never removes a mark (v1 has no
   * un-mark path; PRAG-1).
   */
  record(userId: string, senseIds: readonly string[]): Promise<void>;

  /**
   * SEED-7: the senseIds this user has marked placement-known. The seeder consults this so a marked
   * word instantiates directly into `Recognized` when the pacer reaches it. Order is unspecified.
   */
  list(userId: string): Promise<string[]>;
}
