# Wikain — Build-Time Content Generation Spec

**Version:** gen-spec v1
**Generator (Stage B):** Claude Code (Opus 4.8), **in-session** — the deterministic harness feeds
carried fields and the in-session model returns the generated fields. **No external API / API key.**
**Output format:** raw JSON (one array file per batch + a combiner) — see §6
**Read these first:** `PRD.md` (the product). This spec operationalizes them; if this spec and the PRD ever disagree, **stop and flag it** — do not pick one.

---

## 0. What this document is, and how to run it

This is a **three-stage offline batch pipeline** that converts two word lists into runtime-ready
**lexical items** for Wikain. The stages are deliberately separated and **gated** — do not blend them:

| Stage | Nature | LLM? | Gate before next stage |
| --- | --- | --- | --- |
| **A — Assemble** | Deterministic data engineering (parse, normalize, sense-split, quarantine, merge) | **No** | Human reviews the assembled manifest + quarantine list |
| **B — Generate** | Per-item linguistic content generation | **Claude Code (Opus 4.8), in-session** | Human spot-checks the first batch against §5 + §7 |
| **C — Validate** | Auto-asserts + flagged human spot-check | Mostly no | All asserts pass; flagged items reviewed |

**The single most important rule:** Stage A produces every item **exactly once** with its **carried
fields** already filled from the source CSVs. Stage B **only generates the linguistic fields** and
**must never write, overwrite, infer, or "correct" a carried field** (CEFR, POS, list membership,
rank). Carried = fact from the source; generated = produced by the model. Mixing them is how factual
hallucination enters the data. See §4 for which is which.

---

## 1. Goal & non-goals (so generation does not drift)

**Goal.** Build the content that lets Wikain run a **productive-vocabulary** loop: the learner is
asked to *produce* a target word — ideally in a self-referential sentence — and the cloud judge
grades sense + grammar. Recognition/cloze/cued are on-ramps; **the produced sentence is the lesson**
(PRD §1, research Finding 1–4). Every generated field exists to serve one tier of that ladder.

**Non-goals (do NOT generate these):**
- No definitions/example sentences copied or paraphrased from Oxford or any dictionary — **generate
  original content** (PRD §4.1 licensing decision). Use the lists only as a *membership + CEFR +
  frequency ordering*.
- No pronunciation, audio, IPA, etymology, or images (out of scope for v1, PRD §1).
- No grammar-correction logic, no judge rubric — that is runtime (PRD §5), not build-time.
- No A1–B1 / function-word cards unless §3.4 says so.

---

## 2. Inputs (exact formats — both verified against the real files)

### 2.1 NAWL — `data/NAWL_1.2.csv`
- Header: `rank,word,pos`. 956 data rows. **Frequency-ranked** (rank 1 = most frequent). CRLF line
  endings — strip `\r`.
- `pos` vocabulary observed: `noun` (561), `adj` (202), `verb` (125), `adv` (55), `prefix` (10),
  `prep` (2), `det` (1), `pron` (1).
- **One POS per row.** A word with two POS appears as two rows (rare in NAWL).
- No sense splits, no CEFR, no parentheticals. `word` is the bare lemma.

### 2.2 Oxford 5000 — user-converted CSVs `word,pos,cefr`
- Ships as **two** files read as one union: `data/american_oxford_3000_by_cefr_level.csv`
  (A1–B2, carries the sense parentheticals) + `data/american_oxford_5000_by_cefr_level.csv`
  (B2–C1 extension). Together they are the full Oxford 5000. Stage A reads 3000 first so it wins
  any `(lemma,pos,sense)` collision (keeps the lower CEFR).
- The user converted the official A1–C1 Oxford 5000 to these CSVs. **This supersedes the scrambled
  PDF/markdown** — use the CSVs, not the markdown.
- Multi-POS = **separate rows** (e.g. `bid,noun,…` and `bid,verb,…`).
- **Sense splits survive as a glued parenthetical on the word:** `bank(river),noun,A1` and
  `bank(money),noun,A1`. The parenthetical is a **sense disambiguator** (see §3.2).
- CEFR is on each row → **per `(word, pos, sense)`**.
- `pos` vocabulary includes content POS (`noun/verb/adj/adv`) **and** closed-class values such as
  `indefinitearticle` (concatenated, no spaces). Normalize per §3.1; filter per §3.4.

> **`[VALIDATE]` before Stage A:** confirm the Oxford CSV's POS strings against the normalization map
> in §3.1. If a POS string appears that the map doesn't cover, **halt and flag** — do not guess a
> mapping.

---

## 3. Stage A — Assembly (deterministic; NO LLM)

Output of this stage: an **assembled manifest** — every in-scope item with its carried fields filled
and its generated fields empty — plus a **quarantine list** (excluded items + reason). Gate on human
review before Stage B.

### 3.1 Normalize POS
Map both files to one controlled vocabulary: `noun, verb, adj, adv, prep, pron, det, num, article,
conj, prefix, other`. Examples: `indefinitearticle`/`definitearticle` → `article`; spelled-out
forms → the tag above. **Unknown POS string → halt and flag**, never silently bucket as `other`.

### 3.2 Split sense parentheticals (Oxford only)
For a raw word like `bank(river)`:
- `lemma` = text **before** `(` → `"bank"`
- `word` (display) = same as `lemma` → `"bank"` *(kept as a separate field per the word≠lemma
  decision; equal in value here, but the field stays distinct)*
- `sense_hint` = text **inside** `()` → `"river"` (else `null`)
- `sense_id` = `{lemma}_{pos}_{slug(sense_hint or "01")}` → `bank_noun_river`

For words with no parenthetical: `sense_hint = null`, `sense_id = {lemma}_{pos}_01`.
For NAWL words: `word = lemma = csv word`, `sense_hint = null`, `sense_id = {lemma}_{pos}_01`.

> The `sense_hint` is a **seed** for the generated `intended_sense` (§5), not the final sense text.
> It directly mitigates the PRD §5.7 polysemy risk (off-sense false-rejections, now unrecoverable in
> v4). Treat any Oxford parenthetical as authoritative sense scope.

### 3.3 Quarantine (exclude from generation, keep in a side file with reason)
- **All 10 NAWL `prefix` entries** (`ex, non, pre, trans, anti, sub, micro, semi, multi, neo`) —
  bound morphemes; unusable in every productive tier and would false-match inside unrelated words at
  the §5.2.1 gate. `[DECIDED]`
- Anything the §3.4 scope filter drops.

### 3.4 `[DECISION — confirm before running]` v1 scope filter
**Recommended default:** generate only items whose normalized POS ∈ `{noun, verb, adj, adv}`,
**plus** the 4 NAWL function words the user chose to keep (`whoever/pron`, `whichever/det`,
`amongst/prep`, `minus/prep`). Quarantine all other closed-class items (articles, numbers,
conjunctions, and Oxford's pronouns/prepositions/determiners).

*Rationale:* Wikain is a **productive** vocabulary app targeting **upper-intermediate enrichment**
(PRD §1, §8 frontier ≈ B2 + NAWL). Articles/pronouns/etc. (a) cannot host a meaningful
self-reference production task and (b) sit below the frontier — the PH learner already produces them.
Generating cards for `an`/`the`/`of` would waste Opus calls and pollute the deck.

**Open sub-decision:** a **CEFR floor.** A1–A2 Oxford content words (`buy`, `go`) are also largely
below frontier. Options: (i) no floor for v1 (generate all content words, let FSRS/seeding handle
ordering — PRD §8 paces introduction anyway); (ii) floor at B1; (iii) floor at B2. **Recommended:
(i) no floor for v1**, because §8's seeder already starts at the frontier and paces introduction, so
below-frontier items simply never get introduced — they cost storage, not learner time. But confirm,
because it changes the generated-item count by thousands.

### 3.5 Merge / dedup (key = `(lemma, pos)`, case-insensitive)
The merged catalog is the **union** of both files, deduped on `(lemma, pos)`. Per-item fields:

| Field | Oxford-only | NAWL-only | In both |
| --- | --- | --- | --- |
| `cefr` | from Oxford | `null` | from Oxford |
| `list_rank` | `null` | from NAWL | from NAWL |
| `source` | `"oxford"` | `"nawl"` | `"both"` |
| `sense_hint` / senses | Oxford senses kept distinct | single (`null`) | see note |

> **`[FLAG]` merge multiplicity.** When NAWL `(bank, noun)` matches **multiple** Oxford senses
> (`bank(river)`, `bank(money)`), attach the **same `list_rank` to every matched sense** — NAWL ranks
> the `(lemma, pos)`, not a sense. Record this fan-out in the manifest so it's auditable.

### 3.6 Derive `band` (coarse cold-start signal, PRD §8 `band × frequency`)
- Oxford/both → `band = cefr` (`"A1"`…`"C1"`).
- NAWL-only → `band = "B2-C1"` (the §8 default frontier zone for NAWL; **coarse and honest**, not a
  fabricated per-word level). `cefr` stays `null` for these — do **not** invent a CEFR.

**Stage A exit gate:** human reviews (a) the quarantine list, (b) total in-scope count, (c) a sample
of merged/fanned-out rows, (d) any halted-and-flagged POS. Only then start Stage B.

---

## 4. Output item schema (the runtime lexical item)

```jsonc
{
  // ---- CARRIED (facts from source CSVs — Stage A fills, Stage B MUST NOT touch) ----
  "word": "specialist",          // display form
  "lemma": "specialist",         // §5.2.1 presence-gate key (separate field by decision)
  "part_of_speech": "noun",      // item key with word; one item per (word,pos,sense)
  "sense_id": "specialist_noun_01",
  "sense_hint": null,            // Oxford parenthetical, or null
  "cefr": "B2",                  // ← from the Oxford CSV VERBATIM; null for NAWL-only. NEVER invent.
  "list_rank": 412,              // ← from NAWL VERBATIM; null for Oxford-only.
  "band": "B2",                  // derived in §3.6 for cold-start
  "source": "both",              // oxford | nawl | both

  // ---- GENERATED by Opus 4.8 (Stage B) ----
  "intended_sense": "string",          // tight sense def; the judge's anchor (PRD §5.4)
  "recognition_meaning": "string",     // MCQ prompt gloss (meaning→word)
  "distractors": ["w1", "w2", "w3"],   // 3 wrong WORDS, same POS (PRD §4)
  "clozed_sentence": "string",         // one blank as "_"
  "productive_meaning": "string",      // cued prompt; DISTINCT phrasing from recognition_meaning
  "model_sentence": "string",          // non-self-referential exemplar of the sense
  "self_reference_prompt": "string",   // concise per-word personal nudge

  // ---- PROVENANCE ----
  "gen_model": "claude-opus-4-8",
  "gen_spec_version": "gen-spec v1"
}
```

> The carried-field values shown above (`cefr: "B2"`, `list_rank: 412`) are **illustrative
> placeholders**. The real values come from the CSVs at Stage A. If `specialist` is not in the Oxford
> CSV, its `cefr` is `null` — do not assert a level from memory. This discipline is the whole point of
> the carried/generated split.

---

## 5. Stage B — Generation rules (Claude Code / Opus 4.8, in-session, per item)

The in-session generator (Claude Code / Opus 4.8) receives one item's **carried fields** and returns
**only the generated fields** as JSON — fed by the `feed`/`ingest` harness, not an external API call.
Deterministic code then merges generated + carried into the schema above. Generate field-by-field to
these rules; every rule maps to a PRD section or research finding.

**`intended_sense`** — One tight sentence naming the precise sense (POS- and `sense_hint`-scoped). It
must be specific enough that a judge can rule a *near-miss* sense wrong (PRD §5.4/§5.7). Vague senses
cause both false passes and now-unrecoverable false rejections.

**`recognition_meaning`** — The MCQ prompt: a short gloss of *this* sense, phrased so exactly one of
the four words (the target) fits it.

**`distractors`** (exactly 3) — Wrong **words**, **same POS** as the target, plausible/same register,
but **none may satisfy `recognition_meaning`** (no near-synonyms of the target — that creates a
two-correct-answer MCQ). Not absurd throwaways either.

**`clozed_sentence`** — One original sentence with exactly one blank rendered `_`, in authentic
context that disambiguates to `intended_sense`. **Must read correctly with the BARE LEMMA inserted**
(cloze is graded lemma-only, PRD §4) — avoid contexts that grammatically force an inflection the bare
lemma violates. No other word may fit the blank.

**`productive_meaning`** — The cued prompt (English only, per decision). **Semantically equivalent to
`recognition_meaning` but lexically/structurally distinct** — no shared content-word stem, no trivial
reorder. Test: could a learner pass cued by string-matching the MCQ gloss? If yes, regenerate. Same
sense as everything else (PRD §4: prevents passive-recognition leakage into `Recognized`).

**`model_sentence`** — One original, natural sentence that **unambiguously instantiates
`intended_sense`** (it is the judge's in-context anchor, PRD §5.4). **Not self-referential** (no
`I`/`my`/`me`) so a learner can't copy it into the self-reference task and get bounced by the §5.2.2
≥0.90 verbatim guard. Show one common collocation.

**`self_reference_prompt`** — One **concise** question steering a personal sentence toward
`intended_sense`. **Contains no inflected form of the target** and is not a paraphrase of
`model_sentence`. Self-reference is a retention multiplier (research Finding 6; PRD §4), not flavor.

**Locale:** all generated text **en-US** (PRD §4.1) so runtime presence/cloze checks don't bounce
American forms.

### 5.1 Worked gold example — `specialist (noun)`
Use as the in-context few-shot. (Carried fields here are placeholders; real ones come from the CSV.)

```jsonc
// generated fields only:
{
  "intended_sense": "A person who concentrates on and has expert knowledge or skill in one particular branch of a profession, subject, or activity.",
  "recognition_meaning": "an expert in one particular branch of a subject or profession",
  "distractors": ["apprentice", "volunteer", "candidate"],
  "clozed_sentence": "The doctor referred her to a _ for treatment of her heart condition.",
  "productive_meaning": "someone who focuses deeply on a single, narrow area rather than knowing a little about many things",
  "model_sentence": "Diagnosing such a rare condition usually requires a specialist rather than a general practitioner.",
  "self_reference_prompt": "When have you needed help from someone who focuses on just one narrow field?"
}
```
Why it passes the §7 checklist: distractors are all person-nouns, none meaning "expert"; the two
glosses share no content-word stem; the cloze reads with the bare lemma; the model sentence has no
"I" and anchors the sense via the "rather than a general practitioner" contrast; the prompt hides the
word form.

### 5.2 Per-item generation prompt template (Claude Code fills `{…}`)
```
You are generating ESL learning content for ONE English lexical item. Return ONLY valid JSON with
exactly these keys: intended_sense, recognition_meaning, distractors, clozed_sentence,
productive_meaning, model_sentence, self_reference_prompt. No prose, no markdown.

Target item:
- word: {word}
- part_of_speech: {part_of_speech}
- sense_hint: {sense_hint}        // may be null; if present, it constrains the sense
- cefr/band: {band}               // difficulty register to aim the example/gloss at

Rules: [paste §5 field rules + the §5.1 example as a one-shot]. Generate ORIGINAL content; do not
copy dictionary text. en-US spelling. If you cannot satisfy a rule (e.g. an adjective with no clean
3 same-POS distractors), set that field to null and add "_flags": ["reason"] — do NOT force it.
```

---

## 6. Output files, batching, resumability (raw JSON)

- **Batch size:** `[DEFAULT]` 25 items/batch. Small enough to spot-check, large enough to be cheap.
- **Per batch:** write `out/batch_{NNNN}.json` = a **JSON array** of fully-merged items
  (carried + generated). Raw JSON, as requested.
- **Combiner:** a deterministic step concatenates all `batch_*.json` arrays into `out/items.json`
  (one array). Re-runnable; last-write-wins by `sense_id`.
- **Resumability:** maintain `out/_done.json` = list of completed `sense_id`s. Before generating,
  skip any `sense_id` already in `_done`. A crashed run never regenerates or duplicates.
- **Provenance:** stamp `gen_model` + `gen_spec_version` on every item (§4) so a model/spec change
  can invalidate stale content later (mirrors PRD §5.3 `model_version`).

---

## 7. Validation (Stage C) — auto-asserts + flagged human review

### 7.1 Auto-assert (deterministic; fail the batch on any miss)
- Item key `(word, part_of_speech, sense_id)` unique across the whole catalog.
- `lemma`, `word`, `part_of_speech`, `sense_id` non-empty; `cefr` ∈ {A1…C1, null};
  carried fields **unchanged** from the Stage-A manifest (diff them — Stage B must not have touched
  them).
- `distractors`: exactly 3, all distinct, none equal to `word` (case-insensitive).
- `clozed_sentence`: contains exactly one `_`; inserting the bare `lemma` yields no double space /
  broken spacing.
- `model_sentence`: contains no `I`/`I'm`/`my`/`me`/`myself` token; contains an inflected-or-base
  form of `lemma`.
- `self_reference_prompt`: contains **no** inflected-or-base form of `lemma` (presence = leak →
  fail); is a question or imperative; under ~140 chars.
- `recognition_meaning` ≠ `productive_meaning`, and they **share no content-word stem** (lemmatize
  both, intersect minus stopwords; non-empty intersection on content words → **flag**, not auto-fail).
- All generated strings non-empty unless paired with a `_flags` entry.

### 7.2 Needs human spot-check (cannot be auto-validated — sample ~10% per batch)
- Does each `distractor` genuinely **fail** `recognition_meaning` (no second correct answer)?
- Does `model_sentence` actually instantiate `intended_sense` (not a different sense)?
- Does `clozed_sentence` admit **only** the target in the blank?
- Is `intended_sense` tight enough to reject a near-miss sense?
- For Oxford sense-split items: do the two senses' generated content stay cleanly separated?

> Keep these spot-checked items as the seed of the PRD §5.7 **~30-item gold set** for runtime
> judge-FNR monitoring. Build-time and runtime validation reuse the same labeled examples.

### 7.3 Flag-don't-fix
On any rule the model cannot satisfy (e.g. an adjective with no clean 3 same-POS distractors, or a
word whose only sense is below-frontier), the model sets the field `null` + `_flags`. Stage C
collects all `_flags` into `out/_review.json` for human resolution. **Never auto-fabricate** a
distractor or sense to clear a flag.

---

## 8. Hard "do nots" (recap — these protect data integrity)
1. **Never write or alter a carried field** (`cefr`, `part_of_speech`, `list_rank`, membership).
   Carried = source fact. (§0, §4)
2. **Never invent CEFR.** NAWL-only items have `cefr: null`. (§3.6)
3. **Never copy/paraphrase Oxford or dictionary text** — generate original content. (PRD §4.1)
4. **Never one-shot the catalog** — batch + validate + gate. (§6, §0)
5. **Never let a distractor satisfy `recognition_meaning`.** (§5, §7)
6. **Never put `I`/`my` in `model_sentence`** or any target-word form in `self_reference_prompt`. (§5)
7. **Never silently bucket an unknown POS** — halt and flag. (§3.1)
8. **Stop and flag** any conflict between this spec and `PRD.md`. (§0)

---

## 9. Decisions — RESOLVED (confirmed by the human before the run)
1. **§3.4 scope filter** — ✅ content POS `{noun, verb, adj, adv}` **+** the 4 NAWL function words
   (`whoever/pron`, `whichever/det`, `amongst/prep`, `minus/prep`); **no CEFR floor** for v1.
2. **§6 batch size** — ✅ **25** items/batch.
3. **§3.5 merge fan-out** — ✅ attach the **same `list_rank` to all matched senses**.

Implemented in `build/` (TypeScript). Stage A run produced **5,904** in-scope items
(oxford 4957 / both 520 / nawl 427) and **293** quarantined (283 out-of-scope POS + 10 NAWL
prefixes); 3 `bank` senses; 0 NAWL→multi-sense fan-out; 7 Oxford `(lemma,pos,sense)` collisions
deduped to the lower CEFR.