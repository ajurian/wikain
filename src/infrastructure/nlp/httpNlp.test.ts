import { describe, it, expect, vi } from "vitest";
import { HttpNlp } from "./httpNlp.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";

/**
 * The runtime half of the NLP wire contract. Its twin is `python/src/wikain/service/main_test.py`,
 * which asserts the service emits exactly these keys; here we assert we consume them.
 */
const TOKENS: NlpToken[] = [
  { normal: "she", lemma: "she", pos: "PRON", isStopword: true, isWord: true },
  { normal: "abandoned", lemma: "abandon", pos: "VERB", isStopword: false, isWord: true },
];

function ok(tokens: NlpToken[]): Response {
  return new Response(JSON.stringify({ tokens }), { status: 200 });
}

const config = { baseUrl: "http://nlp:8000", token: "t" };

describe("HttpNlp", () => {
  it("returns the tokens the language service produced", async () => {
    const fetchImpl = vi.fn(async () => ok(TOKENS));
    const nlp = new HttpNlp(config, fetchImpl as unknown as typeof fetch);

    expect(await nlp.analyze("She abandoned it.")).toEqual(TOKENS);
  });

  it("sends the shared-secret bearer token (NET-7 — the service holds the DeepSeek key)", async () => {
    const fetchImpl = vi.fn(async () => ok(TOKENS));
    await new HttpNlp(config, fetchImpl as unknown as typeof fetch).analyze("hi");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://nlp:8000/analyze");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  it("analyzes a repeated sentence ONCE — the rule layer re-reads model_sentence on every submit", async () => {
    // This cache is what keeps a NET-2 rule-layer bounce to a single round trip in steady state.
    const fetchImpl = vi.fn(async () => ok(TOKENS));
    const nlp = new HttpNlp(config, fetchImpl as unknown as typeof fetch);

    await nlp.analyze("The crew abandoned the ship.");
    await nlp.analyze("The crew abandoned the ship.");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not cache across different texts", async () => {
    const fetchImpl = vi.fn(async () => ok(TOKENS));
    const nlp = new HttpNlp(config, fetchImpl as unknown as typeof fetch);

    await nlp.analyze("one");
    await nlp.analyze("two");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws when the service errors — a silently empty token list would bounce a valid sentence", async () => {
    // RL-2 reads presence off these tokens: returning [] would report the target as absent and
    // fabricate an `Again` (INV-2). Failing loudly is the only safe behavior.
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const nlp = new HttpNlp(config, fetchImpl as unknown as typeof fetch);

    await expect(nlp.analyze("hi")).rejects.toThrow(/500/);
  });
});
