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

> [FLAG] Licensing for a distributed (multi-user, commercial) app. LexTALE is published for
> **research** use (Lemhöfer & Broersma 2012); this file's *Out-of-scope* line ("use the published
> one") never addressed redistribution, and shipping the 60 items inside a product bundle **is**
> redistribution. The same reasoning as the Oxford 3000/5000 note below applies — the single-user /
> non-commercial exemption does not cover us. Confirm terms with the authors, or fall back to the
> per-word tapping mechanism (which SEED-4 already permits) before launch. Implemented as of slice 22
> (`src/domain/lextale.ts`) on the assumption this resolves favorably — do not treat it as resolved.

> [FLAG] The published CEFR table (Table 9) is not a partition: C1–C2 = 80–100, B2 = 60–80,
> "B1 and below" = <59. It leaves 59–60 unassigned and claims 80 twice. `frontierBandFromLexTale`
> resolves both boundaries downward-exclusive (`>= 80 → C1`, `>= 60 → B2`, else `B1`). Low-stakes by
> SEED-4's own reasoning, but it is a choice, not a reading of the source.

> [FLAG] **Retakes break the instrument's assumptions.** Slice 23's `/placement` lets a learner re-run
> LexTALE. The published norms assume a *naive* participant; someone who has already seen the 20
> validated nonwords scores higher on a second run, so a retake score is not comparable to a first-run
> score and drifts the frontier band upward. This is tolerable **only** because SEED-4 itself declares
> placement low-stakes (self-inflation mis-places the learner alone, and FSRS re-estimates per-item
> difficulty within a few sessions), and because the coarse self-report — which SEED-4 explicitly
> permits — is offered alongside as the honest tool for a small nudge. The UI says so plainly rather
> than presenting an inflated number as a measurement. Revisit if a LexTALE score is ever *reported*
> to the learner as a CEFR level (SEED-4's stated second purpose) rather than used only to pick a band.

### SEED-5 — List stack and default frontier
**Trace:** PRD §8, §11 item 9.
**Requirement:** The list stack MUST be NGSL (high-frequency floor) → NAWL + Oxford 5000 (B2–C1) as
the productive target zone. Because PH receptive proficiency is high, the **default starting frontier
MUST be ~B2 + NAWL**, not the NGSL core. The LexTALE level (if taken) nudges the band.

> [FLAG] Data drift vs. the implemented build. The pipeline ships a **single** source list
> (`data/oxford_multisense_catalog.csv` — Oxford A2–C1 ranked by SUBTLEX `zipf`, one row per WordNet
> sense), not the NGSL → NAWL + Oxford-5000 stack this requirement names. At runtime the frontier "band"
> is a **CEFR level** and selection order is `zipf_rank` ascending (`DM-2`/`DM-3`, `DrizzleWordSource`).
> Reconcile against PRD
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

### SEED-10 — Steady-state seed rail: per-day count cap + calendar-day-boundary gap
**Trace:** PRD §8; Amendment v4.2 (un-defers its deferred count cap). Refines `BAT-14` (spec/14).
**Requirement:** In steady state, a seed batch MUST be granted **iff both**: (a) the day's cumulative
introductions are **below the `NEW_PER_DAY` (=5) cap** — `introducedToday < NEW_PER_DAY`, where
`introducedToday` is the count stamped at `last_seed_at` when that instant falls on the **current**
learner-local calendar day (the `CNT` day-boundary convention), else `0`; **and** (b) — **only when
this request crosses a learner-local calendar-day boundary** since `last_seed_at` — at least
`SEED_MIN_GAP_HOURS` (=5) have elapsed. Within a single learner-local day the **count cap is the sole
bound**, so same-day refills up to the cap are granted **immediately** — a partial or backlog-throttled
seed never burns the day; the gap clause binds **only across the day boundary**, where it blocks the
11:50pm→12:00am double that the calendar-day count-reset would otherwise permit. If the seed is not
granted, no seed runs on this request — no card creation, no rating, nothing else changes (seeding is
unrelated to review grading). A first-ever seed (no ledger fact) trivially satisfies both. The quantity
being bounded is **cumulative introductions per learner-local day**, NOT instantaneous inter-card
spacing — a learner taking all ~5 new cards in one sitting is the desired §10.1 pattern; the harm is a
*count* overshoot that doubles the future review-and-judge tail.

**Scenario: the midnight double is blocked by the gap clause**
```
Given a seed batch that spent today's cap ran at 11:50pm learner-local
When a rebuild runs at 12:00am (a new calendar day, ten minutes later)
Then the new day resets introducedToday to 0 so clause (a) passes
And the boundary gap clause (b) fails (< SEED_MIN_GAP_HOURS)
And no second seed batch fires
```

**Scenario: a same-day partial-seed refill is granted immediately (no gap wait)**
```
Given a backlog-throttled seed introduced fewer than NEW_PER_DAY earlier today learner-local
When a same-day rebuild runs after the backlog clears
Then clause (a) passes (introducedToday < NEW_PER_DAY) with cap headroom remaining
And clause (b) does not apply (no calendar-day boundary was crossed)
And a seed of the remaining daily cap fires
```

**Scenario: a same-day rebuild with the cap spent seeds nothing**
```
Given seeding already introduced NEW_PER_DAY earlier today learner-local
When any same-day rebuild runs (seam, T-expiry, reload)
Then clause (a) fails (introducedToday == NEW_PER_DAY)
And no seed batch fires (existing cards are ordered only)
```

**Notes / rationale (migrated from Amendment v4.2):**
- This rail is a **safety net, not the primary throttle.** The primary acquisition throttle stays the
  §8 backlog-pressure gate (`SEED-6`, ≤ `NEW_FRACTION_UNDER_BACKLOG` new when a backlog exists), which
  load-balances acquisition against real review debt. The rail only binds on a **caught-up, no-backlog
  day** — exactly when the backlog gate is silent and the boundary burst could slip through. Do not
  build heavier rate-limiter machinery (buckets, refill accounting) around it.
- **Cold-start (`SEED-1`/`SEED-8`) sits *above* the rail** and is not suppressed by it; this rail
  governs only the steady-state guard.
- **Rejected alternatives.** *Leaky bucket* — its even drip (~1 card/4.8h) starves the once-a-day
  single-session learner and fragments §10.1 sessions; smoothing a bursty-by-design stream is the wrong
  goal. *Token bucket* — its bound (rate×window + burst) permits ~2×/day (pull 5, then the ~5 that
  refill), the exact burst this rail kills, leaked back in spread form; it cannot express a hard
  per-window cap. *Pure rolling-24h count* — hard-caps correctly but **starves the consistent daily
  learner whose session drifts earlier** (Mon 8:30 → Tue 8:15 is only 23h45m, so the prior 5 are still
  in-window → 5,0,5,0…), and it redefines "day" as rolling-T, inconsistent with the calendar-day
  semantics the §9 counter and §3.2 `Fluent` gate use. Calendar-day + debounce gives the same burst
  protection while keeping one calendar-day meaning app-wide (see `SEED-13`).

### SEED-11 — A seed is atomic; the ledger stores the instant AND the running day-count
**Trace:** PRD §8; Amendment v4.2 (revised — the deferred count cap is now normative, `SEED-10`).
**Requirement:** A seed MUST be an **atomic batch** of the `SEED-6` pace, stamped at **one** timestamp
`last_seed_at`; cards MUST NOT be introduced one-at-a-time across the session (no per-card seeding
clock, so no mid-session self-tripping). The ledger MUST persist **two** facts: `last_seed_at` as an
**absolute instant** (not a "day-seeded" boolean or day key — the instant is what answers the boundary
gap (b) and the day-key that scopes the count), **and** `seeded_count`, the **cumulative introductions
stamped at that instant**, read relative to that instant's learner-local day (`SEED-10` clause (a)); a
boolean/day-key can answer neither the gap nor the count. The ledger MUST advance (stamp `last_seed_at`
and set `seeded_count = introducedToday + n`) **only when the pass actually introduced `n ≥ 1` cards**.
A pass that introduces **0** (pace zeroed by backlog, or the frontier exhausted) MUST be a **no-op** on
the ledger — it must **not** stamp, so a throttled or supply-starved moment never consumes the day's
cap. *(This reverses the earlier "stamp even on 0 introductions" rule, whose binary once-per-day proxy
under-seeded the learner: a partial or zero-intro pass burned the whole day.)*

**Scenario: the ledger holds the seeding instant and the day-count**
```
Given a seed batch of n ≥ 1 cards is granted at instant T with introducedToday already = k
When the ledger records it
Then last_seed_at = T (an absolute instant) and seeded_count = k + n
And the next request evaluates SEED-10 against T and seeded_count
```

**Scenario: a zero-introduction pass does not touch the ledger**
```
Given a granted pass whose pacing/supply admitted 0 introductions
When the pass completes
Then last_seed_at and seeded_count are left unchanged (the day is not burned)
```

### SEED-12 — Returning after an absence yields one bounded batch, no back-fill
**Trace:** PRD §8; Amendment v4.2.
**Requirement:** A learner returning after ≥ 1 idle day passes both `SEED-10` clauses (new calendar
day; gap ≫ `SEED_MIN_GAP_HOURS`) and MUST receive **one** full seed batch — a bounded, benign
catch-up. The rail MUST NOT accumulate or back-fill missed days (that would reintroduce the
token-bucket 2× overshoot). One return = at most one batch.

**Scenario: a three-day absence seeds one batch, not three**
```
Given a learner last seeded three days ago
When they return today
Then exactly one seed batch is granted (the SEED-6 pace)
And no back-fill for the two skipped days occurs
```

### SEED-13 — Timezone coherence
**Trace:** PRD §8, §9; Amendment v4.2.
**Requirement:** "Calendar day" MUST be **user-local**, matching §8/§9 and `BAT-14`. `last_seed_at` is
an absolute instant; clause (a) MUST evaluate the calendar-day boundary in the learner's timezone,
clause (b) MUST evaluate the elapsed gap against the stored instant. `[VALIDATE]` Normal DST shifts and
timezone changes MUST NOT defeat either clause (a genuine local-day change and a ≫ gap both still hold);
low-risk, confirm if travel/DST edge reports appear.

**Scenario: a daily learner drifting earlier is not starved**
```
Given a learner seeds at 8:30am Monday learner-local
When they return at 8:15am Tuesday (≈ 23h45m later)
Then clause (a) passes (new local day) and clause (b) passes (≥ SEED_MIN_GAP_HOURS)
And a full batch is granted (no rolling-window starvation)
```

### SEED-14 — Instrument every granted and denied seed
**Trace:** PRD §8; Amendment v4.2.
**Requirement:** Every **granted** seed MUST be logged (`last_seed_at`, count, backlog state at grant);
a granted pass that introduced **0** cards is a `SEED-11` no-op and is **not** logged as a grant. Every
**denied** seed request MUST be logged **with the failing clause**, following this precedence:
`daily_cap` whenever clause (a) failed (today's `NEW_PER_DAY` cap is spent — the ordinary same-day
denial), and `min_gap` **only** when the day rolled with cap headroom but the boundary gap had not
elapsed — so a `min_gap` record is exactly a boundary-burst clause (b) caught. Purposes: (i) tune
`SEED_MIN_GAP_HOURS`; (ii) confirm the rail **rarely binds** — frequent binding points at the backlog
gate or the §8 pace, not this rail.

**Scenario: a denied midnight-double is attributed to the gap clause**
```
Given a seed that spent yesterday's cap ran at 11:50pm and a rebuild runs at 12:00am
When the seed is denied (SEED-10 clause b — new day, cap reset, gap short)
Then a denial event is logged with failing_clause = min_gap
And no grant event is logged
```

---

## Open / to-validate (non-normative)

- **Oxford 3000/5000 licensing for a distributed (multi-user) app** — the single-user "personal use"
  exemption no longer applies; use lists only as frequency/CEFR ordering and **generate own content**
  (build-time, `12` / `docs/BUILD.md`). NGSL/NAWL/AWL are cleaner-licensed (NGSL CC BY-SA 4.0 — mind
  share-alike if redistributing a derived list).
- **"Professional" vocabulary** has no clean open list — treat as a v2 enrichment band.
- Numeric sign-offs (retention 0.90, pacing). PRD §11.
- `[DEFAULT]`/sign-off **`SEED_MIN_GAP_HOURS`** (`SEED-10`, default 5h, range 4–6) — tune from the
  `SEED-14` grant/deny log.
- `[VALIDATE]` **Rail bind-rate** (`SEED-14`) — confirm the rail rarely binds; frequent binding points
  at the backlog gate / §8 pace, not this rail.
- `[VALIDATE]` **Timezone / DST edges** (`SEED-13`).

## Deferred (non-normative — [v2] / enable-later)

- **High-proficiency `Seen`-skip** efficiency (once 4-button is enabled, an `Easy`-grade MCQ
  first-pass may skip to cloze or `Recognized`). v1 ships the spaced two-step as default.
- **Domain/professional sublists** as an enrichment band.
- A learner-facing "intensity" control (lower target retention 0.85–0.88).
