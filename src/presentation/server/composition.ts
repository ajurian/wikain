import { InMemoryCardRepository } from "../../infrastructure/inMemoryCardRepository.js";
import { DrizzleCardRepository } from "../../infrastructure/drizzleCardRepository.js";
import { neonDbFromEnv } from "../../infrastructure/db/neon.js";
import {
  composeReviewPass,
  composeResolvePrompt,
  composeSession,
  composeUsableCounter,
  liveJudge,
} from "../../infrastructure/composition.js";
import { devVerdict } from "../../infrastructure/devJudge.js";
import type { JudgePort } from "../../application/ports/judge.js";
import type { CardRepository } from "../../application/ports/cardRepository.js";
import type { StartSessionDeps } from "../../application/startSession.js";
import type { RunReviewPassDeps } from "../../application/runReviewPass.js";
import type { ResolveReviewPromptDeps } from "../../application/resolveReviewPrompt.js";
import type { ReadUsableCounterDeps } from "../../application/readUsableCounter.js";

/**
 * Server-only composition for the deterministic review slice. Imported only by server-function
 * handlers, so the infrastructure (fs / wink / ts-fsrs) never reaches the client bundle.
 *
 * The repository is **URL-gated** (STACK-3, mirroring the judge gate below). With `DATABASE_URL` set we
 * persist to real Postgres via the Drizzle/Neon adapter — durable across restarts, one row per
 * `(user_id, sense_id)` under `currentUserId()`. `neonDbFromEnv()` builds the handle synchronously
 * (lazy connection), so no async composition is needed; the URL is read only here, server-side (NET-7).
 * Unset, we fall back to a process-shared in-memory store so `npm run dev` stays zero-config and fully
 * offline. Either way ONE instance is shared across every server-function call in this process (all
 * three dep-factories close over it), so a session seeded by `startSessionFn` is visible to
 * `submitReviewFn`/`usableCounterFn` in the same running server. BetterAuth (STACK-4) is still deferred
 * (PRAG-1) — every request acts as the dev user via `currentUserId()`.
 *
 * Run `npm run db:migrate` against the Neon instance once before using the `DATABASE_URL` path.
 */
const cards: CardRepository = process.env.DATABASE_URL
  ? new DrizzleCardRepository(neonDbFromEnv())
  : new InMemoryCardRepository();

/**
 * The judged branch is **key-gated** (NET-7). With `DEEPSEEK_API_KEY` set we use the real DeepSeek
 * transport (`liveJudge`, spec/06/08); otherwise a content-varying **dev judge** (`devVerdict`) drives
 * every judged UI state — pass / polish / sense-fail / transient failure — with NO network and NO key,
 * so `npm run dev` exercises the whole flow offline. The key is only ever read server-side (this module
 * is imported only by server-function handlers), so it never reaches the client bundle.
 */
const judge: JudgePort = process.env.DEEPSEEK_API_KEY
  ? liveJudge()
  : { judge: async (request) => devVerdict(request) };

export function sessionDeps(): StartSessionDeps {
  return composeSession(cards);
}

export function reviewDeps(): RunReviewPassDeps {
  return { ...composeReviewPass(judge), cards };
}

export function promptDeps(): ResolveReviewPromptDeps {
  return composeResolvePrompt(cards);
}

/** Deps for the "words you can use" counter read-model (spec/10). Shares the same store + a real
 * scheduler, so retrievability (CNT-3) is read live off the persisted cards the review pass writes. */
export function counterDeps(): ReadUsableCounterDeps {
  return composeUsableCounter(cards);
}
