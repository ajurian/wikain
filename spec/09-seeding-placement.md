# 09 — First-Session Seeding & Placement

**Purpose.** Specify per-new-user seeding (deliver a win fast), the three distinct placement
mechanisms kept separate, introduction pacing, lazy card creation, and FSRS cold-start defaults.

**Scope.** Word selection and introduction. The state a placement-known word enters is `01`
(`SM-11`); FSRS rating mechanics are `02`.

**PRD trace.** §8; §11 items 8/9/10; §4.1 (lazy card creation).

**Depends-on.** `00` (constants); `01` (`SM-11`); `02` (`RAT-8`, optimization, retention); `12`
(catalog / list-stack data).

**Out-of-scope.** The LexTALE instrument internals (use the published one), backend account
provisioning.

---

### SEED-1 — Deliver a win before any long calibration
**Trace:** PRD §8.
**Requirement:** The first successfully-produced sentence MUST come **before** any long calibration.
Seeding MUST seed a couple of near-frontier words (`FIRST_SESSION_SEED_WORDS` ≈ 2) from a coarse
signal, reach a production win, **then** offer optional "tune your level." Seeding runs per new user
on first session.

**Scenario: production win precedes the optional placement test**
```
Given a brand-new user's first session
When seeding runs
Then ~FIRST_SESSION_SEED_WORDS near-frontier words are introduced
And a production win is reachable before any long placement test is required
And the "tune your level" test is offered only afterward (optional)
```

### SEED-2 — Three distinct placement mechanisms, three outputs (kept separate)
**Trace:** PRD §8.
**Requirement:** The three placement mechanisms MUST be kept separate and wired to distinct outputs:

| Mechanism | Output | Drives |
| --- | --- | --- |
| **LexTALE scalar** | one number (vocab-size/level) | (i) initial frequency-band frontier; (ii) FSRS cold-start difficulty |
| **Per-word placement marking** | per-word known/unknown flags | which words **skip `Seen`** and enter at `Recognized` (`SM-11`) |
| **Frequency-ordered list stack** (NGSL → NAWL → Oxford 5000) | the ordered catalog | which words are **selected and scheduled next** |

### SEED-3 — LexTALE does not mark words and does not select words
**Trace:** PRD §8.
**Requirement:** The LexTALE scalar MUST NOT mark individual words known (it is one number) — skip-
`Seen` keys off the per-word flags, never the LexTALE score. LexTALE MUST NOT select words — it sets
*where* the frontier is; the list stack picks the actual words at that frontier.

**Scenario: a high LexTALE score does not skip any word's Seen step**
```
Given a user with a high LexTALE scalar but no per-word known flags
When words are introduced
Then no word skips Seen on the basis of the LexTALE score
And skip-Seen happens only for per-word-flagged words (SM-11)
```

**Scenario: LexTALE moves the frontier but the list stack selects**
```
Given a LexTALE scalar indicating a B2 frontier
When the next words are chosen
Then the frontier band is set from the scalar
And the specific words come from the list stack at that band, not from LexTALE
```

### SEED-4 — Use the published LexTALE instrument
**Trace:** PRD §8.
**Requirement:** For precision (or to report a CEFR level), the system MUST use the **published
LexTALE English instrument** with its **validated nonwords**. It MUST NOT author its own nonwords.
Placement is low-stakes (FSRS re-estimates per-item difficulty within a few sessions), so a full
LexTALE run MAY be optional (per-word "I know this" tapping is acceptable for a self-aware user).

### SEED-5 — List stack and default frontier
**Trace:** PRD §8, §11 item 9.
**Requirement:** The list stack MUST be NGSL (high-frequency floor) → NAWL + Oxford 5000 (B2–C1) as
the productive target zone. Because PH receptive proficiency is high, the **default starting frontier
MUST be ~B2 + NAWL**, not the NGSL core. The LexTALE level (if taken) nudges the band.

> [FLAG] Data drift vs. the implemented build. The pipeline ships a **single** source list
> (`data/merged_oxford_a2c1_zipf.csv` — Oxford A2–C1 ranked by SUBTLEX `zipf`), not the NGSL → NAWL +
> Oxford-5000 stack this requirement names. At runtime the frontier "band" is a **CEFR level** and
> selection order is `zipf_rank` ascending (`DM-2`/`DM-3`, `JsonWordSource`). Reconcile against PRD
> §8/§11 before treating either the NGSL/NAWL wording or the single-CSV reality as normative — do not
> silently adopt one side.

### SEED-6 — Introduction pacing
**Trace:** PRD §8.
**Requirement:** Introduction MUST be a small fixed batch interleaved with due reviews: **~`NEW_PER_DAY`
(=5) new/day**, and **≤ `NEW_FRACTION_UNDER_BACKLOG` (=30%) new when a due backlog exists**,
whichever is smaller, so reviews never starve. First session seeds ~`FIRST_SESSION_SEED_WORDS` (=2).

**Scenario: under backlog, new introductions are capped at the fraction**
```
Given a due-review backlog exists
When the day's introductions are paced
Then new introductions are ≤ NEW_FRACTION_UNDER_BACKLOG of the session
And ≤ NEW_PER_DAY, whichever is smaller
```

### SEED-7 — Lazy FSRS card creation at introduction
**Trace:** PRD §4.1, §8.
**Requirement:** An FSRS card MUST be created **only when the seeder introduces the word**, not for
the whole catalog (a new card is due immediately; instantiating the whole catalog would make
thousands "due now"). The pacing cap (`SEED-6`) **is** the lazy-creation throttle.

**Scenario: an un-introduced placement-known word has no card**
```
Given a word flagged placement-known that the pacer has not yet reached
When the user's due queue is built
Then no FSRS card exists for that word yet
And it is instantiated (directly into Recognized, SM-11) only when the pacer reaches it
```

### SEED-8 — FSRS cold-start and retention defaults
**Trace:** PRD §8, §11 item 10.
**Requirement:** New cards MUST be cold-started for difficulty/stability from **CEFR × frequency
band**. Target retention MUST be `REQUEST_RETENTION` (=0.90) to start (tunable). Per-user
optimization MUST run after ~`PER_USER_OPT_REVIEW_THRESHOLD` (=1000) of that user's own reviews via
`@open-spaced-repetition/binding`; below that, defaults apply. There MUST be **no population-level
optimization** — parameters are fit per user, never pooled (multi-tenant).

**Scenario: optimization is per-user and threshold-gated**
```
Given a user with fewer than PER_USER_OPT_REVIEW_THRESHOLD reviews
When scheduling runs
Then default FSRS parameters are used (no per-user optimization yet)
And no parameters are pooled from other users
```

### SEED-9 — New-intro pace and the §9 use-goal are independent knobs
**Trace:** PRD §8.
**Requirement:** The `NEW_PER_DAY` intro pace and the §9 `DAILY_GOAL_DEFAULT` (`10`) MUST be
**independent knobs** that merely share a default value (5), NOT "matched". A new introduction is a
`Seen` interaction; a productive use (`10`) is a free judged production of a word already past
`Seen`. On day one there are zero production-eligible words, so the use-goal cannot be met by new
introductions.

---

## Open / to-validate (non-normative)

- **Oxford 3000/5000 licensing for a distributed (multi-user) app** — the single-user "personal use"
  exemption no longer applies; use lists only as frequency/CEFR ordering and **generate own content**
  (build-time, `12` / `docs/BUILD.md`). NGSL/NAWL/AWL are cleaner-licensed (NGSL CC BY-SA 4.0 — mind
  share-alike if redistributing a derived list).
- **"Professional" vocabulary** has no clean open list — treat as a v2 enrichment band.
- Numeric sign-offs (retention 0.90, pacing). PRD §11.

## Deferred (non-normative — [v2] / enable-later)

- **High-proficiency `Seen`-skip** efficiency (once 4-button is enabled, an `Easy`-grade MCQ
  first-pass may skip to cloze or `Recognized`). v1 ships the spaced two-step as default.
- **Domain/professional sublists** as an enrichment band.
- A learner-facing "intensity" control (lower target retention 0.85–0.88).
