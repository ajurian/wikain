/**
 * Lemmatizer + SentenceAnalyzer adapter (TIER-5, RL-2, RL-3) backed by the en-US wink engine (DM-9)
 * — the same NLP the build pipeline grades with (build/stageC.ts). Setting en-US is load-bearing:
 * otherwise American sentences are bounced as word-absent, silently distorting scheduling (INV-2).
 *
 * One adapter implements both narrow ports (SOLID-4): `formsOf` for presence/cued grading, `analyze`
 * for the rule layer's POS-driven degeneracy check.
 */
import winkNLP, { type ItemToken, type ItsFunction, type WinkMethods } from "wink-nlp";
import model from "wink-eng-lite-web-model";
import type { Lemmatizer } from "../../application/ports/lemmatizer.js";
import type { SentenceAnalyzer } from "../../application/ports/sentenceAnalyzer.js";
import type { NlpToken } from "../../domain/review/ruleLayer.js";

const nlp: WinkMethods = winkNLP(model);
const its = nlp.its;

export class WinkLemmatizer implements Lemmatizer, SentenceAnalyzer {
  formsOf(text: string): string[] {
    const forms: string[] = [];
    const doc = nlp.readDoc(text);
    doc.tokens().each((t: ItemToken) => {
      forms.push(t.out(its.normal).toLowerCase());
      forms.push(t.out(its.lemma as unknown as ItsFunction<string>).toLowerCase());
    });
    return forms;
  }

  analyze(text: string): NlpToken[] {
    const tokens: NlpToken[] = [];
    const doc = nlp.readDoc(text);
    doc.tokens().each((t: ItemToken) => {
      tokens.push({
        normal: t.out(its.normal).toLowerCase(),
        lemma: t.out(its.lemma as unknown as ItsFunction<string>).toLowerCase(),
        // wink emits Universal POS tags (NOUN/VERB/ADJ/ADV/PROPN/DET/ADP/PRON/PUNCT/…).
        pos: t.out(its.pos as unknown as ItsFunction<string>),
        isStopword: t.out(its.stopWordFlag as unknown as ItsFunction<string>) as unknown as boolean,
        isWord: t.out(its.type) === "word",
      });
    });
    return tokens;
  }
}
