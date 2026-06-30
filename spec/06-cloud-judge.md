# 06 — Cloud LLM Judge (DeepSeek V4 Flash)

**Purpose.** Specify the cloud judge: its judged axes, the promotion gate (sense AND grammatical),
the lenient bias, maintenance-every-rep, the structured-output verdict it returns, and its
configuration. The precise-replacement edit resolution it feeds is `07`.

**Scope.** The Stage B judgment. The rule layer that gates it is `04`; the memo that may short-circuit
it is `05`; the rating its verdict produces is `02`.

**PRD trace.** §5.4, §5.5, §5.7, §5.8; §6 (maintenance); §11 P2/P6/P7.

**Depends-on.** `00` (`INV-1`, `INV-4`); `04`; `05`; `07` (consumes `replacements`); `12`
(`intended_sense`, `model_sentence` as in-context references).

**Out-of-scope.** Edit span resolution + inline render (`07`), backend key storage detail (`08`),
build-time content generation (`docs/BUILD.md`).

---

## Axes & gate

### JDG-1 — Judged axes
**Trace:** PRD §5.4.
**Requirement:** The judge MUST evaluate these axes with these roles:

| Axis | Role |
| --- | --- |
| Used in the **taught sense / POS** | **GATE (hard)** — the model's single irreplaceable job |
| Grammatical acceptability | **GATE (hard)** — fails **only** if an error obscures meaning; surface/L1 errors are corrected-and-passed (`07`), never failed |
| Collocational naturalness | Advisory only |
| Register fit | Advisory only (single mode in v1; no mode-gating) |

### JDG-2 — Promotion gate = sense-correct AND grammatical
**Trace:** PRD §5.5, §5.6, §10 step 7.
**Requirement:** The promotion gate MUST be `used_in_target_sense AND grammatical`. Nothing else MUST
block advancement. Collocation, register, and naturalness MUST be advisory — they generate
enrichment and non-failing `replacements` (`07`), framed as an upgrade, and MUST NEVER fail a
sentence.

**Scenario: a sense-correct, grammatical sentence passes regardless of style**
```
Given a sentence used in the target sense and grammatically acceptable
And with an awkward collocation flagged advisory
When the judge evaluates it
Then the gate passes (promote one rung)
And the collocation note is rendered as an upgrade, not a fail
```

**Scenario: a sense failure fails the gate regardless of replacements**
```
Given a sentence the model judges NOT used in the target sense
When the judge evaluates it
Then used_in_target_sense is false
And the gate fails (Again + demote, INV-1)
And no amount of advisory replacements changes the gate
```

**Scenario: grammar fails only when meaning-obscuring**
```
Given an all-English sentence with an L1 surface error that does NOT obscure meaning
When the judge evaluates it
Then grammatical is true (the error is corrected-and-passed via replacements)
And the gate is not failed on grammar
```

### JDG-3 — Lenient bias / false-negative asymmetry
**Trace:** PRD §5.5, §5.7.
**Requirement:** The rubric MUST be biased lenient. Wrongly rejecting a *correct* sentence is the
trust-damaging failure and MUST be minimized; the sense gate is the trust-critical job. (With
override removed, a false rejection is unrecoverable in v1 — `SM-8`.)

---

## Structured-output verdict

### JDG-4 — JSON contract
**Trace:** PRD §5.6.
**Requirement:** The judge MUST return structured JSON matching this contract, showing its evidence
(detected vs intended sense) so a rejection is auditable:

```jsonc
{
  "used_in_target_sense": true,        // GATE
  "detected_sense": "string",
  "intended_sense": "string",
  "grammatical": true,                 // GATE (fails only if meaning-obscuring)
  "collocation_natural": true,         // advisory
  "register_fit": "ok | informal | formal | off",  // advisory
  "replacements": [
    { "find": "string", "replace": "string", "reason": "grammar | collocation | register | sense" }
  ],
  "corrected_sentence": "string",          // FALLBACK render only (see 07)
  "enrichment_suggestion": "string | null",
  "one_line_feedback": "string"            // surfaced on-demand, NOT primary
}
```

**Scenario: the verdict carries auditable sense evidence**
```
Given any judged free production
When the verdict returns
Then it includes detected_sense and intended_sense
And the gate decision is explainable from used_in_target_sense and grammatical
```

### JDG-5 — `replacements` is presentation, never adjudication
**Trace:** PRD §5.6.
**Requirement:** The `replacements` array MUST NOT change the gate. A grammatical/collocation polish
on a *passing* sentence yields `reason: grammar|collocation|register` edits; a *sense* failure fails
the gate regardless of `replacements` contents. Resolution of `replacements` into spans is `07`.

### JDG-6 — Valid JSON via native structured output
**Trace:** PRD §5.6.
**Requirement:** Valid JSON MUST be obtained via DeepSeek native structured output (JSON mode +
response schema). GBNF/grammar-constrained decoding MUST NOT be used (it was a local-host mechanism).

### JDG-7 — Treat L1 interference as correctable surface errors
**Trace:** PRD §5.6.
**Requirement:** The judge MUST treat common Tagalog-L1 interference within an English sentence
(article omission, aspect/tense transfer, fixed-phrase substitution) as **correctable surface
errors** fixed via `replacements`/`corrected_sentence`, **not** counted as meaning failures.
(Code-switching, i.e. actual Tagalog words, is handled earlier at `RL-4` and never reaches here.)

---

## Maintenance & no-rejudge

### JDG-8 — Maintenance is judged every rep
**Trace:** PRD §5.4, §6, §11 P6.
**Requirement:** The full judge MUST run on **every** spaced-maintenance review, fronted by the same
rule layer (`04`). One judged verdict → one rating (`INV-1`). A maintenance sense-fail MUST demote
immediately on the presentation the learner just made (`SM-6`) — no background re-check, no async
demotion, no separate "cheap maintenance check" rating path.

**Scenario: a maintenance sense-fail demotes synchronously**
```
Given a Fluent word presented for spaced maintenance
When the judged verdict is a sense-fail
Then the rating is Again
And the word demotes Fluent → Productive on this presentation
And no background re-check is scheduled
```

### JDG-9 — No override, no rejudge, no re-rate in v1
**Trace:** PRD §5.5, §11 P7, §10 step 7.
**Requirement:** A gate fail MUST be final for that presentation. v1 MUST NOT provide a one-tap
override, a rejudge, or a re-rate. Any future model-quality upgrade MUST be a **global** model swap
(with a `model_version` bump, `05`), **not** a per-sentence larger-model escalation.

**Scenario: no second model call on a submitted review**
```
Given a free-production review that has been judged (pass or fail)
When the learner requests another look or submits again
Then no override is offered
And no rejudge (second judge call) is performed for this review
```

---

## Configuration

### JDG-10 — Live judge model and call shape
**Trace:** PRD §5.7, §11 P2/P3.
**Requirement:** The live judge MUST be **DeepSeek V4 Flash** (`deepseek-v4-flash`), called over
HTTPS **from the backend** (the API key MUST NOT reach the client — `08`). The call MUST use native
structured output (`JDG-6`) + 2–3 few-shot calibration examples + a low/minimal thinking level **if**
the model exposes one (for latency).

### JDG-11 — Prompt caching of the rubric/system prompt
**Trace:** PRD §5.7.
**Requirement:** The rubric/system prompt + few-shots SHOULD be sent so DeepSeek prompt caching
applies (the rubric is identical on every call). This is the dominant per-call cost lever (cache hit
≈ 2% of base input cost).

### JDG-12 — Single clean-English mode
**Trace:** PRD §5.7, §11 P7.
**Requirement:** v1 MUST run a single everyday mode expecting clean English with one grammatical
policy (strict on meaning, lenient on style, L1 surface errors corrected-and-passed). No exam-prep
mode and no register-gating MUST be active in v1.

---

## §5.8 — Explicitly not used (notes, non-normative)

Embedding-similarity as a sense-match proxy; LanguageTool / spaCy; local inference host
(node-llama-cpp/Ollama), GBNF decoding, model warming; Batch API, cross-user cache, stronger-cloud
appeal validator, one-tap override, rejudge; character-index replacements (`07`).

## Open / to-validate (non-normative)

- **Sense-gate false-negative rate** vs a **gold set of ~30 hand-labeled sentences** before trusting
  the gate (expected lower than Gemma 4B; verify). Upgrade path = a stronger DeepSeek model on a
  global swap, not a custom model.
- **Latency / TTFT** and whether a thinking/reasoning-effort control exists; the exact JSON-mode /
  response-schema request fields; **rate limits** (`08`).
- **Drift monitoring is manual** (no override log feeds the gold set): periodic hand-judging of a
  sample. Consider a passive "flag this verdict for review" log to get a feed without reintroducing a
  rating-affecting override.

## Deferred (non-normative — [v2] / enable-later)

- **One-tap override / "count this as correct"** (the recommended mitigation for the unrecoverable
  false-rejection risk, `SM-8`) — zero-cost, no-model-call; not built in v1.
- **Exam-prep mode** / register-gated grammar policy (a possible future product line).
