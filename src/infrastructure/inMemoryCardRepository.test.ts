/**
 * The in-memory repo runs the shared port contract (spec/12 DM-5..DM-7) — the same suite the Drizzle
 * adapter runs, proving both are substitutable (SOLID-3).
 */
import { describeCardRepositoryContract } from "./cardRepositoryContract.js";
import { InMemoryCardRepository } from "./inMemoryCardRepository.js";

describeCardRepositoryContract("InMemoryCardRepository", async () => new InMemoryCardRepository());
