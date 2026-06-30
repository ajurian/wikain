/**
 * Lemmatizer adapter (TIER-5, RL-2) backed by the en-US wink engine (DM-9) — the same NLP the
 * build pipeline grades with (build/stageC.ts). Setting en-US is load-bearing: otherwise American
 * sentences are bounced as word-absent, silently distorting scheduling (INV-2).
 */
import winkNLP, { type ItemToken, type ItsFunction, type WinkMethods } from "wink-nlp";
import model from "wink-eng-lite-web-model";
import type { Lemmatizer } from "../application/ports/lemmatizer.js";

const nlp: WinkMethods = winkNLP(model);
const its = nlp.its;

export class WinkLemmatizer implements Lemmatizer {
  formsOf(text: string): string[] {
    const forms: string[] = [];
    const doc = nlp.readDoc(text);
    doc.tokens().each((t: ItemToken) => {
      forms.push(t.out(its.normal).toLowerCase());
      forms.push(t.out(its.lemma as unknown as ItsFunction<string>).toLowerCase());
    });
    return forms;
  }
}
