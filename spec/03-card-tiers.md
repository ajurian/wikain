# 03 — Card Tiers & Deterministic Grading

**Purpose.** Specify the five card tiers, which are graded deterministically vs by the cloud judge,
the deterministic grading contract (lemma match), the meaning→word MCQ format, and the
self-reference prompt with its learner-activated fallback.

**Scope.** Tier presentation and deterministic grading. The judge (free production / maintenance) is
specified in `06`; the rule layer that pre-screens free productions is `04`.

**PRD trace.** §1 (modalities), §4, §4.1 (en-US).

**Depends-on.** `00`; `01` (which state shows which tier); `04` (lemma match shared with the rule
layer); `12` (the lexical-item fields each tier renders from).

**Out-of-scope.** Cloud-judge axes (`06`), edit rendering (`07`), counter (`10`).

---

## Tiers

### TIER-1 — The five tiers and their grader
**Trace:** PRD §4.
**Requirement:** The system MUST present exactly these tiers with these graders; the judge (LLM)
MUST be reachable only from free production and spaced maintenance.

| Tier | Format | Graded by |
| --- | --- | --- |
| Recognition | meaning→word MCQ | Deterministic (no LLM) |
| Cloze | typed cloze in authentic context | Deterministic (no LLM) |
| Cued production | meaning → produce the word | Deterministic (no LLM) |
| Free sentence production | self-referential sentence | Cloud judge (`06`) |
| Spaced maintenance | re-application of free production | Cloud judge, every rep (`06`) |

**Scenario: deterministic tiers never call the judge**
```
Given a Recognition, Cloze, or Cued-production card
When the learner responds and it is graded
Then grading is deterministic
And no judge/LLM call is made
```

### TIER-2 — Recognition MCQ is meaning→word with `RECOGNITION_MCQ_OPTIONS` options
**Trace:** PRD §4.
**Requirement:** The recognition MCQ MUST be oriented **meaning→word** (prompt = a gloss of the
sense; options = candidate **words**) and MUST present `RECOGNITION_MCQ_OPTIONS` (=4) options: 1
correct target word + 3 distractor words. The gloss phrasing MUST differ between the MCQ and the cued
prompt so `Recognized` certifies a form–meaning link, not memorization of one gloss.

**Scenario: 4 options, meaning prompt, word options**
```
Given a Recognition card for a target word
When it is presented
Then the prompt is a meaning/gloss of the intended sense
And exactly 4 word options are shown (1 target + 3 distractors)
And the correct option is the target word
```

**Notes / edge cases:** Distractors are carried from the generated lexical item (`12`); their content
quality (same POS/band, non-overlapping sense, form-confusables) is a **build-time** concern
(`docs/GENERATION_RULES.md` §1), not re-spec'd here.

### TIER-3 — Cued production is deterministic lemma-match
**Trace:** PRD §4.
**Requirement:** Cued production MUST grade by the same lemma-match logic as cloze ("type the target
word from a meaning prompt"). Cued and cloze MUST differ only in cue richness (bare meaning vs
sentence-with-a-blank), kept as two tiers for the difficulty ramp.

**Scenario: cued grades by lemma match**
```
Given a Cued-production card whose target lemma is "negotiate"
When the learner types "negotiated"
Then the deterministic grader matches the lemma (inflection-agnostic)
And the outcome is a pass
And no judge/LLM call is made
```

### TIER-4 — Ladder order is a scaffolding curve, not a productive-value order
**Trace:** PRD §4.
**Requirement:** The climb recognition → cloze → cued → free MUST order tiers by **scaffolding**
(most-supported → least-supported), not by productive value. The spec MUST NOT reorder tiers to match
the research's productive-value ranking (which places cloze above meaning→word).

---

## Deterministic grading contract

### TIER-5 — Lemma-match grading (inflection-agnostic, en-US)
**Trace:** PRD §4.1, §5.2.
**Requirement:** Deterministic grading (cloze, cued) MUST accept any inflected form of the target
lemma as correct, using the en-US NLP layer (`DM-9`) — the **same** presence check the rule layer
uses (`04`, `RL-2`). American forms (e.g. "color", "organize") MUST be accepted.

**Scenario: American spelling is accepted**
```
Given a Cloze card whose target lemma is "organize"
When the learner types the en-US form "organize"
Then it is accepted as present
And not bounced as word-absent
```

**Notes / edge cases:** Setting the NLP layer to en-US is load-bearing — otherwise American
sentences get bounced as word-absent, which (per `INV-2`) would silently distort scheduling.
Since the AMMENDMENT, **cloze** extends this contract with the classified fit-set lanes
(`FIT-6`) — this lemma match IS the `target` lane; the non-target lanes (soft bounces, typo-fix,
heal-queue wrong path) are owned by `13`. **Cued is unchanged** (no sentence frame → no fit set).

---

## Free-production prompt

### TIER-6 — Free production defaults to a self-reference prompt
**Trace:** PRD §4.
**Requirement:** Free production MUST default to a self-reference prompt ("write a sentence using
*{word}* — ideally something true about you"). Self-reference is a retention multiplier, not optional
flavor.

### TIER-7 — Fallback is learner-activated; offering ≠ taking
**Trace:** PRD §4.
**Requirement:** The system MUST NOT auto-*switch* into "any sentence" mode. The "just write any
sentence" fallback MUST be **learner-activated** (an explicit tap). The **offer** MUST be
auto-*surfaced* after one degenerate/empty self-reference submission; surfacing the offer MUST NOT
itself switch the mode.

**Scenario: offer surfaces but mode does not switch automatically**
```
Given a free-production card in self-reference mode
When the learner submits one degenerate/empty self-reference response
Then the "just write any sentence" offer is surfaced
And the mode remains self-reference until the learner explicitly taps the offer
```

**Scenario: learner taps the fallback**
```
Given the fallback offer is surfaced
When the learner explicitly taps "just write any sentence"
Then the prompt switches to any-sentence mode for this attempt
```

### TIER-8 — Maintenance re-runs free production
**Trace:** PRD §4, §6.
**Requirement:** Spaced maintenance MUST re-run the free-production tier at long FSRS intervals,
judged every rep (`06`). It MUST NOT be a separate researched format.

---

## Open / to-validate (non-normative)

- Whether cued and cloze are redundant (PRD §4) — collapse only if data shows it.

## Deferred (non-normative — [v2] / enable-later)

- **Voice / ASR** as a second input method into the same content evaluator (PRD §1), gated on
  measured PH-accent ASR word-error-rate; **pronunciation scoring deferred indefinitely**.
- **Dedicated collocation-production tier** (PRD §4) — v1 keeps collocation advisory in the judge
  (`06`) + as enrichment (`10`).
