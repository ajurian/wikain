import { describe, it, expect } from "vitest";
import {
  judgeFirstProduction,
  type JudgeFirstProductionDeps,
} from "./judgeFirstProduction.js";
import type { LexicalItem } from "~/domain/lexicalItem.js";
import type { NlpToken } from "~/domain/review/ruleLayer.js";
import type { JudgeVerdict } from "~/domain/review/verdict.js";
import type { Catalog } from "../ports/catalog.js";
import type { SentenceAnalyzer } from "../ports/sentenceAnalyzer.js";
import { JudgeUnavailableError, type JudgePort, type JudgeRequest } from "../ports/judge.js";

const SENSE = "negotiate_verb_01";

function makeItem(): LexicalItem {
  return {
    word: "negotiate",
    lemma: "negotiate",
    part_of_speech: "verb",
    sense_id: SENSE,
    cefr: "B1",
    zipf: 4.0,
    zipf_rank: 1000,
    intended_sense: "to reach agreement by discussion",
    recognition_meaning: null,
    distractors: null,
    clozed_sentence: null,
    productive_meaning: "to reach an agreement by discussion",
    model_sentence: null,
    self_reference_prompt: null,
    gen_model: "test",
    gen_spec_version: "test",
  };
}

const catalog: Catalog = { get: (id) => (id === SENSE ? makeItem() : undefined) };

const POS: Readonly<Record<string, string>> = {
  she: "PRON",
  a: "DET",
  negotiate: "VERB",
  negotiated: "VERB",
  bought: "VERB",
  made: "VERB",
  better: "ADJ",
  contract: "NOUN",
  price: "NOUN",
  house: "NOUN",
  yesterday: "ADV",
};
const LEMMAS: Readonly<Record<string, string>> = {
  negotiated: "negotiate",
  bought: "buy",
  made: "make",
};
const STOPWORDS: ReadonlySet<string> = new Set(["she", "a"]);

/**
 * A text-DRIVEN analyzer. It must be: RL-2 presence (`formsOf`) is now derived from these very tokens,
 * so a fixed token set would smuggle the target into every response and "absent" could never bounce.
 */
const healthyAnalyzer: SentenceAnalyzer = {
  analyze: (text: string): Promise<NlpToken[]> =>
    Promise.resolve(
      text
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => ({
          normal: w,
          lemma: LEMMAS[w] ?? w,
          pos: POS[w] ?? "NOUN",
          isStopword: STOPWORDS.has(w),
          isWord: true,
        })),
    ),
};

function verdict(overrides: Partial<JudgeVerdict> = {}): JudgeVerdict {
  return {
    used_in_target_sense: true,
    detected_sense: "to reach agreement by discussion",
    intended_sense: "to reach agreement by discussion",
    grammatical: true,
    collocation_natural: true,
    register_fit: "ok",
    replacements: [],
    corrected_sentence: "",
    enrichment_suggestion: null,
    one_line_feedback: "",
    ...overrides,
  };
}

class RecordingJudge implements JudgePort {
  readonly calls: JudgeRequest[] = [];
  constructor(private readonly reply: JudgeVerdict) {}
  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    this.calls.push(request);
    return this.reply;
  }
}

class UnavailableJudge implements JudgePort {
  readonly calls: JudgeRequest[] = [];
  constructor(private readonly reason: JudgeUnavailableError["reason"] = "transient") {}
  async judge(request: JudgeRequest): Promise<JudgeVerdict> {
    this.calls.push(request);
    throw new JudgeUnavailableError(this.reason);
  }
}

function deps(judge: JudgePort): JudgeFirstProductionDeps {
  return {
    catalog,
    analyzer: healthyAnalyzer,
    tagalogLexicon: new Set<string>(),
    judge,
  };
}

describe("judgeFirstProduction (SEED-1)", () => {
  it("bounces before reaching the judge when the target lemma is absent (RL-2 / INV-2)", async () => {
    const judge = new RecordingJudge(verdict());
    // No "negotiate" token → RL-2 absent bounce; the judge must not be called.
    const result = await judgeFirstProduction(
      { senseId: SENSE, response: "she made a better contract price yesterday" },
      deps(judge),
    );
    expect(result.kind).toBe("bounce");
    expect(judge.calls).toHaveLength(0);
  });

  it("returns a judged win on a rule pass + gate pass (JDG-2), with no persistence deps required", async () => {
    const judge = new RecordingJudge(verdict());
    const result = await judgeFirstProduction(
      { senseId: SENSE, response: "she negotiate a better contract price yesterday" },
      deps(judge),
    );
    expect(result).toEqual({ kind: "judged", passed: true, verdict: verdict() });
    expect(judge.calls).toHaveLength(1);
    // The deps type carries no cards/scheduler — a review here is structurally impossible.
  });

  it("still returns a judged outcome (win-eligible) when the gate fails (SEED-1: any judged result)", async () => {
    const judge = new RecordingJudge(verdict({ used_in_target_sense: false }));
    const result = await judgeFirstProduction(
      { senseId: SENSE, response: "she negotiate a better contract price yesterday" },
      deps(judge),
    );
    expect(result.kind).toBe("judged");
    if (result.kind === "judged") expect(result.passed).toBe(false);
  });

  it("surfaces an unavailable outcome on a judge transport failure (spec/08 NET-3)", async () => {
    const judge = new UnavailableJudge("transient");
    const result = await judgeFirstProduction(
      { senseId: SENSE, response: "she negotiate a better contract price yesterday" },
      deps(judge),
    );
    expect(result).toEqual({ kind: "unavailable", reason: "transient" });
  });
});
