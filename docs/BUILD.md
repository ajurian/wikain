# Wikain — Build-Time Content Generation Spec

**Version:** gen-spec v3
**Generator (Stage B):** **manual, via frontier-LLM free chats** (no API). The catalog is split by CEFR
level: `feed` stages one batch per level (A2/B1/B2/C1), `generate` turns each into a markdown prompt
(`_prompt_<cefr>.md`) the user pastes into a frontier LLM, the user saves each result to
`_generated_batch_<cefr>.json`, and `ingest` validates + commits all present levels. No API key needed.
**Output format:** raw JSON (one array file per committed batch + a combiner) — see §6
**Read these first:** `PRD.md` (the product). This spec operationalizes them; if this spec and the PRD ever disagree, **stop and flag it** — do not pick one.

---

## 0. What this document is, and how to run it

This is a **three-stage offline batch pipeline** that converts one word list into runtime-ready
**lexical items** for Wikain. The stages are deliberately separated and **gated** — do not blend them:

| Stage | Nature | LLM? | Gate before next stage |
| --- | --- | --- | --- |
| **A — Assemble** | Deterministic data engineering (parse, normalize, scope-filter, quarantine, dedup) | **No** | Human reviews the assembled manifest + quarantine list |
| **B — Generate** | Per-item linguistic content generation | **Frontier LLM (manual free chat via `_prompt_<cefr>.md`)** | Human spot-checks the first batch against §5 + §7 |
| **C — Validate** | Auto-asserts + flagged human spot-check | Mostly no | All asserts pass; flagged items reviewed |

**The single most important rule:** Stage A produces every item **exactly once** with its **carried
fields** already filled from the source CSV. Stage B **only generates the linguistic fields** and
**must never write, overwrite, infer, or "correct" a carried field** (CEFR, POS, frequency). Carried =
fact from the source; generated = produced by the model. Mixing them is how factual hallucination
enters the data. See §4 for which is which.

---

## 1. Goal & non-goals (so generation does not drift)

**Goal.** Build the content that lets Wikain run a **productive-vocabulary** loop: the learner is
asked to *produce* a target word — ideally in a self-referential sentence — and the cloud judge
grades sense + grammar. Recognition/cloze/cued are on-ramps; **the produced sentence is the lesson**
(PRD §1, research Finding 1–4). Every generated field exists to serve one tier of that ladder.

**Non-goals (do NOT generate these):**
- No definitions/example sentences copied or paraphrased from any dictionary — **generate original
  content** (PRD §4.1 licensing decision). Use the list only as a *membership + CEFR + frequency
  ordering*.
- No pronunciation, audio, IPA, etymology, or images (out of scope for v1, PRD §1).
- No grammar-correction logic, no judge rubric — that is runtime (PRD §5), not build-time.
- No function-word cards; content POS only (§3.4).

---

## 2. Input (exact format — verified against the real file)

### 2.1 Merged word list — `data/merged_oxford_a2c1_zipf.csv`
- Header: `word,pos,cefr,zipf,zipf_rank`. 4,397 data rows. One flat file — this **replaces** the
  earlier three-CSV stack (NAWL + Oxford-3000/5000), and with it all the reconciliation machinery
  (sense-parenthetical splitting, NAWL rank fan-out, 3000-vs-5000 collision, function-word allowlist,
  `source`/`band` tags).
- **Every row carries a real CEFR** — `A2/B1/B2/C1` only (no A1). `zipf` is a SUBTLEX-scale frequency
  (higher = more frequent); `zipf_rank` is a **dense** rank (1 = most frequent) present on every row.
- **One POS per row.** A word with two POS appears as two rows (e.g. `circle,noun` and `circle,verb`).
  `word` is the bare lemma — **no parentheticals**.
- `pos` vocabulary observed: `noun`, `verb`, `adj`, `adv` (in scope) plus a few `modalv`/`auxiliaryv`
  (out of scope → quarantined, §3.4). Normalize per §3.1.
- A handful of `(word,pos)` pairs recur at two CEFR levels (a merge artifact — `race`, `ring`,
  `survive`). Stage A keeps the **lower** CEFR and records the collision (§3.5).

> **`[VALIDATE]` before Stage A:** confirm the CSV's POS strings against the normalization map in §3.1.
> If a POS string appears that the map doesn't cover, **halt and flag** — do not guess a mapping.

---

## 3. Stage A — Assembly (deterministic; NO LLM)

Output of this stage: an **assembled manifest** — every in-scope item with its carried fields filled
and its generated fields empty — plus a **quarantine list** (excluded items + reason). Gate on human
review before Stage B.

Stage A is now a **single parse loop** over the one CSV (`build/stageA.ts` → `assemble(rows)`):
per row → normalize POS → scope-filter → validate CEFR/zipf → derive `sense_id` → dedup. No
sense-splitting, no NAWL merge, no rank fan-out, no `source`/`band` derivation (all removed with the
three-CSV stack).

### 3.1 Normalize POS
Map to one controlled vocabulary: `noun, verb, adj, adv, prep, pron, det, num, article, conj, prefix,
other`. The closed-class exotics in the CSV (`modalv`, `auxiliaryv`) map to `other` explicitly.
**Unknown POS string → halt and flag**, never silently bucket as `other`.

### 3.2 Derive lemma + sense_id
There are no parentheticals, so: `lemma` = lowercased `word`; `word` (display) = the CSV `word`
verbatim; `sense_id = {lemma}_{pos}_01`. (`word` stays a separate field from `lemma` per the
word≠lemma decision, even though they differ only in case.)

### 3.3 Validate carried numerics
`cefr` must be one of `A2/B1/B2/C1` (empty/invalid → **halt**); `zipf` and `zipf_rank` must be finite
numbers (non-numeric → **halt**). Never invent a carried value.

### 3.4 Scope filter (content POS only)
Keep items whose normalized POS ∈ `{noun, verb, adj, adv}`. Quarantine everything else (the
`modalv`/`auxiliaryv` rows — `need`, `ought`, `have`) into `_quarantine.json` with reason
`out-of-scope-pos`.

*Rationale:* Wikain is a **productive** vocabulary app targeting **upper-intermediate enrichment**
(PRD §1, §8). Modals/auxiliaries cannot host a meaningful self-reference production task and sit below
the frontier — the PH learner already produces them.

### 3.5 Dedup (key = `sense_id`)
The source occasionally lists the same `(lemma, pos)` at two CEFR levels (`race`, `ring`, `survive`).
Stage A keeps the **lower** CEFR (`A2 < B1 < B2 < C1`) and records the collision in the gate summary.
`zipf`/`zipf_rank` are identical across such a pair, so nothing else is lost. A residual duplicate
`sense_id` after dedup is an integrity **halt**.

**Stage A exit gate:** human reviews (a) the quarantine list, (b) total in-scope count, (c) a sample
of rows, (d) any halted-and-flagged POS. Only then start Stage B.

---

## 4. Output item schema (the runtime lexical item)

```jsonc
{
  // ---- CARRIED (facts from the source CSV — Stage A fills, Stage B MUST NOT touch) ----
  "word": "specialist",          // display form (CSV verbatim)
  "lemma": "specialist",         // §5.2.1 presence-gate key (lowercased word)
  "part_of_speech": "noun",      // item key with word; one item per (word,pos)
  "sense_id": "specialist_noun_01",
  "cefr": "B2",                  // ← from the CSV VERBATIM (A2–C1). NEVER invent.
  "zipf": 4.12,                  // ← from the CSV VERBATIM; SUBTLEX-scale, higher = more frequent
  "zipf_rank": 4200,             // ← from the CSV VERBATIM; dense rank, 1 = most frequent

  // ---- GENERATED by a frontier LLM (Stage B, manual) ----
  "intended_sense": "string",          // tight sense def; the judge's anchor (PRD §5.4)
  "recognition_meaning": "string",     // MCQ prompt gloss (meaning→word)
  "distractors": ["w1", "w2", "w3"],   // 3 wrong WORDS, same POS (PRD §4)
  "clozed_sentence": "string",         // one blank as "_"
  "productive_meaning": "string",      // cued prompt; DISTINCT phrasing from recognition_meaning
  "model_sentence": "string",          // non-self-referential exemplar of the sense
  "self_reference_prompt": "string",   // concise per-word personal nudge

  // ---- PROVENANCE ----
  "gen_model": "manual-frontier-llm",
  "gen_spec_version": "gen-spec v3"
}
```

> The carried-field values shown above are **illustrative placeholders**. The real values come from
> the CSV at Stage A. This discipline — carried facts filled once, never touched by generation — is
> the whole point of the carried/generated split.

---

## 5. Stage B — Generation rules (manual frontier LLM, per CEFR batch)

`build/generate.ts` reads each level's pending batch and writes a self-contained markdown prompt
(`_prompt_<cefr>.md`) carrying the batch's **carried fields** plus the authoring rules; the user pastes
it into a frontier-LLM free chat and gets back **only the generated fields** as `{"items":[…]}`, then
saves that to `_generated_batch_<cefr>.json`. The single source of truth for field content and quality
is **`docs/GENERATION_RULES.md`** — `generate` inlines it into the prompt (the model can't open a path).
`ingest` then merges generated + carried into the schema above. The field-by-field rules below still
describe the intent; every rule maps to a PRD section or research finding, and the code-enforced subset
is auto-asserted in §7.1.

**`intended_sense`** — One tight sentence naming the precise sense (POS-scoped). It
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

### 5.2 Batch generation prompt (assembled by `build/generate.ts` → `_prompt_<cefr>.md`)
The prompt is one markdown string (`buildPrompt`: the system section + a blank line + the user section).
The system section carries: the full text of `docs/GENERATION_RULES.md` (authoritative), the §5.1 gold
one-shot, the code-enforced HARD CONSTRAINTS (a restatement of §7.1 so the model passes on the first
try), and the output contract. The user section carries the batch's per-item carried context:

```
word, part_of_speech, cefr, zipf_rank   // difficulty register + frequency signal
```

Output contract: return `{"items": [ … ]}`, one element per input item, each with `sense_id` + the 7
generated keys (+ optional `_flags`). Generate ORIGINAL content, en-US. If a rule genuinely cannot be
satisfied for an item, set that field to null and add `"_flags": ["reason"]` — do NOT force it.

---

## 6. Output files, batching, resumability (raw JSON)

- **Manifests:** Stage A emits one manifest per CEFR level — `out/_manifest_{A2,B1,B2,C1}.json` — each
  sorted by `zipf_rank` ascending (most-frequent word first).
- **Commands:** `feed` (stage the next batch **per level** → `_pending_batch_<cefr>.json`) → `generate`
  (build one markdown prompt per level → `_prompt_<cefr>.md`; **no API**) → *paste each into a frontier
  LLM, save the result to `_generated_batch_<cefr>.json`* → `ingest` (validate + commit **all present
  levels** in one run). There is no automated loop — the user drives the manual generation.
- **Batch size:** `[DEFAULT]` 25 items/batch **per level** (4 × 25 = 100 per feed). Small enough to
  spot-check.
- **Per level:** `ingest` commits each level independently as `out/batch_{NNNN}.json` (a **JSON array**
  of fully-merged carried + generated items). A level with any hard-fail commits nothing (recorded to
  `_review.json`) and does not block the other levels.
- **Combiner:** `combine` concatenates all `batch_*.json` arrays into `out/items.json` (one array).
  Re-runnable; last-write-wins by `sense_id`.
- **Resumability:** maintain `out/_done.json` = list of completed `sense_id`s (shared across levels).
  `feed` skips anything already in `_done`. A crashed/partial run never regenerates or duplicates.
- **Provenance:** stamp `gen_model` (`manual-frontier-llm`) + `gen_spec_version` on every item (§4) so a
  model/spec change can invalidate stale content later (mirrors PRD §5.3 `model_version`).

---

## 7. Validation (Stage C) — auto-asserts + flagged human review

### 7.1 Auto-assert (deterministic; fail the batch on any miss)
- Item key `(word, part_of_speech, sense_id)` unique across the whole catalog.
- `lemma`, `word`, `part_of_speech`, `sense_id` non-empty; `cefr` ∈ {A2…C1};
  carried fields **unchanged** from the Stage-A manifest (`ingest` reloads carried from the manifest
  and rejects any carried key the generator echoes back — Stage B must not touch them).
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

> Keep these spot-checked items as the seed of the PRD §5.7 **~30-item gold set** for runtime
> judge-FNR monitoring. Build-time and runtime validation reuse the same labeled examples.

### 7.3 Flag-don't-fix
On any rule the model cannot satisfy (e.g. an adjective with no clean 3 same-POS distractors, or a
word whose only sense is below-frontier), the model sets the field `null` + `_flags`. Stage C
collects all `_flags` into `out/_review.json` for human resolution. **Never auto-fabricate** a
distractor or sense to clear a flag.

---

## 8. Hard "do nots" (recap — these protect data integrity)
1. **Never write or alter a carried field** (`cefr`, `part_of_speech`, `zipf`, `zipf_rank`,
   membership). Carried = source fact. (§0, §4)
2. **Never invent a carried value** — halt on an invalid CEFR/zipf rather than guessing. (§3.3)
3. **Never copy/paraphrase dictionary text** — generate original content. (PRD §4.1)
4. **Never one-shot the catalog** — batch + validate + gate. (§6, §0)
5. **Never let a distractor satisfy `recognition_meaning`.** (§5, §7)
6. **Never put `I`/`my` in `model_sentence`** or any target-word form in `self_reference_prompt`. (§5)
7. **Never silently bucket an unknown POS** — halt and flag. (§3.1)
8. **Stop and flag** any conflict between this spec and `PRD.md`. (§0)

---

## 9. Change log & run state

**v3 (CEFR-split manifests + manual frontier-LLM generation).** Stage A now emits **four CEFR-grouped
manifests** (`_manifest_{A2,B1,B2,C1}.json`), each sorted by `zipf_rank` ascending, instead of one
`_manifest.json`. Generation moved **off the DeepSeek API entirely**: `generate` writes a markdown prompt
per level (`_prompt_<cefr>.md`) that the user pastes into a frontier-LLM free chat and hand-authors the
result into `_generated_batch_<cefr>.json`; `ingest` commits all present levels in one run (each level
independently). Removed: `build/deepSeekClient.ts`, `build/tokenCost.ts`, `build/batchAll.ts`, the
`batch:all` script, and all token/cost accounting. Provenance stamp is now `manual-frontier-llm`.

**v2 (single CSV).** The input collapsed from three CSVs (NAWL + Oxford-3000/5000) to the one merged file
`data/merged_oxford_a2c1_zipf.csv`. Dropped with the old inputs: sense parentheticals, NAWL rank fan-out,
3000-vs-5000 collision handling, the function-word allowlist, and the `source`/`band`/`sense_hint`/
`list_rank` carried fields. Added: `zipf`/`zipf_rank`. The build was **reset to batch 0**.

**Stage A run:** **4,391** in-scope items (noun 2330 / verb 1018 / adj 836 / adv 207; by CEFR
A2 705 / B1 1059 / B2 1289 / C1 1338), **3** quarantined (`have`/auxiliaryv, `need`/`ought`/modalv),
and **3** CEFR collisions deduped to the lower level (`race`, `ring`, `survive`).

**Decisions (still in force):** scope = content POS `{noun, verb, adj, adv}`; batch size **25 per CEFR
level**; generation is manual (no API key, no cost accounting).