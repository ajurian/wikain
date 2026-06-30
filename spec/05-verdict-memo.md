# 05 — Verdict Memo (per-user)

**Purpose.** Specify the per-user verdict cache that can short-circuit a billable judge call on an
identical resubmission, its key, normalization, exact-match policy, and version invalidation.

**Scope.** The memo between the rule layer (`04`) and the judge (`06`). The memo is **optional but
cheap**; it MUST NOT change any gate outcome.

**PRD trace.** §5.3; v4 changelog (multi-tenant); §11 P9.

**Depends-on.** `00`; `04` (memo is consulted only after the rule layer passes); `06`
(`model_version`/`rubric_version` originate with the judge config).

**Out-of-scope.** Cross-user caching (deleted — multi-tenant), the judge itself (`06`).

---

### MEMO-1 — Memo lookup precedes the judge; hit returns the stored verdict
**Trace:** PRD §5.3, §10 step 5.
**Requirement:** Before invoking the judge, the system MAY consult the memo. If a previously judged
entry matches the **memo key**, it MUST return the **stored verdict** and skip the judge call (`06`).
A miss MUST proceed to the judge.

**Scenario: a memo hit skips the billable judge call**
```
Given a free-production submission whose memo key matches a stored verdict
When the memo is consulted (after the rule layer passes)
Then the stored verdict is returned
And no judge/LLM call is made
```

### MEMO-2 — Memo key = normalized_sentence + target_lemma + intended_sense_id
**Trace:** PRD §5.3.
**Requirement:** The memo key MUST be `normalized_sentence + target_lemma + intended_sense_id`. A
verdict is sense-specific (`06`); keying on text alone MUST NOT be done — it would hand the wrong
verdict to a different target or sense.

**Scenario: same text, different sense, is a miss**
```
Given a stored verdict for (normalized_sentence S, lemma L, sense_id A)
When the same normalized sentence S is submitted for the same lemma L but sense_id B
Then the memo key differs
And it is a miss (the stored verdict is NOT returned)
```

### MEMO-3 — Normalization rules
**Trace:** PRD §5.3.
**Requirement:** `normalized_sentence` MUST be produced by: lowercase, trim, collapse whitespace,
strip outer punctuation (en-US).

### MEMO-4 — Exact-normalized match only
**Trace:** PRD §5.3.
**Requirement:** Memo matching MUST be exact on the normalized key. Fuzzy or semantic matching MUST
NOT be used — a near-but-not-identical sentence can flip sense-correctness.

**Scenario: a near-but-not-identical sentence is a miss**
```
Given a stored verdict for normalized sentence S
When a sentence normalizing to S' (S' ≠ S, even if near-synonymous) is submitted
Then it is a miss
And the judge is invoked normally
```

### MEMO-5 — Per-user scope; never shared across accounts
**Trace:** PRD §5.3, v4 changelog, §11 P9.
**Requirement:** The memo MUST be scoped per user. A verdict MUST NOT be served across accounts. The
cross-user global cache and per-adjudicator invalidation stay deleted.

**Scenario: user B does not see user A's verdict**
```
Given user A has a stored verdict for memo key K
When user B submits a sentence with the same memo key K
Then user B's lookup is a miss against user A's memo
And user B's submission is judged independently
```

### MEMO-6 — Version stamping invalidates stale verdicts
**Trace:** PRD §5.3, §11 P9.
**Requirement:** Each memo row MUST store `model_version` + `rubric_version`. Swapping the judge
model or the rubric MUST invalidate stale verdicts (bump the version) rather than serve them. The
memo MUST be write-on-judge only — there is no override→overwrite path (override removed, `06`).

**Scenario: a model_version bump invalidates a prior verdict**
```
Given a stored verdict written under model_version v1
When the judge model is swapped and model_version is bumped to v2
Then the v1 verdict is treated as stale (not served)
And the next matching submission is re-judged under v2
```

---

## Notes

The memo is **low-value at per-user scale** (identical-sentence repeats are rare for one learner) but
cheap; it has **cost value** (skips a billable DeepSeek call) and latency value. It is acceptable for
an implementation to ship without the memo and add it later — `MEMO-1` is `MAY`. Once present, the
remaining MEMO requirements are normative.

## Deferred (non-normative — [v2] / enable-later)

- None specific. (Cross-user cache, per-adjudicator invalidation, `source`-tagging stay **deleted**,
  not deferred.)
