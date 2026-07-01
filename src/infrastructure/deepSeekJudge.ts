/**
 * The live cloud-judge adapter (spec/06 JDG-10, spec/08 NET-*): a `JudgePort` backed by DeepSeek V4
 * Flash over HTTPS. It confines the transport to infrastructure (ARCH-3) — the application/domain never
 * see DeepSeek, only the `JudgeVerdict` (JDG-4) it maps the response into or the `JudgeUnavailableError`
 * it throws on transport failure.
 *
 * Responsibilities kept here (not in the use-case): request shaping with native JSON structured output
 * (JDG-6 — GBNF/grammar decoding MUST NOT be used) over a prompt-cacheable rubric prefix (JDG-11); the
 * single backed-off retry (NET-3) — a transport retry is NOT a learner signal (NET-6) so the use-case
 * only ever sees the final resolved verdict or a thrown failure; and error classification
 * (NET-3/4/5). It NEVER fabricates a verdict: a 2xx body that is not a schema-valid verdict is thrown
 * as `invalid_response`, never guessed (INV-2, lenient-bias JDG-3).
 */
import {
  JudgeUnavailableError,
  type JudgePort,
  type JudgeRequest,
  type JudgeUnavailableReason,
} from "../application/ports/judge.js";
import type { JudgeVerdict, Replacement } from "../domain/verdict.js";
import type { DeepSeekConfig } from "./deepSeekConfig.js";
import { SYSTEM_PROMPT, calibrationMessages, userTurn } from "./deepSeekRubric.js";

/** The minimal HTTP response surface the adapter reads (a structural subset of the `fetch` Response). */
export interface HttpResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

/** The injected transport seam (defaults to global `fetch`). Injecting it keeps tests off the network. */
export type HttpPost = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<HttpResponse>;

const defaultHttpPost: HttpPost = (url, init) => fetch(url, init) as unknown as Promise<HttpResponse>;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class DeepSeekJudge implements JudgePort {
  constructor(
    private readonly config: DeepSeekConfig,
    private readonly http: HttpPost = defaultHttpPost,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    const body = this.buildRequestBody(request);

    // NET-3/NET-6: try once, then up to `retryCount` backed-off retries on a retryable transport class.
    // The learner never sees these attempts (NET-6); only the final verdict or thrown failure surfaces.
    let attempt = 0;
    for (;;) {
      try {
        return await this.attempt(body);
      } catch (error) {
        if (
          error instanceof JudgeUnavailableError &&
          isRetryable(error.reason) &&
          attempt < this.config.retryCount
        ) {
          attempt += 1;
          await this.sleep(this.config.backoffMs * attempt);
          continue;
        }
        throw error;
      }
    }
  }

  /** JDG-6/JDG-10/JDG-11: native JSON mode over the cacheable rubric prefix + few-shots + user turn. */
  private buildRequestBody(request: JudgeRequest): string {
    return JSON.stringify({
      model: this.config.model,
      response_format: { type: "json_object" }, // JDG-6: JSON mode, not GBNF
      temperature: 0, // JDG-10: minimal/deterministic — the gate must be stable
      messages: [
        { role: "system", content: SYSTEM_PROMPT }, // JDG-11: identical every call → prompt cache hit
        ...calibrationMessages(), // JDG-10: few-shot calibration
        { role: "user", content: userTurn(request) },
      ],
    });
  }

  private async attempt(body: string): Promise<JudgeVerdict> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: HttpResponse;
    try {
      response = await this.http(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`, // NET-7: key server-side only
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      // No HTTP response arrived. Our timeout firing (AbortError) is a transient timeout (NET-3); any
      // other rejection is no connectivity (NET-5). Both are retryable transport failures.
      const name = (error as { name?: string } | null | undefined)?.name;
      const reason: JudgeUnavailableReason =
        name === "AbortError" || name === "TimeoutError" ? "transient" : "offline";
      throw new JudgeUnavailableError(reason, `judge request failed (${name ?? "network error"})`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new JudgeUnavailableError("rate_limited", "judge returned 429"); // NET-4
    }
    if (response.status >= 500) {
      throw new JudgeUnavailableError("transient", `judge returned ${response.status}`); // NET-3
    }
    if (response.status < 200 || response.status >= 300) {
      // Other 4xx (400/401/403/404) is a config/auth defect — a retry can't fix a bad key, so fail
      // loud with a plain Error (the use-case rethrows it) rather than swallow it as "try again".
      throw new Error(`judge request rejected with ${response.status} (check DeepSeek config/key)`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new JudgeUnavailableError("invalid_response", "judge response body was not JSON", {
        cause: error,
      });
    }
    return parseVerdict(payload);
  }
}

function isRetryable(reason: JudgeUnavailableReason): boolean {
  // invalid_response is never retried (a bad body will not fix itself); the transport classes are.
  return reason === "transient" || reason === "offline" || reason === "rate_limited";
}

const invalid = (message: string, cause?: unknown): JudgeUnavailableError =>
  new JudgeUnavailableError("invalid_response", message, cause === undefined ? undefined : { cause });

/**
 * Map a DeepSeek chat-completion payload → `JudgeVerdict` (JDG-4). The two gate booleans are
 * load-bearing and validated strictly — a missing/non-boolean gate throws `invalid_response` rather
 * than being defaulted (never fabricate a gate — INV-2, JDG-3). The advisory fields are presentation
 * only (JDG-5), so a missing one is safely defaulted instead of failing the whole verdict.
 */
export function parseVerdict(payload: unknown): JudgeVerdict {
  const content = extractContent(payload);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw invalid("verdict content was not valid JSON", error);
  }
  if (typeof raw !== "object" || raw === null) throw invalid("verdict was not an object");
  const v = raw as Record<string, unknown>;

  if (typeof v.used_in_target_sense !== "boolean" || typeof v.grammatical !== "boolean") {
    throw invalid("verdict is missing a boolean gate field");
  }

  return {
    used_in_target_sense: v.used_in_target_sense,
    grammatical: v.grammatical,
    detected_sense: str(v.detected_sense),
    intended_sense: str(v.intended_sense),
    collocation_natural: typeof v.collocation_natural === "boolean" ? v.collocation_natural : true,
    register_fit: isRegisterFit(v.register_fit) ? v.register_fit : "ok",
    replacements: parseReplacements(v.replacements),
    corrected_sentence: str(v.corrected_sentence),
    enrichment_suggestion: typeof v.enrichment_suggestion === "string" ? v.enrichment_suggestion : null,
    one_line_feedback: str(v.one_line_feedback),
  };
}

function extractContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  const first = Array.isArray(choices) ? (choices[0] as { message?: { content?: unknown } }) : undefined;
  const content = first?.message?.content;
  if (typeof content !== "string") throw invalid("no message content in judge response");
  return content;
}

const REGISTER_FITS: ReadonlySet<string> = new Set(["ok", "informal", "formal", "off"]);
const REPLACEMENT_REASONS: ReadonlySet<string> = new Set(["grammar", "collocation", "register", "sense"]);

function isRegisterFit(value: unknown): value is JudgeVerdict["register_fit"] {
  return typeof value === "string" && REGISTER_FITS.has(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Keep only well-formed replacements (JDG-5 advisory); silently drop malformed ones (never a gate). */
function parseReplacements(value: unknown): Replacement[] {
  if (!Array.isArray(value)) return [];
  const out: Replacement[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.find === "string" && typeof r.replace === "string" && isReplacementReason(r.reason)) {
      out.push({ find: r.find, replace: r.replace, reason: r.reason });
    }
  }
  return out;
}

function isReplacementReason(value: unknown): value is Replacement["reason"] {
  return typeof value === "string" && REPLACEMENT_REASONS.has(value);
}
