# 07 — Precise-Replacement Edit Resolution

**Purpose.** Specify the deterministic, in-process algorithm that turns the judge's `replacements`
(find/replace string pairs) into character spans rendered as inline, tappable edits — and the
fallback when a span can't be resolved.

**Scope.** Post-judge, in-process resolution + the inline render contract. The judge that produces
`replacements` is `06`; the gamification surface that renders the result is `10`.

**PRD trace.** §5.6 (edit contract + resolution algorithm), §9 (inline render).

**Depends-on.** `00`; `06` (`JDG-4`, `JDG-5` — `replacements` source and the gate-independence rule).

**Out-of-scope.** The gate decision (`06`), the judge's JSON schema fields beyond `replacements` /
`corrected_sentence`.

---

### EDIT-1 — Find/replace strings, not character indices
**Trace:** PRD §5.6.
**Requirement:** The judge MUST supply edits as `find`/`replace` **string pairs**, where `find` is an
**exact substring copied verbatim** from the learner sentence and `replace` is the replacement
(`""` means delete). The contract MUST NOT use model-supplied `start_index`/`end_index` — LLMs do not
index characters reliably; deterministic code computes positions from the quoted span.

### EDIT-2 — Resolution is presentation, never adjudication
**Trace:** PRD §5.6, §6 (`JDG-5`).
**Requirement:** Resolving `replacements` MUST NOT change the gate outcome. A passing sentence with
polish edits stays passing; a sense failure stays failed regardless of edits.

---

## Resolution algorithm (ordered, individually testable)

### EDIT-3 — Locate each `find` and resolve to a span
**Trace:** PRD §5.6 step 1–2.
**Requirement:** For each `replacement`, the system MUST locate `find` as a substring of the **raw
learner sentence**. **Exactly one match →** record its `[start, end]` character span as the highlight
range (color-coded by `reason`).

**Scenario: a uniquely-matching find resolves to a span**
```
Given a learner sentence and a replacement whose find occurs exactly once
When resolution runs
Then a single [start, end] span is recorded
And it is color-coded by the replacement's reason
```

### EDIT-4 — Zero or ≥2 matches → discard that edit, fall back to corrected_sentence
**Trace:** PRD §5.6 step 3.
**Requirement:** If `find` has **zero matches** (model paraphrased instead of quoting) **or ≥2
matches** (ambiguous span), the system MUST **discard that single edit** and fall back to displaying
`corrected_sentence` for the whole sentence. It MUST NOT guess a position.

**Scenario: a non-matching find falls back**
```
Given a replacement whose find does not occur in the raw learner sentence
When resolution runs
Then that edit is discarded
And the whole-sentence corrected_sentence is used as the fallback display
And no position is guessed
```

**Scenario: an ambiguous (≥2 matches) find falls back**
```
Given a replacement whose find occurs twice in the learner sentence
When resolution runs
Then that edit is discarded (ambiguous)
And the corrected_sentence fallback is used
```

### EDIT-5 — Apply surviving edits right-to-left
**Trace:** PRD §5.6 step 4.
**Requirement:** Surviving edits MUST be applied **right-to-left** (descending `start`) so earlier
offsets stay valid as later spans are spliced.

**Scenario: multiple edits splice without offset corruption**
```
Given two surviving edits at spans S1 (earlier) and S2 (later)
When edits are applied
Then S2 is applied before S1 (descending start)
And the resulting text/highlights are correct for both
```

### EDIT-6 — Overlapping spans resolved by reason priority
**Trace:** PRD §5.6 step 4.
**Requirement:** When spans overlap, the system MUST keep the first by `reason` priority `sense >
grammar > collocation > register` and drop the overlapping lower-priority edit.

**Scenario: a sense edit wins over an overlapping grammar edit**
```
Given two overlapping edits, one reason=sense and one reason=grammar
When resolution runs
Then the sense edit is kept
And the overlapping grammar edit is dropped
```

### EDIT-7 — Resolved set drives the inline UI; corrected_sentence is fallback-only
**Trace:** PRD §5.6 step 5, §9.
**Requirement:** The resolved span set MUST drive the inline UI (strikethrough `find` + insertion
`replace`, color-coded by `reason`; tapping a span reveals that edit's `one_line_feedback` on
demand). `corrected_sentence` MUST exist **only** as the whole-sentence fallback for `EDIT-4` — it is
**not** the primary display.

**Scenario: inline edits are primary; feedback is on-demand**
```
Given a judged sentence with resolved inline edits
When feedback is rendered
Then the edits appear inline on the learner's own sentence (strikethrough + insertion)
And one_line_feedback is revealed only on tap/hover (never the primary surface)
And corrected_sentence is shown only if a fallback was triggered
```

---

## Notes / edge cases

Short learner sentences (10–20 words) make multi-match ambiguity rare, so the fallback rarely fires.
wink-nlp (already shipped) MAY map a resolved span to token boundaries for clean word-level
highlighting.

## Deferred (non-normative — [v2] / enable-later)

- None.
