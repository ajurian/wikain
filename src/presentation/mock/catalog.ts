/*
 * ============================================================================
 * MOCK DATA — design-time only. TO BE REPLACED.
 * ----------------------------------------------------------------------------
 * This module fakes the lexical-item catalog (DM-2, build/out/items.json) so the
 * designed UI can render without any infrastructure. When the design is wired,
 * replace imports of this module with the real catalog port / server functions
 * (src/presentation/server/*). Shapes mirror the generated item fields.
 * ============================================================================
 */

export interface MockLexicalItem {
  senseId: string;
  lemma: string;
  pos: string;
  cefr: "B1" | "B2" | "C1";
  /** gloss used by the recognition MCQ (TIER-2) */
  recognitionMeaning: string;
  /** differently-phrased gloss used by the cued prompt (TIER-2 phrasing rule) */
  productiveMeaning: string;
  distractors: [string, string, string];
  /** exactly one `_` (cloze blank) */
  clozedSentence: string;
  selfReferencePrompt: string;
  modelSentence: string;
}

export const MOCK_CATALOG: MockLexicalItem[] = [
  {
    senseId: "negotiate_verb_01",
    lemma: "negotiate",
    pos: "verb",
    cefr: "B2",
    recognitionMeaning: "to discuss something formally in order to reach an agreement",
    productiveMeaning: "to work out the terms of a deal by talking with the other side",
    distractors: ["mediate", "designate", "nominate"],
    clozedSentence: "The union agreed to _ a new contract before the deadline.",
    selfReferencePrompt: "When did you last have to reach an agreement with someone?",
    modelSentence: "We negotiated a lower price with the supplier after two meetings.",
  },
  {
    senseId: "advocate_verb_01",
    lemma: "advocate",
    pos: "verb",
    cefr: "C1",
    recognitionMeaning: "to publicly support a particular idea or course of action",
    productiveMeaning: "to speak in favor of a cause or policy",
    distractors: ["allocate", "abdicate", "arbitrate"],
    clozedSentence: "Health experts _ regular exercise for office workers.",
    selfReferencePrompt: "What change do you push for at work or in your community?",
    modelSentence: "She advocates flexible working hours for parents on her team.",
  },
  {
    senseId: "resilient_adj_01",
    lemma: "resilient",
    pos: "adjective",
    cefr: "B2",
    recognitionMeaning: "able to recover quickly after difficulty or setbacks",
    productiveMeaning: "strong enough to bounce back from hard situations",
    distractors: ["reluctant", "redundant", "resonant"],
    clozedSentence: "The team proved _ after losing their biggest client.",
    selfReferencePrompt: "Describe a time you recovered from a setback.",
    modelSentence: "Small businesses here are resilient despite frequent typhoons.",
  },
  {
    senseId: "meticulous_adj_01",
    lemma: "meticulous",
    pos: "adjective",
    cefr: "C1",
    recognitionMeaning: "giving very careful attention to every small detail",
    productiveMeaning: "extremely precise and thorough in how something is done",
    distractors: ["momentous", "meritorious", "mysterious"],
    clozedSentence: "Her _ notes made the audit finish two days early.",
    selfReferencePrompt: "What task do you always do with extra care?",
    modelSentence: "He keeps meticulous records of every expense in the project.",
  },
  {
    senseId: "feasible_adj_01",
    lemma: "feasible",
    pos: "adjective",
    cefr: "B2",
    recognitionMeaning: "possible and practical to do or achieve",
    productiveMeaning: "realistic enough to actually be carried out",
    distractors: ["flexible", "fallible", "feeble"],
    clozedSentence: "Finishing the migration this quarter is not _ with two engineers.",
    selfReferencePrompt: "What plan of yours turned out to be realistic — or not?",
    modelSentence: "Working from the province is feasible now that the office is remote.",
  },
  {
    senseId: "allocate_verb_01",
    lemma: "allocate",
    pos: "verb",
    cefr: "B2",
    recognitionMeaning: "to officially give out resources for a particular purpose",
    productiveMeaning: "to set aside money, time, or people for a specific use",
    distractors: ["advocate", "aggravate", "alleviate"],
    clozedSentence: "The city will _ funds for flood control next year.",
    selfReferencePrompt: "How do you divide your time on a busy day?",
    modelSentence: "We allocate two hours every Friday for documentation.",
  },
  {
    senseId: "coherent_adj_01",
    lemma: "coherent",
    pos: "adjective",
    cefr: "C1",
    recognitionMeaning: "logically ordered and easy to follow as a whole",
    productiveMeaning: "clear because all its parts connect sensibly",
    distractors: ["cohesive", "coincident", "complacent"],
    clozedSentence: "The report needs a more _ structure before we send it.",
    selfReferencePrompt: "What helps you write in an organized way?",
    modelSentence: "Her presentation was coherent from the problem to the recommendation.",
  },
  {
    senseId: "diligent_adj_01",
    lemma: "diligent",
    pos: "adjective",
    cefr: "B2",
    recognitionMeaning: "showing steady, careful effort in one's work or duties",
    productiveMeaning: "hardworking in a consistent, conscientious way",
    distractors: ["diffident", "dominant", "dormant"],
    clozedSentence: "A _ review of the logs revealed the missing transaction.",
    selfReferencePrompt: "In what part of your work are you most consistent?",
    modelSentence: "She is diligent about answering every client email the same day.",
  },
];

export function mockItem(senseId: string): MockLexicalItem {
  const item = MOCK_CATALOG.find((i) => i.senseId === senseId);
  if (!item) throw new Error(`MOCK catalog: unknown senseId ${senseId}`);
  return item;
}
