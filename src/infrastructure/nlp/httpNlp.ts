import type { SentenceAnalyzer } from "~/application/ports/sentenceAnalyzer.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";

/**
 * The `SentenceAnalyzer` adapter: the Python language service's `POST /analyze` (spaCy).
 *
 * This is the SAME engine the content pipeline validates with (`wikain.nlp`, imported in-process
 * there). That is the whole point of the service: Stage C asserts a `model_sentence` contains a form
 * of the lemma, and RL-2/TIER-5 re-derive exactly that at review time. Two engines could disagree and
 * bounce a correct sentence as "word absent" — a fabricated `Again` that corrupts FSRS (INV-2).
 */
export interface HttpNlpConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Analysis is a pure function of the text, so caching it is always sound. The cap is what makes it
 * safe: catalog `model_sentence`s are re-analyzed on every submission for their word and stay hot,
 * while each learner sentence is seen once and ages out instead of growing the map forever.
 */
const MAX_CACHED_ANALYSES = 500;

interface AnalyzeResponse {
  tokens: NlpToken[];
}

export class HttpNlp implements SentenceAnalyzer {
  private readonly cache = new Map<string, NlpToken[]>();

  constructor(
    private readonly config: HttpNlpConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyze(text: string): Promise<NlpToken[]> {
    const cached = this.cache.get(text);
    if (cached !== undefined) {
      // Re-insert to mark as recently used (Map preserves insertion order).
      this.cache.delete(text);
      this.cache.set(text, cached);
      return cached;
    }

    const tokens = await this.post(text);

    if (this.cache.size >= MAX_CACHED_ANALYSES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(text, tokens);
    return tokens;
  }

  private async post(text: string): Promise<NlpToken[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/analyze`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`nlp service /analyze failed with ${response.status}`);
      }
      const payload = (await response.json()) as AnalyzeResponse;
      if (!Array.isArray(payload.tokens)) {
        throw new Error("nlp service /analyze returned no tokens");
      }
      return payload.tokens;
    } finally {
      clearTimeout(timer);
    }
  }
}
