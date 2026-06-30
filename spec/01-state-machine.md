# 01 — Mastery State Machine

**Purpose.** Specify the mastery ladder (`New → Seen → Recognized → Productive → Fluent`), its
promotion and demotion triggers, the scaffolding flag, and the single-track model.

**Scope.** The mastery signal only. The scheduling signal and rating derivation live in
`02-fsrs-rating.md`; the two interact **only through demotion** (`INV-3`).

**PRD trace.** §2, §3.1–§3.5; Risks-v4 #1.

**Depends-on.** `00` (`INV-1`, `INV-3`, `INV-4`); `02` (rating that triggers demotion); `03` (the
tier each state shows); `06` (the judged gate whose fail demotes).

**Out-of-scope.** Tier rendering (`03`), rating values (`02`), counter (`10`).

---

## States

### SM-1 — Mastery states and the card tier each shows
**Trace:** PRD §3.1.
**Requirement:** A word MUST hold exactly one mastery state from `{New, Seen, Recognized,
Productive, Fluent}`, and the presented tier MUST be derived from that state per the table.

| State | Meaning | Tier(s) shown |
| --- | --- | --- |
| `New` | not yet introduced (pre-state) | — |
| `Seen` | introduced; form–meaning link unconfirmed | Recognition MCQ → (spaced) Cloze |
| `Recognized` | form–meaning link confirmed (transit + demotion floor) | Cued production (deterministic) |
| `Productive` | produced the word correctly ≥1 time | Free sentence production (judged) |
| `Fluent` | durable, unscaffolded, spaced production | Spaced maintenance (judged every rep) |

**Scenario: state selects tier**
```
Given a word in mastery state Recognized
When the scheduler surfaces the card
Then the Cued-production (deterministic) tier is presented
And no judge/LLM call is made for this tier
```

**Notes / edge cases:** `Recognized` is both a **transit state** upward and the **demotion floor**
(`SM-7`). `Seen` shows two on-ramp tiers in sequence (`SM-3`). The FSRS internal `State` is distinct
(`INV-3`).

### SM-2 — One FSRS card per word; tiers are views
**Trace:** PRD §2, §4.1.
**Requirement:** Exactly one FSRS scheduling entity MUST persist per word across all tiers. The
system MUST NOT create one FSRS card per tier.

**Scenario: card identity survives a tier change**
```
Given a word with one FSRS card that climbs from Seen to Productive
When the mastery state changes across tiers
Then the same FSRS card persists throughout
And no additional FSRS card is created for the new tier
```

---

## Promotion

### SM-3 — `New → Seen` and the two-step `Seen` sequence
**Trace:** PRD §3.1, §3.2.
**Requirement:** `New → Seen` MUST fire on first introduction. `Seen → Recognized` MUST require
passing a meaning→word MCQ and then, at a **later (spaced)** review, a typed-cloze; promotion fires
on the **cloze pass**, which by construction follows a prior MCQ pass. The two retrievals MUST be
spaced (not two cards in one sitting).

**Scenario: promotion fires on the spaced cloze pass**
```
Given a word at Seen that has already passed the meaning→word MCQ at a prior review
When the learner passes the typed-cloze at a later spaced review
Then the word promotes Seen → Recognized
And both retrievals occurred at separate reviews
```

**Scenario: an MCQ pass alone does not promote**
```
Given a word at Seen with no prior cloze pass
When the learner passes only the meaning→word MCQ
Then the word remains at Seen
And its next on-ramp presentation is the typed-cloze
```

### SM-4 — `Recognized → Productive` on one cued pass
**Trace:** PRD §3.2, §3.1.
**Requirement:** A single deterministic cued-production pass MUST promote a word from `Recognized`
to `Productive`. Cued is not judged (`INV-4` does not block this — cued promotes only to
`Productive`, never to the counter or `Fluent`).

**Scenario: first cued pass promotes**
```
Given a word in state Recognized
When the learner submits a correct cued-production response
Then mastery becomes Productive
And no judge/LLM call is made
```

**Notes / edge cases:** PRD §3.2 marks "cued-promotes-`Productive`" `[VALIDATE]` (see Open items) —
acceptable because the counter and `Fluent` require real free judged sentences downstream, so the
weak gate never reaches anything user-facing.

### SM-5 — `Productive → Fluent` (conjunction of four conditions)
**Trace:** PRD §3.2.
**Requirement:** `Productive → Fluent` MUST require **all** of: (a) `FLUENT_JUDGED_PASSES` (=3) free
**judged** productions that pass the judge — cued/recognition/cloze MUST NOT count (`INV-4`);
(b) those passes spaced across **separate calendar days** (user-local timezone); (c) FSRS stability
**≥ `FLUENT_MIN_STABILITY_DAYS`** (~21); (d) the **most recent** production was **unscaffolded**.

**Scenario: all four conditions met**
```
Given a word at Productive with 3 judged passes on 3 separate calendar days
And FSRS stability ≥ FLUENT_MIN_STABILITY_DAYS
And the most recent passing production was unscaffolded
When the third qualifying pass is recorded
Then the word promotes Productive → Fluent
```

**Scenario: deterministic passes do not count toward N**
```
Given a word at Productive with 2 judged passes and several cued passes
When another cued pass is recorded
Then the judged-pass count stays at 2
And the word does not promote to Fluent
```

**Scenario: a scaffolded most-recent pass blocks Fluent**
```
Given a word at Productive meeting conditions (a) count, (b) days, (c) stability
And the most recent passing production was scaffolded
When the pass is recorded
Then the word remains at Productive
And does not promote to Fluent
```

**Notes / edge cases:** `FLUENT_JUDGED_PASSES` is **stricter** than the §9 counter threshold
(`COUNTER_MIN_SPACED_PASSES`=2) by design — `Fluent` is a durability badge; the counter answers
"can use now". `Fluent` is a superset of counter-eligibility (`CNT-*`).

---

## Demotion

### SM-6 — Demotion fires only on a judged-gate fail
**Trace:** PRD §3.3, §3.6.
**Requirement:** A word MUST demote exactly one rung **only** on a failed **free-production** or
failed **maintenance** (judged) review. Deterministic-tier fails (recognition/cloze/cued) MUST NOT
demote. The judged fail **is** the FSRS lapse — it produces the single `Again` rating (`INV-1`): one
presentation = one review = one rating = at most one demotion.

**Scenario: a judged free-production fail demotes one rung**
```
Given a word at Fluent
When a free-production review fails the sense or grammar gate
Then the word demotes Fluent → Productive
And the FSRS rating derived is Again
And exactly one demotion occurs
```

**Scenario: a deterministic-tier fail does not demote**
```
Given a word at Seen showing the typed-cloze
When the learner fails the cloze
Then the word does NOT demote
And it is rescheduled by FSRS (Again on a low-value tier)
And the mastery ladder is unchanged
```

**Notes / edge cases:** Maintenance demotion is an ordinary judged `Again`+demote on the presentation
the learner just made — no background re-check, no async demotion (`06`, §6).

### SM-7 — Demotion floors at `Recognized`
**Trace:** PRD §3.1, §3.3.
**Requirement:** Demotion MUST follow `Fluent → Productive → Recognized` and MUST NOT drop below
`Recognized`. A production failure breaks the *production*, not the form–meaning link.

**Scenario: a Productive word floors at Recognized**
```
Given a word at Productive
When a free-production review fails the gate
Then the word demotes Productive → Recognized
And does not fall below Recognized
```

### SM-8 — No recovery path for a wrong demotion in v1
**Trace:** PRD §3.3 `[VALIDATE]`, §5.5, §10 step 7; Risks-v4 #1.
**Requirement:** With override/rejudge removed (`06`), a sentence the judge **wrongly** rejects MUST
still demote and still take the `Again` lapse, and that MUST stand for the presentation. The learner
MAY write a further sentence, but it MUST be **unscored** for that review. Re-earning happens only
through the word's normal future reviews.

**Scenario: a wrongly-rejected sentence stays demoted**
```
Given a correct sentence that the judge incorrectly fails
When the gate fail is recorded
Then the word demotes and takes the Again lapse
And any further sentence the learner writes is unscored for this review
And there is no override or rejudge available
```

**Notes / edge cases:** This re-creates the phantom-lapse corruption `INV-2` guards against, now
sourced from **model error** rather than malformed input — the highest-impact risk introduced by v4.
The recommended mitigation (a zero-cost, no-model-call "count this as correct") is **Deferred**.

---

## Scaffolding & track model

### SM-9 — Scaffolding flag is recorded and gates the ladder, not the rating
**Trace:** PRD §3.4, §3.6.
**Requirement:** Each production attempt MUST record whether it was **scaffolded** (hint / sentence
starter) or **unscaffolded**, from day one. The flag MUST gate `Fluent` promotion (`SM-5`d) but MUST
NOT pull the FSRS rating down — a scaffolded pass is still `Good` (`RAT-3`).

**Scenario: scaffolded pass rates Good but does not satisfy Fluent's unscaffolded condition**
```
Given a free-production attempt made with a sentence starter
When it passes the gate
Then the scaffolded flag is recorded true
And the FSRS rating is Good
And condition (d) of SM-5 (unscaffolded most-recent) is not satisfied by this pass
```

### SM-10 — Single productive-forward track
**Trace:** PRD §3.5.
**Requirement:** v1 MUST use a single productive-forward ladder (recognition is the on-ramp). The
system MUST NOT run parallel receptive/productive tracks in v1.

**Notes / edge cases:** Watch-for (not a v1 requirement): if production fails specifically because
the form–meaning link decayed (learner forgot the *meaning*, not the production), that is the
trigger to consider a cheap independent receptive refresher in a future version.

### SM-11 — Placement-known words enter at `Recognized`
**Trace:** PRD §3.1, §3.2, §8.
**Requirement:** A placement-known word MUST be instantiated directly into `Recognized` (skipping
`Seen` only) when the pacer reaches it, and MUST earn `Productive` via one cued pass like any other
word (`SM-4`). It MUST NOT enter at `Productive` (a receptively-known word has produced it zero
times — `INV-4` / the receptive≠productive thesis).

**Scenario: a placement-known word skips Seen but not the cued gate**
```
Given a word flagged placement-known
When the pacer introduces it
Then it is created in state Recognized (skipping Seen)
And one cued pass is required to reach Productive
```

---

## Open / to-validate (non-normative)

- **Cued-promotes-`Productive`** (PRD §3.2 `[VALIDATE]`): revisit if words promote on cued but
  consistently fail first free production.
- **No recovery for wrong demotion** (PRD §3.3 `[VALIDATE]`, Risks-v4 #1): monitor the gold set; the
  mitigation is Deferred below.

## Deferred (non-normative — [v2] / enable-later)

- **One-tap override / "count this as correct"** — a zero-cost, no-model-call re-rate of a failed
  review as a pass that re-derives the schedule (FSRS has no native undo). This is the v3 override,
  **not** a rejudge. Recommended mitigation for `SM-8`; not built in v1.
- **Independent receptive-refresher track** (`SM-10` watch-for).
- **High-proficiency `Seen`-skip** efficiency (see `09`).
