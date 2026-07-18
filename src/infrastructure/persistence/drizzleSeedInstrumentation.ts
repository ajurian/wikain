/**
 * Drizzle-backed SeedInstrumentationStore (spec/09 SEED-14, STACK-3/6). Append-only writer for the
 * seeding-rail log; like the heal queue it has one implementation and write-only semantics, so its
 * guarantees live in the SQL shape (`seed_events`) rather than a shared contract file.
 */
import type {
  DeniedSeedEvent,
  GrantedSeedEvent,
  SeedInstrumentationStore,
} from "~/application/ports/seedInstrumentation.js";
import type { DrizzleDb } from "./drizzleCardRepository.js";
import { seedEvents } from "../db/schema.js";

export class DrizzleSeedInstrumentation implements SeedInstrumentationStore {
  constructor(private readonly db: DrizzleDb) {}

  async recordGrant(event: GrantedSeedEvent): Promise<void> {
    await this.db.insert(seedEvents).values({
      userId: event.userId,
      at: event.seededAt,
      outcome: "granted",
      count: event.count,
      hadBacklog: event.hadBacklog,
    });
  }

  async recordDenial(event: DeniedSeedEvent): Promise<void> {
    await this.db.insert(seedEvents).values({
      userId: event.userId,
      at: event.at,
      outcome: "denied",
      failingClause: event.failingClause,
    });
  }
}
