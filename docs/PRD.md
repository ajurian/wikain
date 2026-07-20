# Wikain — System Flow (Product Requirements Document) — **v4.1 (multi-user / web / cloud judge / online)**

> **Status legend**
>
> - `[DECIDED]` = confirmed.
> - `[DEFAULT]` = recommended starting value. Low-regret: ship it, instrument it, tune with data.
> - `[VALIDATE]` = to be confirmed by real data or an external check (licensing, model quality) before or shortly after relying on it.
> - Unmarked text = established design, carried forward.

---

## v4 changelog — what the web / multi-user pivot changes

v4 carries the v3→v4 **per-learner pedagogy** forward unchanged but returns the **platform** to
v2.x's shape: **web, multi-user, cloud judge, online**. Lineage in brief: **v2.x** was web /
multi-user / paid-cloud-API. **v3** pivoted to local / offline / free (Gemma 4 E4B in-process).
The prior v4 draft kept a single-user desktop core; **this revision moves back to a web app with
multiple accounts** while keeping the cheap cloud judge and the online-only core loop.

The three v4 premises:

1. **Multi-user, web — CHANGED.** Multiple learners, each with an **isolated account**: own FSRS
   data, own verdict memo, own counter. **Multi-tenant, not shared** — there is no cross-user data
   sharing (see the table below). A backend with authentication fronts the loop; the desktop
   (Electron) shell is removed.
2. **Cloud model, not local.** Sentence judging uses **DeepSeek V4 Flash**
   (`deepseek-v4-flash`; **$0.0028/1M cache-hit input, $0.14/1M cache-miss input, $0.28/1M
   output**; native structured output; prompt caching). Gemma 4 E4B and the
   `node-llama-cpp`/Ollama host are removed.
3. **Online, not offline-first.** `[DECIDED]` The app **requires internet** for the core loop.
   No offline mode, no queue/sync, no provisional state. The judge is a backend call out to the
   cloud model; the client always assumes connectivity.

The pedagogy is unchanged — the productive ladder, FSRS scheduling, the sense gate as the one
irreplaceable LLM job, self-reference prompts, and the receptive≠productive thesis all survive
(§1–§4, §8–§9) and are applied **per user**. The **v2.7 §3.6↔§6↔§7 maintenance contradiction stays
resolved**: each production/maintenance tier has exactly **one** evaluator (the cloud judge), so
"one presentation = one rating" cannot be violated.

**New in v4 — the precise-replacement edit contract.** The judge no longer returns only a prose
`corrected_sentence`. It returns a **`replacements` array** of `find`/`replace` string pairs that
the UI resolves into character spans and renders as inline, tappable edits (strikethrough +
insertion), so corrections are *shown on the sentence*, not buried in a feedback paragraph
(§5.6, §9).

**What does NOT come back from v2.x** (multi-user, but strictly **multi-tenant** — nothing is
shared across accounts):

| Stays deleted | Why |
| --- | --- |
| Cross-user global cache | multi-tenant by design — verdicts are per-user, never shared across accounts |
| Per-adjudicator cache invalidation / write-back | obsolete with the cross-user cache gone |
| Population-level FSRS optimization | per-user optimization only (§8); no pooled population model |
| Batch API | the core loop is interactive/synchronous; batch is for non-interactive fleets |
| LanguageTool (JVM) | no standalone grammar tool — the corrected sentence comes from the LLM. *(Runtime spaCy, by contrast, **did** return in v4.1 — as an out-of-process NLP service for lemma/POS; see the v4.1 amendment.)* |

**Removed in v4 (with the reason each existed and why it's gone):**

| Removed | It existed to… | Why it's gone |
| --- | --- | --- |
| One-tap **override** (was §5.5 / P7) | flip a false-negative without a model call | removed by product decision — **leaves false rejections unrecoverable; see "Risks introduced by v4"** |
| **Rejudge / re-rate** of any kind | re-run the judge on learner request | removed by product decision; no second model call on a submitted review |
| Override → memo overwrite path | keep the memo correct after an override | no override, so no overwrite path |
| Offline/online branching, queue-and-sync, "checking on reconnect," provisional checkmark | tolerate an absent network | internet is now required |
| Local model warming on launch | avoid a cold local-weight load | no local weights to warm |
| Grammar-constrained GBNF decoding | force valid JSON from a 4B local model | replaced by DeepSeek native structured output (JSON mode + response schema) |
| Stronger-neutral **appeal validator** | adjudicate appeals without trusting a self-tap | already deleted in v3; stays deleted (multi-tenant doesn't reintroduce it) |
| Every-Nth maintenance split + background drift audit | avoid paying for an LLM call every maintenance rep | already deleted in v3; the cloud judge runs every rep (§6) |

**Re-justified (mechanisms that survive with a changed rationale):**

- **Staged pipeline** (deterministic rule layer first, LLM only for sense). In v3 this was
  latency-only. In v4 it is **cost + latency again** — every cloud call is billable, so the
  deterministic pre-screen avoids paying to tell the learner they forgot to type the target word.
- **Verdict memo** (§5.3). In v3 a latency convenience. In v4 it again has **cost value**
  (skips a billable call on an identical resubmission), though still low-value at per-user scale —
  the memo is **per-user, never shared** across accounts (the cross-user cache stays deleted).

---

## v4.1 amendment — codebase-alignment updates (2026-07-17)

v4.1 records four changes made while building the v4 runtime; each has a **normative home** in
`spec/` or the build pipeline, and this section is a pointer. Where the v4 prose below still carries
the old framing, the cited spec ID (or this block) wins. The two `spec/` files here supersede the
retired `docs/AMMENDMENT.md` scratch amendment — cite the stable IDs (`FIT-n`, `BAT-n`), never the
scratch file.

1. **NLP moved out-of-process to a Python spaCy service.** The in-process **wink-nlp** layer is
   **gone**. All lemma/POS analysis runs in one FastAPI container (`POST /analyze`, spaCy
   `en_core_web_sm`), reached over HTTPS from the backend. The load-bearing reason: the build-time
   content pipeline (Stage C) and the runtime grader MUST validate against the **same** engine, or
   an item could pass the build gate and still be bounced "word absent" at review — a fabricated
   `Again` that corrupts FSRS (I2). Timing bonus: wink Americanized spelling
   (`aesthetic→esthetic`) and could not represent those lemmas; spaCy does not Americanize. There is
   now **one** NLP port (`SentenceAnalyzer.analyze`); the separate `Lemmatizer` port was deleted (a
   second port would mean a second RPC for one sentence). *(Replaces the §5.2 / §5.6 / §5.8 / P4
   wink-nlp text.)*

2. **Content source collapsed to one multisense catalog.** The three-CSV frequency stack
   (**NGSL → NAWL → Oxford 5000**) is **retired**. Selection now runs over a single Oxford-derived
   **multisense catalog** (`data/oxford_multisense_catalog.csv`: word, POS, CEFR, sense_id,
   sense_hint, sense_zipf, global_zipf_rank), CEFR-banded and zipf-ordered
   (`WordSource.nextFrontierWords`). **Sense granularity changed with it:** each WordNet sense is its
   **own** lexical item (`{lemma}_{pos}_NN`, `_01` = most frequent sense), not "one item per
   (headword, POS)." *(Replaces the §8 list-stack table + the §4.1 sense-granularity default.)*

3. **Typed cloze gained a classified fit-set and soft bounces** — `spec/13` (`FIT-1..11`). Cloze is
   no longer a bare binary lemma-match. Each item carries a `cloze_fit_set` classifying plausible
   fills as `target | same_sense_near_miss | different_sense_fit`; a non-target-but-valid fill
   produces a **soft bounce** — no rating, no scheduler call, no `ReviewLog`, card stays due
   (`FIT-7`). This is a **third class**, deliberately NOT an I2 rule-layer bounce (the input is
   well-formed). The typo-fix lane (Damerau–Levenshtein ≤ 1 → `Good`) is v1-live; cloze stays
   deterministic (no LLM, no extra network beyond the one analyze call). *(Refines §3.6, §4, §4.1,
   §5.8.)*

4. **Review sessions present as mini-session batches** — `spec/14` (`BAT-1..16`). The per-pass loop
   (§10) is unchanged; cards are now delivered in **effort-unit batches** (time-anchored per-tier
   weights, a three-way cap) with a **Continue / Done** completion seam, a server-authoritative
   active batch, and a T-expiry "Welcome back" rebuild. Batching is **presentation-only pacing**: it
   owns no ratings, buffers nothing, and preserves I1–I4 (`BAT-1`). *(Adds §10.1.)*

---

## 0. Scope of this document

The runtime flow of Wikain's core loop: how a word moves through mastery states, how a
production is judged by the cloud model, which interactions reach the model and which are
deterministic, and how seeding and the gamification surface attach to the loop. It does **not**
cover the web client/backend split, authentication, packaging, data model, API-key storage, or
content authoring beyond what the flow requires.

**Consistency invariants (the whole design preserves these):**

- **I1 — One presentation = one review = one rating**, computed on the final gradeable outcome.
  Trivially safe in v4 because each tier has exactly one rating-bearing evaluator (deterministic
  self-grade on recognition/cloze/cued; the cloud judge on free production and maintenance).
  There is **no** tier with two evaluators.
- **I2 — Rule-layer bounces are not reviews.** Malformed input (word absent, degenerate,
  code-switched) gets no rating and no scheduler call (§3.6).
- **I3 — Scheduling and mastery are separate signals** (§2) that interact only through demotion.
- **I4 — Only free *judged* productions count toward the user-facing counter and `Fluent`**
  (§9, §3.2). Recognition, cloze, and cued never count.

---

## 1. Product frame

- **Goal:** expand each learner's _active_ (productive) English vocabulary.
- **Population trait:** Filipino English proficiency is high on average (strong receptive and
  conversational skill); the productive gap concentrates in **formal, extended,
  grammatically-accurate writing**, driven by Tagalog-L1 interference. Target zone:
  **upper-intermediate enrichment** (mid-frequency, academic, professional vocabulary).
- **Core thesis:** the _produced sentence is the lesson itself_, not a reward on top of
  recognition drills. Recognition exists only to initialize a word before production is asked
  for. Receptive knowledge does **not** auto-convert to productive knowledge.
- **Modalities:** one evaluation engine, two input methods — typed text, or speech via ASR into
  the same content evaluator.
  - `[DEFAULT]` v1 ships **written-first** (no ASR). Voice is added later, gated on measured
    PH-accent ASR word-error-rate, not a date (mis-transcription would masquerade as content
    error). **Pronunciation scoring is deferred indefinitely** (separate acoustic engine,
    orthogonal to the active-vocabulary thesis).

---

## 2. Two independent signals (do not conflate)

| Signal | Owned by | Answers | Changes on |
| --- | --- | --- | --- |
| **Scheduling** | FSRS (ts-fsrs) | _When_ is this word shown again? | Every review (rating → interval) |
| **Mastery** | State machine | _What card tier_ and _what badge_? | Production success / failure |

A word can be **due but not mastered** and **mastered but not due**. They interact (a lapse
triggers a demotion, §3) but are stored separately.

- **Scheduling is owned per _word_, not per tier.** One FSRS entity persists as the word climbs;
  the tier selects which outcome signals are observable (§3.6). One FSRS card per word, never one
  per tier.
- **FSRS's own `State` is not the mastery state.** ts-fsrs carries an internal `State`
  (`New`/`Learning`/`Review`/`Relearning`) — the _scheduling phase_ — separate from the mastery
  ladder (`Seen`/`Recognized`/`Productive`/`Fluent`). Both have a notion of "new"; never derive
  one from the other.

---

## 3. Word lifecycle / state machine

### 3.1 States and the card tier each uses

| State | Meaning | Card tier(s) shown |
| --- | --- | --- |
| `New` | Not yet introduced (pre-state) | — |
| `Seen` | Introduced; form–meaning link not yet confirmed | Recognition (MCQ) → Cloze (typed) |
| `Recognized` | Form–meaning link confirmed (transit state) | Cued production (deterministic) |
| `Productive` | Has produced the word correctly at least once | Free sentence production (judged) |
| `Fluent` | Durable, unscaffolded, spaced production | Spaced maintenance (judged every rep) |

- **`Seen` shows two on-ramp tiers, sequenced:** a meaning→word recognition MCQ first, then a
  later (spaced) typed-cloze. Both deterministic.
- `Recognized` is a **transit state** on the way up, and the **demotion floor** (§3.3): a word
  that fails production lands here for cued practice and never falls below it. (A production
  failure breaks the _production_, not the form–meaning link.)
- **Placement-known words enter at `Recognized`, not `Productive`.** The system skips `Seen`
  only; the word earns `Productive` via one cued pass like any other word. This preserves the
  `Productive` definition ("produced ≥1 time" — a receptively-known word has produced it _zero_
  times) and the §1 receptive≠productive thesis.

### 3.2 Promotion triggers

| Transition | Trigger |
| --- | --- |
| `New → Seen` | First introduction. |
| `Seen → Recognized` | Pass the two-step `Seen` sequence: a meaning→word MCQ pass, then at a **later (spaced)** review a typed-cloze pass. **Promotion fires on the cloze pass**, which by construction follows a prior MCQ pass — two spaced retrievals of increasing difficulty, not two cards in one sitting. See §3.6 (`Seen` cloze-fail handling). |
| `Recognized → Productive` | **One deterministic cued-production pass** (cued is not judged; §4). First genuine productive success — matches the §3.1 definition exactly. |
| `Productive → Fluent` | **Conjunction** of: (a) `[DEFAULT]` **N = 3 free *judged* productions** that pass the judge (cued/recognition/cloze never count); (b) spaced across **separate calendar days** (user-local timezone); (c) FSRS stability **≥ ~21 days** `[DEFAULT]`, tunable; (d) the most recent production was **unscaffolded** (no starter or hint). |

> **On the `Fluent` thresholds.** Deliberately low-regret defaults. N = 3 because the badge is a
> durability claim and demotion (§3.3) means a higher N only slows the badge, never destroys
> progress. The 21-day gate is belt-and-suspenders against "three hits in three consecutive days,
> then forgotten." Both tune once review data exists. **Stricter than the §9 counter threshold by
> design.**

> `[VALIDATE]` **Cued-promotes-`Productive` is an empirical bet.** A deterministic cued recall is
> the _weakest_ productive-direction task, yet it promotes to `Productive`. Acceptable because the
> counter (§9) and `Fluent` both require real free _judged_ sentences downstream, so the weak gate
> never reaches anything user-facing. Revisit if words promote on cued but consistently fail first
> free production.

### 3.3 Demotion triggers

- **Demotion fires on a production-tier _judged_ gate failure, and only there.** A failed
  **free-production** review, or a failed **maintenance** review (judged every rep — §6), drops
  the word one rung: `Fluent → Productive → Recognized`, flooring at `Recognized` (§3.1).
- **This is a single event.** A failed judged gate _is_ the FSRS lapse — it produces the `Again`
  rating (§3.6). One presentation = one review = one rating = at most one demotion (I1).
- **Deterministic-tier failures do not demote.** An `Again` on recognition, cloze, or cued
  reschedules (FSRS) but does not move the ladder — those ratings are low-value (§3.6), and
  mastery is a production concept. Cued is only shown at `Recognized` (the floor), so a cued
  failure could not move the ladder regardless.
- **Maintenance demotion is a normal judged fail.** Because the full cloud judge runs on **every**
  maintenance rep (§6), a maintenance sense-fail is just an ordinary judged `Again` + demote on
  the presentation the learner just made — no background re-check, no async demotion.
- Demotion keeps the productive-vocabulary counter honest: a word the learner could produce three
  weeks ago but just failed is not currently usable, and its badge reflects that.
- **`[VALIDATE]` There is no recovery path for a wrong demotion in v1.** With the override removed
  (§5.5, v4 changelog), a sentence the judge *wrongly* rejects still demotes and still takes the
  `Again` lapse, and that stands. Re-earning happens only through the word's normal future
  reviews. See "Risks introduced by v4."

### 3.4 Scaffolding

- Each production attempt records whether it was **scaffolded** (hint / sentence starter) or
  **unscaffolded**.
- Promotion to `Fluent` requires an unscaffolded success (§3.2d).
- In binary-v1, scaffolding gates the **mastery ladder** (§3.2d) but does **not** pull the **FSRS
  rating** down (§3.6). The flag is recorded from day one.

### 3.5 Track model

- `[DECIDED]` v1 uses a **single productive-forward ladder** (recognition is the on-ramp), for UX
  clarity, rather than parallel receptive/productive tracks.
  - Watch-for: if production fails specifically because the form–meaning link decayed (the learner
    forgot the _meaning_, not the production), that is the trigger to consider a cheap independent
    receptive refresher in a future version.

### 3.6 Deriving the FSRS rating

The rating is the _scheduling_ signal only (§2); the tier determines which outcome signals are
observable. Two invariants hold on every tier:

- **One presentation = one review = one rating** (I1), on the final gradeable outcome.
- **Rule-layer bounces are not reviews** (I2). A submission rejected by §5.2 (word absent,
  degenerate, or Taglish) is malformed _input_, not a memory lapse — **no rating, no scheduler
  call.** Rating these as `Again` injects phantom lapses and corrupts stability. The single most
  important correctness rule in the integration.

`[DEFAULT]` **v1 uses a binary rating (`Again` / `Good`).** Grades here are system-derived, not
self-reported, so `Hard`/`Easy` would be synthesized from thin signal.

**Binary-v1 rating rules (operative now):**

- **Any gate pass = `Good`; any gate fail = `Again`.**
- **Maintenance is judged every rep** (§6): present + sense-pass = `Good`; sense-fail = `Again` +
  demote (§3.3); word-absent = no-rating **bounce** (I2). There is no separate "cheap maintenance
  check" rating path — the rule layer pre-screens malformed input (no rating), then the judge
  produces the one rating.
- **A scaffolded pass = `Good`** in v1 (flag recorded; still gates the mastery ladder).
- **A typo-fixed cloze = `Good`** in v1 (flag recorded).
- **A typed-cloze soft bounce derives no rating** (v4.1 — `spec/13` `FIT-7`): a same-sense or
  different-sense fit-set fill makes no scheduler call and persists no `ReviewLog`, like an I2 bounce
  but for *well-formed* input. It caps (`CLOZE_SOFT_BOUNCE_CAP`), then reveals + `Again`.
- **Latency is not used** to manufacture a rating in v1.
- All richer signals (scaffolding, retry count, typo-fix, latency) are **instrumented from day
  one** so the 4-button mapping can be enabled later if data shows it helps.

**Rules operative in v1:**

- **The free-production `Again` is taken on the _first genuine gate fail_** (§5.2 / §10 step 7).
  There is **no "retry until pass"** against the judge — the schedule must not be gameable into a
  `Good` by re-submitting after a fail. (This protects the integrity of each learner's own FSRS
  data, hence their own learning.) **There is no override and no rejudge in v1** — a
  gate fail is final for that presentation; the word demotes and takes the `Again`. (Consequence
  and risk: §3.3 `[VALIDATE]` and "Risks introduced by v4." An internal inference retry on a
  network/transport error is not a learner signal and never touches the rating — §7.)
- **`Seen` cloze-fail handling:** a failed typed-cloze at `Seen` is a deterministic-tier fail →
  reschedule, no demotion, no LLM. Its next presentation **drops back to the meaning→word MCQ for
  one rep**, then re-attempts cloze. **Cap at one drop-back:** if cloze fails again, the word stays
  at `Seen` showing cloze with shorter FSRS intervals — no MCQ↔cloze ping-pong.
- **No manual tier-difficulty priors.** FSRS's per-card difficulty parameter adapts; injecting
  "production is harder" priors fights the optimizer.
- **A tier change is a difficulty-regime change.** One card spans recognition (easy) → free
  production (hard), so a word stable at recognition can lapse on first production. v1 accepts this
  (FSRS adapts; demotion handles the fallout); recognition/cloze/cued ratings are low-value
  short-history signals, and scheduling becomes meaningful at the free-production tier.

**[v2 / enable-later] full 4-button mapping** — _not_ active in v1; do not build as live behavior:

| Tier | `Again` (1) | `Hard` (2) | `Good` (3) | `Easy` (4) |
| --- | --- | --- | --- | --- |
| Recognition | wrong / revealed | correct after a hint, or slow | correct, normal | correct, fast, first try |
| Cloze (typed) | wrong / gave up / revealed | needed letter hints or a typo-fix | clean correct | clean correct, fast |
| Cued production (det.) | wrong / gave up (reschedules, **no demote**) | correct after a hint | correct, normal | correct, fast, first try |
| Free production (judged) | gate **fail** (also demotes) | gate **pass** but **scaffolded** | gate **pass**, unscaffolded, first attempt | pass, unscaffolded, first attempt, advisory axes clean |
| Spaced maintenance (judged) | sense-fail → demote (§3.3) | pass but scaffolded | clean pass | clean pass, fast |

`[v2]` carried rules (all enable-later): scaffolded success → `Hard`; latency only as an
`Easy`-vs-`Good` tiebreaker on deterministic tiers, never to manufacture `Again`; cloze typo
tolerance (Damerau–Levenshtein ≤1 for ≤6 chars, ≤2 longer) → `Hard`.

---

## 4. Card tiers

| Tier | Researched format | Purpose | Graded by |
| --- | --- | --- | --- |
| Recognition | Recognition (**meaning→word**, MCQ) | Confirm form–meaning link | Deterministic (no LLM) |
| Cloze | Typed cloze in authentic context | Cued recall of the form | Deterministic (no LLM) |
| Cued production | Meaning → produce the word | Produce the word from meaning, prompted | **Deterministic (no LLM)** |
| Free sentence production | Self-referential sentence production | Free sentence using the word | **Cloud judge (§5)** |
| Spaced maintenance | Re-application of free production | Re-production of `Fluent` words at long intervals | **Cloud judge, every rep (§5/§6)** |

- **Cued production is deterministic** — "type the target word from a meaning prompt," graded
  by the same lemma-match logic as cloze. Cued and cloze differ only in cue richness (bare meaning
  vs. sentence-with-a-blank). Two tiers for the difficulty ramp; collapse only if data shows them
  redundant.
- **Typed cloze is graded against a classified fit-set, not a bare lemma match (v4.1 —
  `spec/13`, `FIT-1..11`).** Each item carries a `cloze_fit_set` classifying plausible fills as
  `target | same_sense_near_miss | different_sense_fit`. The target passes (`Good`); a
  non-target-but-valid fill produces a **soft bounce** — no rating, no scheduler call, no
  `ReviewLog`, card stays due — a class distinct from an I2 rule-layer bounce (the input is
  well-formed). A typo (Damerau–Levenshtein ≤ 1 of the target) still rates `Good`. The tier stays
  **deterministic**: no LLM, only the one existing NLP analyze call. Cued does **not** inherit the
  fit-set (it is enumerated against the cloze frame, which cued has no equivalent of).
- **Ladder ordering is a scaffolding/difficulty curve, NOT a productive-value ordering.** The
  climb recognition → cloze → cued → free orders tiers by _scaffolding_ (most-supported →
  least-supported on-ramp). This **inverts** the research's _productive-value_ ranking (which
  places cloze above meaning→word), because a harder task is not worth more if the learner cannot
  yet do it — the on-ramp's job is difficulty sequencing.
- **Recognition MCQ is oriented meaning→word** (prompt = meaning/gloss; options = candidate
  **words**), rehearsing the productive retrieval direction even though the output is a selection
  (so it remains recognition). **Vary the gloss phrasing between the MCQ and the cued prompt** so
  `Recognized` is a form–meaning link, not memorization of one gloss.
- **Free production defaults to a self-reference prompt** ("write a sentence using _{word}_ —
  ideally something true about you"). Self-reference is a retention multiplier, not optional flavor.
  - `[DEFAULT]` **Fallback — offering vs. taking are separate.** The system never auto-_switches_
    into "any sentence" mode. The fallback is **learner-activated** (an explicit tap, "just write
    any sentence"). The **offer** is auto-_surfaced_ after one degenerate/empty self-reference
    submission; surfacing the offer is not switching the mode.
  - `[DEFAULT]` **Recognition MCQ = 4 options** (1 correct word + 3 distractor words).
- `Spaced maintenance` is not a separate researched format — it re-runs the free-production tier at
  long FSRS intervals, judged every rep (§6).
- `[DEFAULT]` **Backlog, not v1:** a dedicated **collocation-production** tier. For v1, collocation
  stays advisory inside the judge (§5.4) and as enrichment (§9).

### 4.1 From word list to cards (content vs scheduling)

A word list (the Oxford-derived **multisense catalog**, `data/oxford_multisense_catalog.csv`) is a
**catalog**, not a set of cards. Conversion spans three layers:

| Layer | Scope | Holds |
| --- | --- | --- |
| **Lexical item** | content, shared across the catalog | the teachable unit + everything needed to _render_ each tier |
| **FSRS card** | one per word | the scheduling entity (§2); tiers are _views_, not separate FSRS objects |
| **Review** | one graded interaction | one rating (§3.6) |

**Catalog row → lexical item.** A row of the multisense catalog gives headword + POS + CEFR +
sense_id + a source sense hint + frequency rank — enough to _select and sequence_ (and to key the
sense), not to _render_. Each item additionally carries **generated** content:
recognition distractors (candidate _words_ for the meaning→word MCQ), a cloze sentence, a cued
prompt, a self-reference prompt + a **model sentence** (for the §5.2 "not a verbatim copy"
heuristic and as the judge's in-context sense reference, §5/§5.5), the **target lemma**, and the
**intended sense** (used by the §5.4 sense gate). This runs **once, offline, in batch** over the
catalog, on the developer machine — outside the live loop — so a **stronger model than the live
DeepSeek V4 Flash judge can be used at build time** (quality matters there; latency and per-call cost do
not). Build-time may use a larger cloud model; the runtime ships only the generated data.

- `[DECIDED]` **Licensing:** use the list only as a frequency/CEFR _ordering_; **generate your
  own** definitions, examples, distractors, and cloze sentences — do not ingest Oxford's. (The
  earlier single-user "personal use" risk relief **no longer applies** — a multi-user web app is
  distribution — so generating your own content is now the **primary** safeguard, not a bonus.
  `[VALIDATE]` Oxford 3000/5000 terms for a distributed app — see §8.)
- `[DEFAULT]` **Sense granularity — multisense (v4.1).** The catalog is multisense: **each WordNet
  sense is its own lexical item** (`sense_id = {lemma}_{pos}_NN`, `_01` = most frequent), so a
  polysemous headword yields several items, each carrying its own intended sense, cloze frame, and
  fit-set (§4.1 cloze, `spec/13`). *(This supersedes the v4 "one item per (headword, POS)" default —
  the per-sense split it deferred is now the shipped shape, which also narrows the
  valid-but-off-sense rejection risk of §5.7.)*

**Lexical item → FSRS card (lazy).** Create the FSRS card **when the seeder introduces the word**
(§8), not for the whole list. A new card is **due immediately**, so instantiating the whole catalog
would make thousands of cards "due now." The list is the catalog; §8 paces introduction.

- **American edition:** the NLP engine (spaCy `en_core_web_sm`, v4.1), distractor/cloze generation,
  and the target-word presence check accept American forms — otherwise "color"/"organize" sentences
  get bounced as word-absent (which, per I2, would silently distort scheduling). *(spaCy does not
  Americanize spelling, so — unlike the old wink layer — no target lemma is unrepresentable.)*

`[DECIDED]` **Scheduler library: ts-fsrs** (`npm i ts-fsrs`, Node ≥ 20) — runs **server-side in the
backend**, per user, no separate scheduling service. `fsrs(params)` + `createEmptyCard()`; apply the
derived rating with `scheduler.next(card, now, rating)`. Retrievability for the §9 counter via
`scheduler.get_retrievability(card, now)`. Retention is `request_retention` (§8). A `Card` is a
plain object with `Date` fields — persist it (per-user, in the database). **Persist every review log
from the first review** — it is the only input to parameter optimization (the separate
`@open-spaced-repetition/binding` package), expensive to retrofit (§8).

---

## 5. Evaluation pipeline (the cloud judge)

### 5.1 Trigger condition

The judge runs **only** on a **free**-production attempt (including maintenance, which re-applies
free production) that has already **passed the rule layer** (§5.2). Recognition, cloze, and cued
production never reach it.

### 5.2 Stage A — rule layer (free, deterministic; pure JS over NLP-service tokens)

Runs first, before any billable judge call. Its reason for existing in v4 is **cost + latency** —
every cloud judge call is billable, and you do not make the learner wait on the *judge* round-trip
to be told they forgot to type the target word. `[DECIDED]` The rules themselves are **pure
in-process JavaScript** (presence, degeneracy, Tagalog-lexicon match) run over **lemma/POS tokens
from the Python spaCy service** (`POST /analyze` — the same engine the pipeline validates with;
v4.1). That analyze call is free (unbilled) and fast — it is the *judge* call, not the analyze call,
that the pre-screen exists to avoid spending. *(v3's in-process wink-nlp is gone — v4.1.)*

1. **Target word present?** — spaCy lemmatizer, **lemma match only (inflection-agnostic)**. Any
   inflected form of the target lemma counts as present.
   - Truly absent → **retry** (bounce, no penalty, no rating, no LLM; I2).
   - Present but mis-inflected → **not a bounce.** Proceeds as normal production; any inflection
     error is handled as grammar by the judge (§5.4). Bouncing a real attempt as "absent" would
     inject the phantom lapse I2 forbids.
2. **Non-trivial, real sentence?** — heuristic.
   - `[DEFAULT]` Degenerate = fewer than **4 content tokens excluding the target**, OR no finite
     verb (spaCy POS), OR normalized similarity to the model sentence **≥ 0.90**
     (verbatim-copy heuristic). Degenerate → **retry** (no penalty, no LLM).
3. **Language / code-switching check** `[DECIDED]` — v1 expects **clean English**.
   - A sentence containing **Tagalog words/clauses (code-switching / Taglish)** is **not accepted
     as-is**; the learner is nudged to rewrite in English (no penalty, framed as "let's keep this
     one in English"). Detected deterministically against a **shipped Tagalog lexicon**. **No LLM
     call.**
   - **Distinct from the above:** an _all-English_ sentence carrying **Tagalog-L1 interference
     grammar** (omitted articles, preposition slips, aspect/tense transfer) is **not**
     code-switching. It proceeds normally and is **corrected-and-passed** by the judge (§5.6),
     never failed.
4. **Grammaticality** — `[DECIDED]` **No standalone grammar tool.** The corrected sentence, the
   precise `replacements` (§5.6), and the meaning-obscuring-grammar gate are all produced by
   **DeepSeek V4 Flash** (§5.4/§5.6). LanguageTool stays removed: it would mean shipping a JVM
   sidecar to duplicate a correction the model already returns, and a deterministic grammar-blocker
   would reject correct-but-L1-flavored sentences (the false-negative trust-killer §5.5 warns of).

**Retry termination.**

- **Rule-layer bounces** (absent / degenerate / Taglish): cap at
  `[DEFAULT] MAX_RULE_BOUNCE_RETRIES = 3`, then **reveal the model sentence + offer skip.** Terminal
  outcome = **no rating, no FSRS update, card stays due** (I2). Closes the no-progress loop without
  a phantom lapse.
- **Judge fails:** rating taken on the **first genuine gate fail** (§10 step 7); no retry-until-pass.

### 5.3 Verdict memo (per-user)

`[DEFAULT]` Before invoking the model: if a previously judged entry matches the **memo key**, return
the **stored verdict** and skip Stage B. In v4 the memo has **cost value again** (skips a billable
DeepSeek call on an identical resubmission) plus latency value — still low-value at per-user scale
(identical-sentence repeats are rare for one learner), so it is optional but cheap. The memo is
**scoped per user, never shared** across accounts (the cross-user cache stays deleted — v4
changelog).

- **Memo key = `normalized_sentence + target_lemma + intended_sense_id`.** A verdict is
  sense-specific (§5.4); keying on text alone would hand the wrong verdict to a different target or
  sense.
- **Normalization:** lowercase, trim, collapse whitespace, strip outer punctuation (`en-US`).
- `[DECIDED]` Exact-normalized match only. No fuzzy/semantic matching (a near-but-not-identical
  sentence can flip sense-correctness).
- Store **`model_version` + `rubric_version`** on each row so swapping the DeepSeek model or the
  rubric **invalidates stale verdicts** rather than serving them. (A correctness property of your
  own upgrades — bump `model_version` on any model swap.)
- **The override→overwrite path is deleted** (no override). The memo is now write-on-judge,
  invalidate-on-version-bump only. The v2.x cross-user scope, per-adjudicator invalidation, and
  `source`-tagging stay deleted.

### 5.4 Stage B — cloud LLM judge (DeepSeek V4 Flash)

Runs only on the **free-production** residue Stage A could not resolve. Judged by **DeepSeek V4
Flash** (`deepseek-v4-flash`). Judged axes:

| Axis | Adjudicator | Role |
| --- | --- | --- |
| Used in the **taught sense / POS** | DeepSeek V4 Flash | **GATE (hard)** — the model's single irreplaceable job |
| Grammatical acceptability | DeepSeek V4 Flash | **GATE (hard)** — fails **only** if an error obscures meaning; surface / L1 errors are corrected-and-passed (§5.6), never failed |
| Collocational naturalness | DeepSeek V4 Flash | Advisory only |
| Register fit | DeepSeek V4 Flash | Advisory only (single mode v1; no mode-gating) |

- **Latency control.** `[VALIDATE]` Confirm DeepSeek V4 Flash's latency (time-to-first-token) and
  **whether it exposes a thinking / reasoning-effort control**. Sense + grammar judgment is a
  constrained classification, not a reasoning-heavy task — so **if** such a control exists, set it
  **low/minimal** for the judge call to keep the §7 "checking…" wait tolerable. (The prior draft
  assumed a reasoning model with a ~5.6 s median TTFT; re-measure for this model.)

### 5.5 Governing principle and promotion gate

- **Strict on meaning, lenient on style.**
- **Promotion gate = (sense-correct) AND (grammatical).** Nothing else blocks advancement.
- Collocation, register, naturalness are **advisory** — they generate "you could also say…"
  enrichment and the **non-failing** `replacements` (§5.6), framed as an upgrade, and **never fail**
  a sentence.
- **False-negative asymmetry.** DeepSeek V4 Flash produces **fewer** sense-gate false negatives than
  the v3 Gemma 4B would, but not zero. Wrongly rejecting a _correct_ sentence remains the
  trust-damaging failure. The rubric stays **biased lenient**.
- **`[DECIDED]` No override, no rejudge, no re-rate in v1.** A gate fail is final for that
  presentation (§3.3, §3.6, §10 step 7). The v3 one-tap override and the older two-stage
  appeal/validator are both deleted. This is a deliberate product choice; its cost is documented
  under "Risks introduced by v4." *(Recommended mitigation, if revisited: a zero-cost, no-model-call
  "count this as correct" that re-rates the failed review as a pass and re-derives the schedule —
  FSRS has no native undo. That is the v3 override, not a rejudge.)*

### 5.6 Structured output + the precise-replacement edit contract

- The model must **show its evidence** in structured JSON: the sense it believes the learner used
  vs the target's intended sense, so a rejection is auditable.
- The model treats common **Tagalog-L1 interference within an English sentence** (article omission,
  aspect/tense transfer, fixed-phrase substitution) as **correctable surface errors** — fixed via
  `replacements` and `corrected_sentence`, **not** counted as meaning failures. (Code-switching,
  i.e. actual Tagalog words, is handled earlier at §5.2.3 and never reaches here.)

**JSON contract (v4):**

```jsonc
{
  "used_in_target_sense": true,        // GATE
  "detected_sense": "string",
  "intended_sense": "string",
  "grammatical": true,                 // GATE (fails only if meaning-obscuring)
  "collocation_natural": true,         // advisory
  "register_fit": "ok | informal | formal | off",  // advisory

  // Precise edits the UI renders inline on the learner's sentence.
  // String find/replace pairs, NOT character indices (see rationale below).
  "replacements": [
    {
      "find": "string",       // EXACT substring copied verbatim from the learner sentence
      "replace": "string",    // replacement text; "" means delete the span
      "reason": "grammar | collocation | register | sense"
    }
  ],

  "corrected_sentence": "string",          // FALLBACK render only (see resolution algorithm)
  "enrichment_suggestion": "string | null",// advisory ("you could also say…")
  "one_line_feedback": "string"            // surfaced on-demand (tooltip/expand), NOT primary
}
```

- **Promotion gate is unchanged:** `used_in_target_sense AND grammatical`. The `replacements` array
  is **presentation, not adjudication** — it never changes the gate. A grammatical/collocation
  polish on a *passing* sentence yields `reason: "grammar"|"collocation"|"register"` edits (the §9
  "green check + corrections" case). A *sense* failure fails the gate regardless of what
  `replacements` contains.
- `[DECIDED]` **Valid JSON via DeepSeek native structured output** (JSON mode + a response schema;
  `[VALIDATE]` the exact request fields for this model). This replaces the v3 GBNF/grammar-constrained
  decoding, which was a local-host mechanism.

**Why find/replace strings, not character indices.** LLMs tokenize text; they do **not** index
characters reliably. Asking for `start_index`/`end_index` makes the model *count characters*, which
produces frequent off-by-one errors on spaces, punctuation, and Unicode — and a reasoning model
does not fix arithmetic-style positional counting. Every production code-editing agent (Cursor,
Aider, `str_replace`) avoids model-supplied indices for this reason: the model **quotes** the span
to change (something it already does well) and **deterministic code** computes the position.

**Resolution algorithm (deterministic, in-process JS — runs after the judge returns):**

1. For each `replacement`, locate `find` as a substring of the **raw learner sentence**.
2. **Exactly one match →** record its `[start, end]` character span; this is the highlight range the
   UI underlines/strikes through (color-coded by `reason`).
3. **Zero matches** (model paraphrased instead of quoting) **or ≥2 matches** (ambiguous span) →
   **discard that single edit** and fall back to displaying `corrected_sentence` for the whole
   sentence. Do not guess a position.
4. Apply surviving edits **right-to-left** (descending `start`) so earlier offsets stay valid as
   later spans are spliced. Overlapping spans → keep the first by `reason` priority (`sense` >
   `grammar` > `collocation` > `register`), drop the overlap.
5. The resolved set drives the inline UI (§9). `corrected_sentence` exists **only** as the
   whole-sentence fallback for step 3 — it is not the primary display.

> Short learner sentences (10–20 words) make multi-match ambiguity rare, so the fallback rarely
> fires. The NLP service's tokens (spaCy, v4.1) can also map a resolved span to token boundaries for
> clean word-level highlighting.

### 5.7 Judge configuration

- `[DECIDED]` **Live judge model: DeepSeek V4 Flash** (`deepseek-v4-flash`), cloud,
  called over HTTPS **from the backend** (the API key never reaches the client). **Native structured
  output** (§5.6) + **2–3 few-shot calibration examples** + a **low/minimal thinking level if the
  model exposes one** for latency (§5.4).
- `[DEFAULT]` **Prompt caching:** cache the rubric/system prompt + few-shots (DeepSeek prompt
  caching). The rubric is identical on every call, and a cache **hit** costs **$0.0028/1M vs
  $0.14/1M** on a miss (~2% of base input) — so caching is **the** dominant per-call cost lever now
  that cloud billing is back.
- `[VALIDATE]` **Rate limits.** Confirm DeepSeek V4 Flash's rate limits (relevant to the §7 failure
  path). Pin behavior with the few-shots and the gold set; bump `model_version` (§5.3) on any model
  swap.
- `[VALIDATE]` **Sense-gate false-negative rate.** Measure FNR against a **gold set of ~30
  hand-labeled sentences** before trusting the gate (expected lower than Gemma 4B; verify). The
  sense gate is the trust-critical job (§5.5). **Upgrade path if FNR is too high: a stronger DeepSeek
  model, not a custom model** — and per the v4 decision, **rejudge does not use a larger model**; any
  model change is a global swap of the live judge (with a `model_version` bump), not a per-sentence
  escalation.
- `[VALIDATE]` **Gold-set drift monitoring is now manual.** With the override removed, there is **no
  override log** feeding the gold set. Drift monitoring becomes a **periodic manual spot-check**:
  hand-judge a small sample of recent verdicts against the rubric and compare. Consider a passive
  "flag this verdict for review" log to get a feed without reintroducing a rating-affecting
  override.
- `[DECIDED]` **Code-switching stance:** clean English; Taglish not accepted (§5.2.3).
- `[DECIDED]` **Mode:** **single everyday mode** expecting clean English. One grammatical policy
  (strict on meaning, lenient on style, L1 surface errors corrected-and-passed). No exam-prep mode
  in v1 (noted as a possible future product line, not a v1 mode).

### 5.8 Not used

- **Embedding-similarity as a sense-match proxy** (brittle; worse than the LLM at the one job
  needed).
- **LanguageTool** (no standalone grammar tool — the corrected sentence comes from the judge, §5.2).
  *(spaCy is **not** in this "not used" list any more: it is the out-of-process NLP engine as of
  v4.1 — see the v4.1 amendment.)*
- **Local inference host (node-llama-cpp / Ollama), GBNF decoding, model warming** (replaced by the
  cloud model + native structured output — §5.4/§5.6/§7).
- **Batch API, cross-user cache, stronger-cloud appeal validator, one-tap override, rejudge** (no
  longer applicable — v4 changelog / §5.5).
- **Character-index replacements** (the model cannot count characters reliably — §5.6).

---

## 6. When the cloud model runs / does not run

**Does NOT run when:**

- The card is recognition, cloze, or cued production (all deterministic).
- The target word is absent on a free-production attempt (rule layer → retry).
- The sentence is Taglish / code-switched (rule layer → nudge to English, retry).
- The sentence is a memo-key match (§5.3).
- A heuristic flags a degenerate sentence (→ retry).

**Runs on:** any **free** production that has **passed the rule layer** — including **every**
spaced-maintenance rep.

- **Maintenance (v4):** the full DeepSeek judge runs on **every** maintenance review, fronted by the
  same rule layer (instant malformed-input bounce). One judged verdict → one rating (I1). A
  maintenance sense-fail demotes immediately, on the presentation the learner just made (§3.3). This
  one-evaluator structure is what keeps the v2.7 §3.6↔§6↔§7 contradiction resolved.
- **`[VALIDATE]` Rationale change:** v3 justified judge-every-rep with "cost is zero" (local). That
  is **no longer true** — each maintenance rep is now a billable DeepSeek call. It is still **cheap**
  because maintenance reps are infrequent (long FSRS intervals) and DeepSeek V4 Flash is inexpensive, so
  judge-every-rep is **retained** — but confirm consciously. If maintenance volume ever makes cost
  matter, the lever is the rule-layer pre-screen + memo or a coarser cadence; **do not** reintroduce
  the v2.x every-Nth dual-evaluator split (it was what created the v2.7 contradiction).
- **Maintenance latency note:** maintenance reps are infrequent, so a several-second cloud judge per
  rep (network RTT + reasoning TTFT; §7) is acceptable; the rule layer still gives an instant bounce
  for malformed input.

---

## 7. Online inference & responsiveness

The judge is now a **cloud** call and the app **requires internet**. There is **no offline mode, no
queue, no sync, no Batch lane, no "saved — we'll check on reconnect" state, and no provisional
checkmark.** Every judgment is synchronous within the session, contingent on connectivity.

- **No model warming.** *(The v3 local-weight warm-load is deleted — there are no local weights.)*
- **Responsiveness affordance:** deterministic tiers (recognition/cloze/cued) feel instant. Free
  production shows a brief **"checking…"** state during the round-trip (client → backend → cloud
  model and back). Budget **several seconds** (`[VALIDATE]` network RTT + DeepSeek V4 Flash TTFT —
  measure it); a low thinking level if the model exposes one (§5.4) is what keeps this tolerable. The
  staged rule layer ensures "checking…" only appears once input is
  well-formed (target word present, non-degenerate, English) — mechanical rejections are instant and
  never spend a call.
- **`[DECIDED]` Live failure path (cloud).** The failure surface is now **network**, not local
  crash/OOM:
  - **Timeout / 5xx / transient network error** → retry once with backoff → on persistent failure,
    surface a neutral **"couldn't check that one — try again"**; leave the card **due with no
    rating** (I2). Never a fabricated `Again`, never a provisional pass.
  - **429 / rate limit** → same neutral message + short backoff; no rating.
  - **No connectivity at submit time** → block the free-production submit with a clear "you're
    offline — reconnect to check this sentence" state; card stays due, no rating. Deterministic
    tiers still work without a model call, but the app as a whole assumes connectivity (P1/P8).
- **`[DECIDED]` API-key handling.** The DeepSeek key lives **server-side in the backend** (secret /
  environment store), **never in the client** — judge calls are proxied through the backend so the
  key is never exposed to a browser. Per-user request attribution and any per-user rate limiting are
  the backend's job. Detailed key/secret management is out of scope for this flow doc; noted so it
  isn't forgotten at deployment.

---

## 8. First-session seeding

- **Deliver a win fast.** `[DEFAULT]` The first successfully-produced sentence comes **before** any
  long calibration. Seed a couple of near-frontier words from a coarse signal (a single self-report
  question, or a mid-band default), reach a production win, **then** offer optional "tune your
  level." (Seeding runs **per new user** on first session; the point is to deliver value before a
  placement exam can bore or churn the learner.)

- **Placement apparatus — three distinct mechanisms, three outputs** (keep separate or
  word-selection wires to the wrong signal):

  | Mechanism | Output | Drives |
  | --- | --- | --- |
  | **LexTALE scalar** (yes/no test) | **one number** — vocab-size/level estimate | (i) initial **frequency-band frontier**; (ii) FSRS **cold-start** difficulty (band × frequency) |
  | **Per-word placement marking** (adaptive items + the placement-known catalog flag) | **per-word known/unknown flags** | which specific words **skip `Seen`** and enter at `Recognized` (§3.1) |
  | **Frequency-ordered catalog** (the Oxford multisense catalog, CEFR-banded + zipf-ordered; v4.1) | the ordered catalog | which words are **selected and scheduled next**, positioned by the band |

  - **LexTALE does NOT mark individual words known** (it is one scalar) — skip-`Seen` keys off the
    **per-word flags**, never the LexTALE score.
  - **LexTALE does NOT select words** — it sets _where_ the frontier is; the **catalog** (band +
    zipf order) picks the actual words at that frontier.
  - For precision (or to report a CEFR level), use the **published LexTALE English instrument** with
    its **validated nonwords** — do not author your own nonwords.
  - **Placement is low-stakes:** FSRS empirically re-estimates per-item difficulty within a few
    sessions, so an off-by-a-band start self-corrects fast. For a user who roughly knows their own
    level, per-word "I know this" marking can be as simple as tapping known words; a full LexTALE
    run is optional.

- **Word selection is the real job of seeding.** Start at the coverage frontier — the
  highest-frequency words just above what's already known.
  - `[DEFAULT]` **Catalog (v4.1):** a single Oxford-derived **multisense catalog**
    (`data/oxford_multisense_catalog.csv`), CEFR-banded (A2–C1) and zipf-ordered; the frontier
    `band` + zipf rank pick the next words (`WordSource.nextFrontierWords`). Because PH receptive
    proficiency is high, set the **default starting frontier at ~B2**. The LexTALE level (if taken)
    nudges the band. *(This retires the v4 NGSL → NAWL → Oxford 5000 three-CSV list stack; v2
    collapsed the multi-list stack, v4.1's runtime selects wholly from the one catalog.)*
  - `[VALIDATE]` **Licensing:** a multi-user web app **is distribution**, so confirm Oxford
    3000/5000 terms — the prior single-user "personal use" exemption no longer applies. Using the
    list only as a frequency/CEFR _ordering_ and **generating your own content** (§4.1) keeps this
    low-risk.
  - **"Professional" vocabulary** has no clean open list; treat domain sublists as a **v2**
    enrichment, not a v1 band.

- **Introduction pacing** `[DEFAULT]`: introduce a small fixed batch interleaved with due reviews —
  **~5 new/day**, and **≤ 30% new when a due backlog exists**, whichever is smaller, so reviews never
  starve. First session seeds ~2 near-frontier words for a fast win. Because cards are created lazily
  at introduction (§4.1), this cap **is** the lazy-creation throttle.
  - **The ~5-new/day pace and the §9 ~5-uses/day goal are independent knobs sharing a default value,
    NOT "matched."** A new introduction is a `Seen` interaction; a "productive use" (§9) is a free
    judged production of a word already past `Seen`. On day one there are zero production-eligible
    words, so the goal cannot be met by new introductions at all.

- **Placement-known words are a catalog marker, not a batch of cards.** A placement result marking a
  word known sets a per-word eligibility flag; no FSRS card exists until the pacer reaches that word.
  When it does, the word is instantiated **directly into `Recognized`** (skipping `Seen` only),
  cold-started for difficulty/stability from CEFR × frequency band, and shows a cued card. One
  deterministic cued pass promotes it to `Productive` (§3.1/§3.2). Placement-known words are paced
  exactly like new words; they simply enter at a higher tier.

  > `[VALIDATE]` **High-proficiency `Seen`-skip** is a separate later efficiency feature. For the
  > high-receptive PH profile, dragging half-known words through the full `Seen` two-step risks
  > tedium. Mitigations: (a) once the 4-button rating is enabled, an `Easy`-grade MCQ first-pass may
  > skip to cloze or `Recognized`; (b) lean on placement-known marking. v1 ships the spaced two-step
  > as the default; tune the skip against real churn data.

- **FSRS** `[DEFAULT]`:
  - **Target retention = 0.90** to start (`request_retention`; tunable). Note: each free production
    is an effortful sentence, so a _lower_ target (0.85–0.88) would cut review burden at the cost of
    more lapses — a learner-facing "intensity" control is a possible later feature.
  - **Per-user optimization** after **~1,000 of that user's own reviews**, via
    `@open-spaced-repetition/binding`; below that, defaults already beat SM-2.
  - **No population-level optimization** — even with multiple users, parameters are fit **per user,
    never pooled** across accounts (multi-tenant; v4 changelog).
  - **Log every review log from the first review** — the sole input to optimization, cheap to store
    now, impossible to recover later.

---

## 9. Gamification surface

Attaches to the loop; adds no separate progression system.

- **Mastery progression** = the visible state ladder (§3), tied to **production success**, able to
  **regress** on failure/lapse. Not count-based, not monotonic.
- **Expressive feedback:** when something was wrong, render the judge's **`replacements` inline on
  the learner's own sentence** — strikethrough the `find` span, show the `replace` insertion,
  color-coded by `reason` (e.g. amber = collocation/register polish, a stronger treatment = grammar).
  Tapping/hovering a span reveals `one_line_feedback` for that edit; the feedback string is
  **on-demand, never the primary surface**. When fully correct, affirm; offer
  `enrichment_suggestion` framed as an upgrade, not a fix. No confetti.
- **"Words you can now use" counter** = productive vocabulary size, the app's actual value. **Tied
  to current retrievability**, so it can **tick down** when words lapse — honest, not vanity.
  - `[DECIDED]` **Counts-as-usable threshold = ≥ 2 spaced successful free _judged_ productions**
    (recognition, cloze, and cued never count; separate calendar days, user-local timezone),
    retrievability-gated. Deliberately **lower than the `Fluent` threshold** (§3.2, N=3): the counter
    answers "words you can currently use"; `Fluent` is a stricter durability badge. A word enters the
    counter while merely `Productive`-with-2-spaced-successes; `Fluent` is a superset.
  - **Retrievability gate:** a word stays in the counter while `get_retrievability(card, now) ≥
    R_floor`, **evaluated live at read time** (so it ticks down between reviews). `[DEFAULT] R_floor
    = 0.70` — **decoupled from `request_retention`** (0.90, §8). 0.90 is the _scheduling_ trigger;
    gating the headline metric there would make it jittery (a word at R=0.89 is "due soon," not
    "unusable"). Tunable; sign off on the value consciously.
  - **Drift is handled by ordinary demotion, not a special flag.** Because maintenance is judged
    every rep (§6), a `Fluent` word whose sense has drifted fails its next maintenance review,
    demotes (§3.3), and leaves the counter through the normal mastery/retrievability path.
- **Optional daily goal**, **set by the learner**, unit = **productive uses** (free judged
  productions; not minutes, not cards, not new introductions).
  - `[DEFAULT]` **Default goal = 5 productive uses/day**, adjustable. Coincides numerically with the
    §8 ~5-new/day pace but is an **independent knob** (different unit). Nudge toward a goal hittable
    ~6 days in 7 — achievability drives retention more than ambition.
- **No aggressive streaks** (deliberate; avoids coercive engagement).

---

## 10. End-to-end loop (one pass)

1. **Schedule** (FSRS) surfaces a due word.
2. The word's **state** (§3) selects the **card tier** (§4).
3. Learner responds.
   - **Recognition / cloze / cued production → deterministic grade** → derive rating (§3.6) → FSRS
     update. State may promote (`Seen → Recognized` on a cloze pass following a prior MCQ pass;
     `Recognized → Productive` on a cued pass). **No LLM.** _(End of pass.)_
   - **Free production / maintenance → continue** (the only judged tiers).
4. **Rule layer** (§5.2): word absent or degenerate → **retry** (no penalty, no LLM); Taglish →
   **nudge to English, retry**. A rule-layer bounce is **not a review** — no rating, no FSRS update
   (I2). Otherwise → continue (show "checking…", §7).
5. **Memo** (§5.3): hit → stored verdict; miss → continue. (No override-overwrite path.)
6. **Cloud LLM judge** (§5.4, DeepSeek V4 Flash): sense gate + grammatical gate (+ advisory
   style + `replacements`).
7. **Verdict:**
   - **Pass** (sense-correct AND grammatical) → **promote** one rung (§3.2); green-check, plus any
     non-failing `replacements`/enrichment rendered inline (§9).
   - **Fail** → **rating taken on this first genuine gate fail** (`Again` + demote, §3.3). Feedback +
     `replacements` shown; a resubmission is **not re-judged or re-scored** (served from memo where
     identical — never re-judge hoping for a pass). **There is no override and no rejudge in v1** — the
     fail stands for this presentation. No harsh penalty.
8. **Derive the rating** (§3.6) and call the scheduler; reschedule the word and **persist the
   `ReviewLog`** (§8 optimizer). Rule-layer bounces (step 4) are skipped here — they produced no
   rating. _(End of pass; loop repeats.)_

### 10.1 Session presentation — mini-session batches (v4.1)

The per-pass loop above is unchanged; **how passes are grouped into a session** is specified in
`spec/14` (`BAT-1..16`). A review session is delivered as consecutive small **batches** sized by
time-anchored effort units (per-tier weights — recognition cheapest, free production most expensive,
because it prices in the judge round-trip and reading the verdict), closed by a three-way cap, each
followed by a **Continue / Done** completion seam showing a batch summary and the daily-goal progress
(§9). This solves the "50-card wall": a large due queue shown as one block offers no reward until the
very end; the batch seam provides an early one.

Batching is **presentation-only pacing** and preserves I1–I4 (`BAT-1`): it adds no evaluator, rates
no bounce, defers no rating — every rating still hits FSRS immediately per review (step 8 above).
Progress ticks **iff a `ReviewLog` was persisted** (`BAT-7`), so cloze soft bounces (§4 / `FIT-7`),
rule-layer bounces (I2, step 4), and network no-ratings (§7) consume time but never advance the bar —
the bar and FSRS ground truth stay in lockstep. The active batch is **server-authoritative**: a
return within `BATCH_ABSENCE_T_MINUTES` resumes at true progress; a longer absence discards the stale
batch's *presentation* state (logged ratings untouched), rebuilds from current due state, and presents
a fresh **"Welcome back — 0/M"** rather than rendering a bar going backwards (`BAT-11..13`).
Introduction seeding runs at most once per learner-local day across rebuilds (`BAT-14`).

---

## 11. Consolidated decisions

### Pedagogy & loop (carried from v2.x/v3, unchanged unless noted)

| # | Item | Resolution | Status |
| --- | --- | --- | --- |
| 1 | Production-mode sequencing (§1) | Written-first; voice as 2nd input method gated on PH-accent ASR WER; pronunciation deferred. | `[DEFAULT]` |
| 2 | `Productive → Fluent` (§3.2) | N = 3 free judged productions, most recent unscaffolded, stability ≥ ~21 days. | `[DEFAULT]` |
| 3 | Single vs dual track (§3.5) | Single productive-forward ladder. | `[DECIDED]` |
| 4 | Card-tier ↔ format (§4) | 1:1; recognition MCQ = meaning→word; ladder = scaffolding curve (not productive-value order); self-reference default; collocation tier → backlog. | `[DEFAULT]` |
| 5 | Taglish (§5.2.3/§5.6) | Clean English; code-switching nudged to English; L1-interference _within English_ corrected-and-passed. | `[DECIDED]` |
| 6 | Grammatical gate (§5.4/§5.5/§5.6) | Gate = sense AND grammatical; grammatical fails only on meaning-obscuring errors; surface/L1 corrected-and-passed; **corrections delivered as a precise `replacements` find/replace array, rendered inline**. | `[DECIDED]` |
| 7 | Mode (§5.7) | Single everyday clean-English mode; exam-prep = possible future product line. | `[DECIDED]` |
| 8 | Calibration (§8) | First win before any long test; ~15–20 adaptive items optional; published LexTALE for precision; scalar ≠ per-word marking ≠ catalog selection. | `[DEFAULT]` |
| 9 | Catalog / bands (§8) | Single Oxford **multisense** catalog, CEFR-banded (A2–C1) + zipf-ordered; default frontier ~B2. *(v4.1 — three-CSV NGSL/NAWL/Oxford stack retired.)* | `[DEFAULT]` |
| 10 | FSRS retention (§8) | 0.90 (tunable); per-user optimize at ~1,000 reviews. | `[DEFAULT]` |
| 11 | Counter + daily goal (§9) | Counter = ≥2 spaced free judged productions, retrievability-gated (distinct from `Fluent`); daily goal default 5 productive uses, learner-set, independent of §8 intro pace. | `[DECIDED]` (split) + `[DEFAULT]` (values) |
| 12 | FSRS rating scheme (§3.6) | Binary `Again`/`Good` for v1; scaffolded pass = `Good`; typo-fixed cloze = `Good`; flags recorded; scaffolding still gates the mastery ladder; 4-button table `[v2 / enable-later]`; rule-layer bounces produce no rating. | `[DEFAULT]` |
| 13 | State machine details (§3) | `Recognized` is demotion floor; placement-known enters at `Recognized`; `Seen` two-step (MCQ → cloze), cloze-fail drops back to MCQ once. | `[DECIDED]` |
| 14 | Word-list → cards (§4.1) | Three layers; one FSRS card per word, lazy at introduction; generate own content; `en-US`; ts-fsrs; log review logs from day one. | `[DECIDED]` |
| 15 | Typed-cloze fit-set (§3.6/§4/`spec/13`) | Classified `cloze_fit_set` (target / same-sense near-miss / different-sense fit) + no-rating **soft bounces** (a class distinct from an I2 bounce); typo-fix (DL ≤ 1) → `Good`; deterministic, no LLM. | `[DECIDED]` (v4.1) |
| 16 | Mini-session batching (§10.1/`spec/14`) | Sessions presented as effort-unit **batches** with a Continue/Done seam and server-authoritative resume/rebuild; presentation-only pacing, I1–I4 preserved. | `[DECIDED]` (v4.1) |

### v4 platform pivot (new / changed)

| # | Item | Resolution | Status |
| --- | --- | --- | --- |
| P1 | Platform | **Web app, multi-user (multi-tenant)** with accounts/auth, **backend** fronting the loop, **internet required** (offline-first **dropped**). *(Electron desktop / single-user dropped.)* | `[DECIDED]` |
| P2 | Judge model | **DeepSeek V4 Flash** (`deepseek-v4-flash`), native structured output, 2–3 few-shots, low thinking level if exposed. Build-time content gen may use a stronger cloud model. | `[DECIDED]` |
| P3 | Inference host | **Cloud HTTPS from the backend** (key server-side; never client-exposed). *(node-llama-cpp / Ollama deleted.)* | `[DECIDED]` |
| P4 | Deterministic layer | Pure-JS rules (presence/degeneracy/Tagalog-lexicon) + the find/replace span resolver (§5.6), over lemma/POS **tokens from the Python spaCy service** (`POST /analyze`, v4.1 — in-process wink-nlp removed); shipped Tagalog lexicon for code-switch. LanguageTool stays removed. | `[DECIDED]` |
| P5 | Grammar tool | LanguageTool stays removed; corrected sentence + `replacements` + meaning-obscuring gate come from DeepSeek (§5.2.4/§5.6). | `[DECIDED]` |
| P6 | Maintenance evaluation | Full cloud judge **every rep**; rationale changed from "free" to "cheap + infrequent" — re-confirm (§6). | `[DECIDED]` — re-confirm |
| P7 | Appeal / override / rejudge | **All removed in v1.** No override, no rejudge, no re-rate. *(See "Risks introduced by v4.")* | `[DECIDED]` |
| P8 | Offline flow | **Dropped.** Internet required; every judgment synchronous and connectivity-contingent; cloud failure path in §7. | `[DECIDED]` |
| P9 | Cache → memo (§5.3) | **Per-user** memo (never shared across accounts); **cost value restored** (skips a billable resubmission); `model_version`/`rubric_version` retained for self-upgrades; override-overwrite path deleted. | `[DEFAULT]` |
| P10 | FSRS optimization | **Per-user only** at ~1,000 reviews (per user); population-level deleted. | `[DEFAULT]` |
| P11 | Live failure path (§7) | **Cloud** failures (timeout/5xx/429/offline) → retry once → neutral "try again," card stays due, **no rating** (I2). | `[DECIDED]` |

### Items still pointing outward

- `[VALIDATE]` **DeepSeek V4 Flash sense-gate false-negative rate** vs the ~30-item gold set
  (§5.7) — the trust-critical check; upgrade path is a stronger DeepSeek model on a **global** swap,
  not a per-sentence larger-model rejudge.
- `[VALIDATE]` **DeepSeek V4 Flash latency + structured-output specifics** (§5.4/§5.6) — TTFT,
  whether a thinking/reasoning-effort control exists, and the exact JSON-mode/response-schema request
  fields; confirm in current DeepSeek docs before shipping.
- `[VALIDATE]` **DeepSeek model/version pinning** — bump `model_version` (§5.3) on any model swap.
- `[VALIDATE]` **API-key + secret handling at deployment** — DeepSeek key server-side in the backend,
  never client-exposed (§7).
- `[VALIDATE]` **Single-sense gate (§4.1/§5.7)** — valid-but-off-sense rejections of polysemous words
  are now unrecoverable; watch the gold set and split senses earlier if they pile up.
- `[VALIDATE]` **Cued-promotes-`Productive`** (§3.2) and **high-proficiency `Seen`-skip thresholds**
  (§8) — confirm against real review/churn data.
- `[VALIDATE]` **ASR word-error-rate on PH-accented English** (§1) — gates voice input.
- Sign-offs on `[DEFAULT]` values: `R_floor` 0.70 (§9), retention 0.90 (§8), N=3 / 21-day `Fluent`
  gates (§3.2), maintenance cost tolerance (§6), all numeric thresholds — instrumented to be tuned
  from real review data; none load-bearing enough to agonize over pre-build.

---

## Risks introduced by v4 (read before sign-off)

1. **False rejections are now unrecoverable (highest-impact).** Removing the override removes the
   only path to undo a wrong judged fail. A correct sentence the model misjudges → `Again` (a real
   FSRS lapse) + demotion (§3.3), buried in short intervals, **with no undo**. This re-creates the
   exact phantom-lapse corruption I2 was written to prevent — now sourced from model error instead
   of malformed input. The override cost **zero tokens**, so its removal **saves nothing**; it only
   removes the safety valve. *Recommended mitigation:* restore a zero-cost, no-model-call **"count
   this as correct"** that re-rates the failed review as a pass and re-derives the schedule (FSRS has
   no native undo) — this is the v3 override, and it is not a "rejudge." If it stays removed, accept
   that some known-good words will get buried and self-correct only through normal future reviews.

2. **Drift monitoring loses its automatic feed.** The override log was the gold-set's data source
   (§5.7). Without it, drift detection is manual spot-checks. Consider a passive "flag for review"
   log that records verdicts without affecting the rating.

3. **Network is a hard dependency in the core loop.** Rate limits, model TTFT, and connectivity gaps
   now block free-production judging. §7's failure path keeps these from corrupting FSRS (no rating
   on failure), but the *experience* degrades without a network in a way the v3 local design never
   did.

4. **Multi-user shifts API cost onto the operator + opens an abuse surface (new in this revision).**
   With the DeepSeek key held server-side (§7), **every user's judge call is billed to you, not to
   them** — the per-user economics that a single-user own-key desktop app enjoyed are gone. A free
   production is a billable call triggered directly by user input, so an abusive or runaway account
   can run up cost. Mitigations live in the backend, not this flow doc, but must exist before launch:
   **per-user authentication, per-user rate/quota limits, and abuse monitoring.** The §5.2 rule-layer
   pre-screen and the §5.3 per-user memo blunt cost but do **not** bound a determined abuser.
