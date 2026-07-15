import {
  JudgeUnavailableError,
  type JudgePort,
  type JudgeRequest,
  type JudgeUnavailableReason,
} from "~/application/ports/judge.js";
import type { MemoVersions } from "~/application/ports/verdictMemo.js";
import type { JudgeVerdict } from "~/domain/review/verdict.js";

/**
 * The `JudgePort` adapter: the Python language service's `POST /judge`.
 *
 * The DeepSeek transport — the rubric, the JSON-mode request, the single backed-off retry (NET-3),
 * and the 429/5xx/bad-body taxonomy — now lives in the service, closest to the paid API and in ONE
 * place. This adapter is the thin half: it carries the request across, and maps the service's
 * structured failure back onto the four `JudgeUnavailableReason`s the application already understands.
 * Nothing above infrastructure changed — `JudgePort` was always async (ARCH-3).
 */
export interface HttpJudgeConfig {
  baseUrl: string;
  token: string;
  /** Comfortably above the service's own DeepSeek timeout + its one retry. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;

const REASONS: ReadonlySet<string> = new Set([
  "transient",
  "rate_limited",
  "offline",
  "invalid_response",
]);

interface UnavailableBody {
  reason?: unknown;
}

export class HttpJudge implements JudgePort {
  constructor(
    private readonly config: HttpJudgeConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/judge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      // The SERVICE is unreachable (not DeepSeek). No verdict was produced, so this is the same
      // no-rating outcome as any transport failure (INV-2) — the card stays due.
      const name = (error as { name?: string } | null)?.name;
      const reason: JudgeUnavailableReason =
        name === "AbortError" || name === "TimeoutError" ? "transient" : "offline";
      throw new JudgeUnavailableError(reason, `judge service unreachable (${name ?? "network"})`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 503) {
      // The service reached DeepSeek and it failed; it tells us WHICH failure so the UI can pick the
      // right neutral message (NET-3/4/5). It never sends a fabricated verdict in this arm.
      const body = (await response.json().catch(() => ({}))) as UnavailableBody;
      const reason = typeof body.reason === "string" && REASONS.has(body.reason)
        ? (body.reason as JudgeUnavailableReason)
        : "transient";
      throw new JudgeUnavailableError(reason, `judge unavailable: ${reason}`);
    }

    if (!response.ok) {
      // A 401/500 from our OWN service is a deployment defect (bad token, bad key). Retrying cannot
      // fix it, so fail loud rather than let it read as a soft "try again" (mirrors the 4xx arm there).
      throw new Error(`judge service rejected the request with ${response.status}`);
    }

    const verdict = (await response.json()) as JudgeVerdict;
    if (
      typeof verdict?.used_in_target_sense !== "boolean" ||
      typeof verdict?.grammatical !== "boolean"
    ) {
      // Never fabricate a gate (INV-2, JDG-3). The service validates this too; this is the belt to
      // its braces, because a defaulted gate would silently invent a pass or a fail.
      throw new JudgeUnavailableError("invalid_response", "judge returned no boolean gate field");
    }
    return verdict;
  }
}

interface VersionsBody {
  modelVersion?: unknown;
  rubricVersion?: unknown;
}

/**
 * MEMO-*: the verdict memo is keyed on the model + rubric version, and the lookup happens BEFORE the
 * judge is called — so the runtime must know them up front. Fetched once at cold start, alongside the
 * catalog hydration, rather than duplicated as env vars that could silently drift from the service.
 */
export async function fetchJudgeVersions(
  config: HttpJudgeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MemoVersions> {
  const response = await fetchImpl(`${config.baseUrl}/versions`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) {
    throw new Error(`judge service /versions failed with ${response.status}`);
  }
  const body = (await response.json()) as VersionsBody;
  if (typeof body.modelVersion !== "string" || typeof body.rubricVersion !== "string") {
    throw new Error("judge service /versions returned an unusable body");
  }
  return { modelVersion: body.modelVersion, rubricVersion: body.rubricVersion };
}
