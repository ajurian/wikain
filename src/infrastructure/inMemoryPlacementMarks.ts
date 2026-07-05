/**
 * In-memory PlacementMarksStore (the Drizzle adapter mirrors it — STACK-3). Keeps first-session
 * seeding runnable with no database. One set of marked senseIds per user; `record` is idempotent
 * (a Set dedupes) and additive (SEED-2).
 */
import type { PlacementMarksStore } from "../application/ports/placementMarks.js";

export class InMemoryPlacementMarks implements PlacementMarksStore {
  private readonly byUser = new Map<string, Set<string>>();

  async record(userId: string, senseIds: readonly string[]): Promise<void> {
    let marks = this.byUser.get(userId);
    if (marks === undefined) {
      marks = new Set();
      this.byUser.set(userId, marks);
    }
    for (const senseId of senseIds) marks.add(senseId);
  }

  async list(userId: string): Promise<string[]> {
    return [...(this.byUser.get(userId) ?? [])];
  }
}
