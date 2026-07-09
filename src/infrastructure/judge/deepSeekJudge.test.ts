import { describe, it, expect } from "vitest";
import { DeepSeekJudge, parseVerdict, type HttpPost, type HttpResponse } from "./deepSeekJudge.js";
import type { DeepSeekConfig } from "./deepSeekConfig.js";
import { JudgeUnavailableError, type JudgeRequest } from "../../application/ports/judge.js";
import { passesGate } from "../../domain/review/verdict.js";

const REQUEST: JudgeRequest = {
  sentence: "She negotiate a better price yesterday.",
  lemma: "negotiate",
  intendedSense: "to reach agreement by discussion",
  modelSentence: "They negotiate the terms of the deal.",
};

function config(overrides: Partial<DeepSeekConfig> = {}): DeepSeekConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    timeoutMs: 1000,
    retryCount: 1,
    backoffMs: 0, // no real waiting in tests
    ...overrides,
  };
}

const noSleep = async (): Promise<void> => {};

/** A 2xx chat-completion whose message content is `verdictJson` (a string, as DeepSeek returns it). */
function okResponse(verdictJson: string): HttpResponse {
  return {
    status: 200,
    json: async () => ({ choices: [{ message: { content: verdictJson } }] }),
  };
}

function statusResponse(status: number): HttpResponse {
  return { status, json: async () => ({}) };
}

const PASSING_VERDICT_JSON = JSON.stringify({
  used_in_target_sense: true,
  detected_sense: "to reach agreement by discussion",
  intended_sense: "to reach agreement by discussion",
  grammatical: true,
  collocation_natural: true,
  register_fit: "ok",
  replacements: [{ find: "negotiate", replace: "negotiated", reason: "grammar" }],
  corrected_sentence: "She negotiated a better price yesterday.",
  enrichment_suggestion: null,
  one_line_feedback: "Fix the tense.",
});

type Outcome = { response: HttpResponse } | { throws: unknown };

/** A programmable transport: each call consumes the next outcome and records the request. */
class FakeHttp {
  readonly calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  constructor(private readonly outcomes: Outcome[]) {}
  readonly post: HttpPost = async (url, init) => {
    this.calls.push({ url, body: init.body, headers: init.headers });
    const outcome = this.outcomes.shift();
    if (outcome === undefined) throw new Error("FakeHttp: no more programmed outcomes");
    if ("throws" in outcome) throw outcome.throws;
    return outcome.response;
  };
}

describe("DeepSeekJudge — request shaping (JDG-6/JDG-10/JDG-11)", () => {
  it("JDG-6: sends JSON mode (not GBNF), the JDG-10 model, and a system + few-shot + user message stack", async () => {
    const http = new FakeHttp([{ response: okResponse(PASSING_VERDICT_JSON) }]);
    await new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST);

    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]?.url).toBe("https://api.deepseek.com/chat/completions");
    expect(http.calls[0]?.headers.authorization).toBe("Bearer test-key"); // NET-7
    const body = JSON.parse(http.calls[0]!.body);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system"); // JDG-11 cacheable prefix
    expect(body.messages.at(-1).role).toBe("user");
    expect(body.messages.at(-1).content).toContain("She negotiate a better price yesterday.");
    expect(body.messages.length).toBeGreaterThan(2); // few-shots between system and user (JDG-10)
  });
});

describe("DeepSeekJudge — verdict parsing (JDG-4)", () => {
  it("JDG-4/JDG-2: parses a 2xx body into a JudgeVerdict whose gate is computable", async () => {
    const http = new FakeHttp([{ response: okResponse(PASSING_VERDICT_JSON) }]);
    const verdict = await new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST);

    expect(verdict.used_in_target_sense).toBe(true);
    expect(verdict.grammatical).toBe(true);
    expect(passesGate(verdict)).toBe(true);
    expect(verdict.replacements).toEqual([{ find: "negotiate", replace: "negotiated", reason: "grammar" }]);
  });

  it("decision-4/JDG-3: a 2xx body missing a gate field throws invalid_response — never fabricates a gate", () => {
    // A pure-parse assertion (no transport): the two gates are load-bearing and must not be defaulted.
    expect(() => parseVerdict({ choices: [{ message: { content: '{"grammatical":true}' } }] })).toThrow(
      JudgeUnavailableError,
    );
  });

  it("drops malformed advisory replacements but keeps the verdict (JDG-5 advisory)", () => {
    const content = JSON.stringify({
      used_in_target_sense: true,
      grammatical: true,
      replacements: [{ find: "x", replace: "y", reason: "grammar" }, { find: 1, reason: "bogus" }],
    });
    const verdict = parseVerdict({ choices: [{ message: { content } }] });
    expect(verdict.replacements).toEqual([{ find: "x", replace: "y", reason: "grammar" }]);
    expect(verdict.register_fit).toBe("ok"); // safely defaulted
  });
});

describe("DeepSeekJudge — failure path (spec/08 NET-*)", () => {
  it("NET-3: retries once on a 5xx then succeeds on the retry", async () => {
    const http = new FakeHttp([{ response: statusResponse(503) }, { response: okResponse(PASSING_VERDICT_JSON) }]);
    const verdict = await new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST);

    expect(http.calls).toHaveLength(2); // one retry (NET-3) — and only one (NET-6: not a learner signal)
    expect(passesGate(verdict)).toBe(true);
  });

  it("NET-3: a 5xx that persists past the retry throws JudgeUnavailableError('transient')", async () => {
    const http = new FakeHttp([{ response: statusResponse(500) }, { response: statusResponse(500) }]);
    await expect(new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST)).rejects.toMatchObject({
      name: "JudgeUnavailableError",
      reason: "transient",
    });
    expect(http.calls).toHaveLength(2); // attempt + one retry, no more
  });

  it("NET-4: a persistent 429 throws JudgeUnavailableError('rate_limited')", async () => {
    const http = new FakeHttp([{ response: statusResponse(429) }, { response: statusResponse(429) }]);
    await expect(new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST)).rejects.toMatchObject({
      reason: "rate_limited",
    });
  });

  it("NET-3: a timeout (AbortError) is transient", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const http = new FakeHttp([{ throws: abort }, { throws: abort }]);
    await expect(new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST)).rejects.toMatchObject({
      reason: "transient",
    });
  });

  it("NET-5: a network rejection with no response is 'offline'", async () => {
    const netErr = Object.assign(new TypeError("fetch failed"), { name: "TypeError" });
    const http = new FakeHttp([{ throws: netErr }, { throws: netErr }]);
    await expect(new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST)).rejects.toMatchObject({
      reason: "offline",
    });
  });

  it("decision-4: a 2xx with non-JSON content throws invalid_response and is NOT retried", async () => {
    const http = new FakeHttp([{ response: okResponse("not json {") }]);
    await expect(new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    expect(http.calls).toHaveLength(1); // a bad body will not fix on retry
  });

  it("a config/auth 4xx (401) fails loud as a plain Error, not a JudgeUnavailableError", async () => {
    const http = new FakeHttp([{ response: statusResponse(401) }]);
    const promise = new DeepSeekJudge(config(), http.post, noSleep).judge(REQUEST);
    await expect(promise).rejects.toThrow(/401/);
    await expect(promise).rejects.not.toBeInstanceOf(JudgeUnavailableError);
    expect(http.calls).toHaveLength(1); // not retried
  });
});
