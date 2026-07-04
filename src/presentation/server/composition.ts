import { InMemoryCardRepository } from "../../infrastructure/inMemoryCardRepository.js";
import { DrizzleCardRepository, type DrizzleDb } from "../../infrastructure/drizzleCardRepository.js";
import { InMemoryVerdictMemo } from "../../infrastructure/inMemoryVerdictMemo.js";
import { DrizzleVerdictMemo } from "../../infrastructure/drizzleVerdictMemo.js";
import { neonDbFromEnv } from "../../infrastructure/db/neon.js";
import {
  composeReviewPass,
  composeResolvePrompt,
  composeSession,
  composeSeeding,
  composeUsableCounter,
  composeDashboardSummary,
  composeWords,
  liveJudge,
  liveJudgeVersions,
  DEV_JUDGE_VERSIONS,
} from "../../infrastructure/composition.js";
import { devVerdict } from "../../infrastructure/devJudge.js";
import type { JudgePort } from "../../application/ports/judge.js";
import type { CardRepository } from "../../application/ports/cardRepository.js";
import type { MemoVersions, VerdictMemoPort } from "../../application/ports/verdictMemo.js";
import type { StartSessionDeps } from "../../application/startSession.js";
import type { SeedIntroductionsDeps } from "../../application/seedIntroductions.js";
import type { RunReviewPassDeps } from "../../application/runReviewPass.js";
import type { ResolveReviewPromptDeps } from "../../application/resolveReviewPrompt.js";
import type { ReadUsableCounterDeps } from "../../application/readUsableCounter.js";
import type { ReadDashboardSummaryDeps } from "../../application/readDashboardSummary.js";
import type { ReadWordsListDeps } from "../../application/readWordsList.js";
import type { ReadWordDetailDeps } from "../../application/readWordDetail.js";

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
// Build the DB handle ONCE (lazy connection) so the cards repo AND the verdict memo (DM-8) share it —
// both persist to the same Postgres under `currentUserId()`, or both fall back to process-shared
// in-memory stores when `DATABASE_URL` is unset.
const db: DrizzleDb | undefined = process.env.DATABASE_URL ? neonDbFromEnv() : undefined;

const cards: CardRepository = db
  ? new DrizzleCardRepository(db)
  : new InMemoryCardRepository();

/**
 * The verdict memo (spec/05, DM-8) is URL-gated exactly like `cards`: Drizzle over the same handle
 * when `DATABASE_URL` is set (durable per-user cache that skips a billable judge call on an identical
 * resubmission), else in-memory. Shared across every server-function call in this process.
 */
const memo: VerdictMemoPort = db ? new DrizzleVerdictMemo(db) : new InMemoryVerdictMemo();

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

/**
 * spec/05 MEMO-6: the memo version stamp tracks the active judge — the real DeepSeek model id +
 * RUBRIC_VERSION on the live path, a fixed `"dev"` stamp otherwise. Swapping the judge (key set/unset)
 * or bumping the rubric invalidates stale memoized verdicts rather than serving them across models.
 */
const judgeVersions: MemoVersions = process.env.DEEPSEEK_API_KEY
  ? liveJudgeVersions()
  : DEV_JUDGE_VERSIONS;

export function sessionDeps(): StartSessionDeps {
  return composeSession(cards);
}

/** Deps for first-session seeding (spec/09 SEED-1). Shares the same store so onboarding-seeded cards
 * are the very cards the review pass / dashboard / words reads then see. */
export function seedingDeps(): SeedIntroductionsDeps {
  return composeSeeding(cards);
}

export function reviewDeps(): RunReviewPassDeps {
  return { ...composeReviewPass(judge, undefined, memo, judgeVersions), cards };
}

export function promptDeps(): ResolveReviewPromptDeps {
  return composeResolvePrompt(cards);
}

/** Deps for the "words you can use" counter read-model (spec/10). Shares the same store + a real
 * scheduler, so retrievability (CNT-3) is read live off the persisted cards the review pass writes. */
export function counterDeps(): ReadUsableCounterDeps {
  return composeUsableCounter(cards);
}

/** Deps for the dashboard read-model (spec/01 SM-1, spec/10 CNT-8, SEED-6). Shares the same store the
 * review pass writes, so the ladder / due count / today's uses reflect real progress. */
export function dashboardDeps(): ReadDashboardSummaryDeps {
  return composeDashboardSummary(cards);
}

/** Deps for the per-word read-models (spec/10 CNT-1/2/3). Shares the same store + a real scheduler, so
 * `/words` shows the live retrievability + real mastery history the review pass writes. */
export function wordsDeps(): ReadWordsListDeps & ReadWordDetailDeps {
  return composeWords(cards);
}
