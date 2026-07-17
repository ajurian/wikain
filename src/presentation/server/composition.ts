import { DrizzleCardRepository } from "~/infrastructure/persistence/drizzleCardRepository.js";
import { DrizzleVerdictMemo } from "~/infrastructure/persistence/drizzleVerdictMemo.js";
import { DrizzlePlacementMarks } from "~/infrastructure/persistence/drizzlePlacementMarks.js";
import { DrizzlePlacementProfile } from "~/infrastructure/persistence/drizzlePlacementProfile.js";
import { DrizzleSettings } from "~/infrastructure/persistence/drizzleSettings.js";
import { DrizzleCatalog } from "~/infrastructure/persistence/drizzleCatalog.js";
import { DrizzleWordSource } from "~/infrastructure/persistence/drizzleWordSource.js";
import { DrizzleHealQueue } from "~/infrastructure/persistence/drizzleHealQueue.js";
import { dbFromEnv } from "~/infrastructure/db/postgres.js";
import { makeAuth, type Auth } from "~/infrastructure/auth/auth.js";
import {
  composeReviewPass,
  composeResolvePrompt,
  composeSession,
  composeSeeding,
  composeUsableCounter,
  composeDashboardSummary,
  composeWords,
  composePlacementSlate,
  composeRecordPlacementMarks,
} from "~/infrastructure/composition.js";
import { HttpNlp } from "~/infrastructure/nlp/httpNlp.js";
import {
  HttpJudge,
  fetchJudgeVersions,
} from "~/infrastructure/judge/httpJudge.js";
import type { JudgePort } from "~/application/ports/judge.js";
import type { CardRepository } from "~/application/ports/cardRepository.js";
import type {
  MemoVersions,
  VerdictMemoPort,
} from "~/application/ports/verdictMemo.js";
import type { PlacementMarksStore } from "~/application/ports/placementMarks.js";
import type { PlacementProfileStore } from "~/application/ports/placementProfile.js";
import type { SettingsStore } from "~/application/ports/settings.js";
import type { StartSessionDeps } from "~/application/session/startSession.js";
import type { SeedIntroductionsDeps } from "~/application/session/seedIntroductions.js";
import type { RunReviewPassDeps } from "~/application/review/runReviewPass.js";
import type { ResolveReviewPromptDeps } from "~/application/review/resolveReviewPrompt.js";
import type { ReviewTier } from "~/domain/review/review.js";
import type { ReadUsableCounterDeps } from "~/application/progress/readUsableCounter.js";
import type { ReadDashboardSummaryDeps } from "~/application/progress/readDashboardSummary.js";
import type { ReadWordsListDeps } from "~/application/progress/readWordsList.js";
import type { ReadWordDetailDeps } from "~/application/progress/readWordDetail.js";
import type { ReadPlacementSlateDeps } from "~/application/placement/readPlacementSlate.js";
import type { RecordPlacementMarksDeps } from "~/application/placement/recordPlacementMarks.js";
import type { ReadSettingsDeps } from "~/application/readSettings.js";
import type { UpdateSettingsDeps } from "~/application/updateSettings.js";
import type { ReadPlacementProfileDeps } from "~/application/placement/readPlacementProfile.js";
import type { RecordCoarseLevelDeps } from "~/application/placement/recordCoarseLevel.js";
import type { RecordLexTaleResultDeps } from "~/application/placement/recordLexTaleResult.js";
import type { CompleteOnboardingDeps } from "~/application/placement/completeOnboarding.js";

/**
 * Server-only composition root (ARCH-3): the single place the concrete adapters are wired to the
 * application's ports. Imported only by server-function handlers + the auth route, so the infrastructure
 * (Neon / ts-fsrs / BetterAuth / the language-service clients) and every secret it reads never reach the
 * client bundle.
 *
 * The app **requires** its secrets — there is no offline/in-memory fallback (removed with STACK-4).
 * Missing any of them is a hard error at module load, so a misconfigured deploy fails fast instead of
 * silently degrading. Run `npm run db:migrate` against Neon once before boot, and bring the language
 * service up (`docker compose up -d nlp`).
 *
 * `DEEPSEEK_API_KEY` is NOT read here any more: the judge now lives in the Python language service, which
 * holds the key. This process only needs the URL + shared token to reach it (NET-7).
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set (required, server-side — NET-7).`);
  return value;
}

// Fail fast on a misconfigured deploy: every one of these is mandatory (no fallbacks).
requireEnv("DATABASE_URL");
const BETTER_AUTH_SECRET = requireEnv("BETTER_AUTH_SECRET");
const NLP_SERVICE_URL = requireEnv("NLP_SERVICE_URL");
const NLP_SERVICE_TOKEN = requireEnv("NLP_SERVICE_TOKEN");

const REVIEW_TIERS: readonly ReviewTier[] = [
  "recognition",
  "cloze",
  "cued",
  "free",
];

/**
 * DEV ONLY (`WIKAIN_DEV_TIER=cloze`): pin every card to one tier so a single review state can be driven
 * without seeding cards at the matching mastery.
 *
 * It is resolved HERE, once, and injected into both `reviewDeps()` and `promptDeps()` — because the two
 * must never disagree. This replaces a hardcoded `const tier = "cued"` that had been pasted into
 * `runReviewPass` AND `resolveReviewPrompt` separately: pinning one but not the other renders one tier's
 * prompt while a different tier grades the response, silently (`resolveReviewTier`'s docstring names that
 * as the exact failure it exists to prevent).
 *
 * Unknown value → throw (halt, don't guess). Set in production → throw: it would corrupt real FSRS
 * scheduling for every learner at once.
 */
function devTierOverride(): ReviewTier | undefined {
  const raw = process.env.WIKAIN_DEV_TIER;
  if (!raw) return undefined;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WIKAIN_DEV_TIER is set in production. It pins every learner's review tier — unset it.",
    );
  }
  if (!REVIEW_TIERS.includes(raw as ReviewTier)) {
    throw new Error(
      `WIKAIN_DEV_TIER="${raw}" is not a review tier (${REVIEW_TIERS.join(" | ")}).`,
    );
  }
  return raw as ReviewTier;
}

const DEV_TIER = devTierOverride();

/**
 * ONE Neon handle (lazy connection, built synchronously) shared by every store — cards, the verdict memo
 * (DM-8), placement marks (SEED-2/7), settings (CNT-8), AND BetterAuth (STACK-4) — so all of them persist
 * to the same Postgres under the same `user_id`, and a row written by one server function is visible to
 * the next. The connection string is read only here (NET-7 / STACK-3).
 */
const db = dbFromEnv();

const cards: CardRepository = new DrizzleCardRepository(db);
const memo: VerdictMemoPort = new DrizzleVerdictMemo(db);
const marks: PlacementMarksStore = new DrizzlePlacementMarks(db);
const profile: PlacementProfileStore = new DrizzlePlacementProfile(db);
const settings: SettingsStore = new DrizzleSettings(db);
// FIT-11: the typed-cloze heal queue — anonymous, global (no user_id), written by the review pass only.
const healQueue = new DrizzleHealQueue(db);

/**
 * The catalog + frontier word source (spec/12 DM-2, SEED-5). The catalog is GLOBAL, immutable content —
 * hydrated ONCE per instance here (top-level `await`: a single `SELECT *` at cold start), so `Catalog.get`
 * stays synchronous on the hot paths (NET-2 instant bounce, prompt render) and NOTHING reads the
 * filesystem at request time. The word source stays a live SQL selector (`ORDER BY zipf_rank … LIMIT`).
 * Both go through the ONE shared Neon handle. Seed the table first with `npm run db:seed:catalog`.
 */
const catalog = await DrizzleCatalog.hydrate(db);
const wordSource = new DrizzleWordSource(db);

/**
 * The BetterAuth server instance (STACK-4), constructed over the shared Neon handle. The secret is read
 * here (server-side, NET-7) and injected; `BETTER_AUTH_URL` is optional (falls back to the request
 * origin). Used by the `/api/auth/$` handler route and `currentUserId()` for session→principal resolution.
 */
export const auth: Auth = makeAuth(db, {
  secret: BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

/**
 * The language service (spec/06/08): the judge AND the NLP engine, both behind their existing ports.
 *
 * `analyzer` is built ONCE per instance, not per request — it caches catalog `model_sentence` analyses,
 * which is what keeps the NET-2 rule-layer bounce to a single round trip in steady state.
 *
 * The memo versions (MEMO-6) are fetched from the service at cold start rather than mirrored into env
 * vars here. The rubric version is a property of the judge that produced the verdict, so asking the judge
 * is the only way it cannot silently drift out of sync and serve a stale memoized verdict (JDG-9).
 */
const languageService = { baseUrl: NLP_SERVICE_URL, token: NLP_SERVICE_TOKEN };
const analyzer = new HttpNlp(languageService);
const judge: JudgePort = new HttpJudge(languageService);
const judgeVersions: MemoVersions = await fetchJudgeVersions(languageService);

export function sessionDeps(): StartSessionDeps {
  return composeSession(cards, marks, catalog, wordSource);
}

/** Deps for first-session seeding (spec/09 SEED-1). Shares the same card store so onboarding-seeded
 * cards are the very cards the review pass / dashboard / words reads then see, AND the same marks store
 * so a word the learner flagged known enters at `Recognized` (SEED-7 / SM-11). */
export function seedingDeps(): SeedIntroductionsDeps {
  return composeSeeding(cards, marks, catalog, wordSource);
}

/** Deps for the onboarding placement slate (spec/09 SEED-2) — the frontier candidates offered for
 * marking. Shares the same card store so already-carded words are excluded (SEED-7). */
export function placementSlateDeps(): ReadPlacementSlateDeps {
  return composePlacementSlate(cards, catalog, wordSource);
}

/** Deps for recording placement marks (spec/09 SEED-2). Shares the SAME store `seedingDeps` reads, so
 * a mark recorded here is consulted when the seeder later reaches that word. */
export function recordMarksDeps(): RecordPlacementMarksDeps {
  return composeRecordPlacementMarks(marks);
}

export function reviewDeps(): RunReviewPassDeps {
  return composeReviewPass(
    judge,
    cards,
    memo,
    judgeVersions,
    catalog,
    analyzer,
    healQueue,
    DEV_TIER,
  );
}

export function promptDeps(): ResolveReviewPromptDeps {
  return composeResolvePrompt(cards, catalog, DEV_TIER);
}

/** Deps for the "words you can use" counter read-model (spec/10). Shares the same store + a real
 * scheduler, so retrievability (CNT-3) is read live off the persisted cards the review pass writes. */
export function counterDeps(): ReadUsableCounterDeps {
  return composeUsableCounter(cards);
}

/** Deps for the dashboard read-model (spec/01 SM-1, spec/10 CNT-8, SEED-6). Shares the same card store
 * the review pass writes; `settings` supplies the learner's adjustable daily goal (CNT-8). */
export function dashboardDeps(): ReadDashboardSummaryDeps {
  return composeDashboardSummary(cards, settings);
}

/** Deps for the per-word read-models (spec/10 CNT-1/2/3). Shares the same store + a real scheduler, so
 * `/words` shows the live retrievability + real mastery history the review pass writes. */
export function wordsDeps(): ReadWordsListDeps & ReadWordDetailDeps {
  return composeWords(cards, catalog);
}

/** Deps for the settings read/write use-cases (spec/10 CNT-8). The one settings store, shared with the
 * dashboard so a goal change is immediately reflected in the goal ring. */
export function settingsDeps(): ReadSettingsDeps & UpdateSettingsDeps {
  return { settings };
}

/**
 * Deps for the placement-profile use-cases (spec/09 SEED-1/2/4). The ONE profile store, shared by the
 * onboarding writes, the `_onboarded` route guard's read (via `getSessionFn`), the session start's frontier
 * band, and `/settings` — so the band the learner places at is the band every later session seeds at.
 */
export function placementProfileDeps(): ReadPlacementProfileDeps &
  RecordCoarseLevelDeps &
  RecordLexTaleResultDeps &
  CompleteOnboardingDeps {
  return { profile };
}
