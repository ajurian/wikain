import { InMemoryCardRepository } from "../../infrastructure/inMemoryCardRepository.js";
import {
  composeReviewPass,
  composeResolvePrompt,
  composeSession,
} from "../../infrastructure/composition.js";
import { FakeJudge, passingVerdict } from "../../infrastructure/fakeJudge.js";
import type { StartSessionDeps } from "../../application/startSession.js";
import type { RunReviewPassDeps } from "../../application/runReviewPass.js";
import type { ResolveReviewPromptDeps } from "../../application/resolveReviewPrompt.js";

/**
 * Server-only composition for the deterministic review slice. Imported only by server-function
 * handlers, so the infrastructure (fs / wink / ts-fsrs) never reaches the client bundle.
 *
 * ONE in-memory store is shared across every server-function call in this process, so a session seeded
 * by `startSessionFn` is visible to `submitReviewFn` in the same running server. A fresh dev-server
 * process starts empty and is re-seeded on the next `startSession`. The real DB (Neon/Drizzle, STACK-3)
 * and BetterAuth (STACK-4) are deferred (PRAG-1) — this keeps the slice fully offline.
 */
const cards = new InMemoryCardRepository();

/**
 * Deterministic tiers never reach the judge; a passing FakeJudge keeps any stray free submission
 * harmless and offline. The real DeepSeek judge is wired later via `liveJudge` (spec/06/08).
 */
const judge = new FakeJudge(passingVerdict());

export function sessionDeps(): StartSessionDeps {
  return composeSession(cards);
}

export function reviewDeps(): RunReviewPassDeps {
  return { ...composeReviewPass(judge), cards };
}

export function promptDeps(): ResolveReviewPromptDeps {
  return composeResolvePrompt(cards);
}
