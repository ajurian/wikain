/**
 * Drizzle-backed SessionStateStore (spec/14 BAT-11, STACK-3/6). Same dialect-agnostic `DrizzleDb`
 * handle as the other adapters (pglite in tests, Neon in production).
 *
 * One row per user, replaced wholesale on `save` (PK upsert): the state is small, self-contained
 * presentation state, so partial patching would only invite drift between fields that always
 * change together (entries + progressIndex + lastInteractionAt).
 */
import { eq } from "drizzle-orm";
import type {
  ActiveSessionState,
  SessionStateStore,
} from "~/application/ports/sessionState.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { sessionState } from "../db/schema.js";

export class DrizzleSessionState implements SessionStateStore {
  constructor(private readonly db: DrizzleDb) {}

  async load(userId: string): Promise<ActiveSessionState | undefined> {
    const rows = await this.db
      .select()
      .from(sessionState)
      .where(eq(sessionState.userId, userId));
    const row = rows[0];
    if (row === undefined) return undefined;
    return {
      userId: row.userId,
      batchId: row.batchId,
      batchNumber: row.batchNumber,
      entries: row.entries,
      progressIndex: row.progressIndex,
      startedAt: row.startedAt,
      lastInteractionAt: row.lastInteractionAt,
    };
  }

  async save(state: ActiveSessionState): Promise<void> {
    const { userId: _userId, ...rest } = state;
    await this.db
      .insert(sessionState)
      .values(state)
      .onConflictDoUpdate({ target: sessionState.userId, set: rest });
  }

  async clear(userId: string): Promise<void> {
    await this.db.delete(sessionState).where(eq(sessionState.userId, userId));
  }
}
