## 1. Intended sense (the judge's gate reference)

This is the load-bearing one. It's input to the LLM, never shown to the learner, and it decides `used_in_target_sense`.

- **Disambiguating, not defining.** Its job isn't to define the word in the abstract — it's to draw the boundary against the word's *other* common senses, so the judge can place the learner's usage on the right side of that line. A dictionary gloss that doesn't name what's excluded is too weak for a gate reference.
- **Calibrated to the lenient bias (§5.5), and this is the single most important property.** Because there's no recovery path, a too-*narrow* intended sense is far more dangerous than a too-broad one: it makes the judge reject legitimate adjacent uses → `Again` + demotion buried in short intervals → unrecoverable. So it should describe the sense *generously enough to admit the full legitimate range* of that sense while still excluding genuinely different senses. Write the boundary, then widen it deliberately.
- **Carries POS and typical frame**, since the gate checks sense *and* POS. A bare meaning gloss underspecifies it.
- **Flags dangerous polysemy at generation time.** Where a word has two high-frequency senses near the same CEFR band, that's precisely the §4.1/§5.7 `[VALIDATE]` trigger — either split the item by sense or write the intended sense to tolerate the second sense. A "good" intended sense for a polysemous word is one that *notices it's polysemous*. This is the one place your build-time generator should be conservative, because the runtime can't catch its mistakes.
- **Read the word *and* its CEFR together before fixing the sense.** The source is the Oxford 3000/5000, where the *same* lemma+POS can be listed at two levels for two different senses (e.g. `race`,noun A2 vs. B1; `survive`,verb B1 vs. B2). The carried CEFR is your disambiguator: it tells you *which* sense this item targets. Analyze the lemma, POS, and CEFR jointly and gloss the sense that belongs to *that* level (the everyday sense at the lower level, the more advanced/figurative sense at the higher) — don't default to the most common sense regardless of band.

## 2. MCQ distractors (Recognition, meaning→word)

- **POS- and band-homogeneous.** All four options should be the same part of speech and roughly the same CEFR/frequency band as the target. If three are obviously the wrong register or POS, the learner solves it by elimination — you've tested test-taking, not the form–meaning link. The research doc's own list of legitimate uses for frequency/embedding/CEFR data is exactly this: choosing "semantically/orthographically near words" as distractors.
- **Semantically near, but not sense-overlapping.** Distractors should be tempting near-neighbors (force real retrieval of the precise sense) but must *not* themselves be valid answers for the gloss. Because §4.1 keys each item to one dominant sense, a near-synonym that also fits the gloss makes the item invalid. The stakes here are lower than at the judge (recognition fails don't demote, §3.3, and carry low-value FSRS weight, §3.6) — but a too-easy or ambiguous MCQ does something specific and bad: it lets `Seen→Recognized` pass trivially and pushes a word into production it isn't ready for.
- **Include form-confusable options.** Since the MCQ confirms the *form*–meaning link, orthographic/phonological lookalikes (adverse/averse, principle/principal) are genuinely diagnostic — they catch a learner who has the meaning-region but the wrong form.
- **No surface cues.** No length tell, no clang association with the gloss keyword, no option that's the only one grammatically fitting the gloss frame. And per §4's instruction to vary gloss phrasing between MCQ and cued prompt, the distractor set shouldn't be defeatable by matching a single gloss keyword.

## 3. Recognition meaning (the MCQ gloss)

- **Selects exactly one of the four options.** Since the distractors are near-neighbor words, the gloss must point at the target *and exclude all three distractors*. If it's loose enough that a distractor also fits, the item is invalid — and you have no item analysis to catch it.
- **Glossed in higher-frequency vocabulary than the target.** A C1 word explained with C1+ words tests reading, not the form–meaning link.
- **No giveaway** — no shared root, no clang cue, no defining collocation only the target completes.
- **Faithful to the intended sense**, not some other sense of the word.

## 4. Typed cloze sentence (Cued recall of form)

This sits below cued and free on the scaffolding curve (§4) — its job is cued recall, graded deterministically by lemma match (§5.2.1, no judge).

- **Recoverable by meaning, not by frame.** The blank should be near-uniquely fixed by the *sense* the sentence conveys, while still requiring the learner to retrieve the *form*. The failure mode on each side: too little context and several words fit (guessing); a fixed collocation ("a ___ of water") and grammar/idiom fixes it reflexively (tests the frame, not the word).
- **Sense-fixing is its main job, and it's load-bearing because there's no judge here.** The deterministic grade only checks lemma presence. If the context admits a synonym, the learner can produce a correct-meaning, wrong-lemma answer and be failed with no rescue (and per §3.6 the word drops back to MCQ). So the sentence must make the target lemma the natural, near-unique fit for the intended sense.
- **Authentic context, ideally embedding a high-frequency collocation.** This matches the research's #2-ranked productive task and does double duty — retrieval plus chunk exposure (Lexical Approach; your §9 collocation enrichment).
- **Don't make it solvable by pure reading comprehension.** If understanding the sentence lets the learner *deduce* the word without retrieving it from memory, you've built a recognition task in a typing costume — the exact receptive/productive confusion §1 is fighting. The blank must require producing the form.
- **One content-word blank, mid-sentence** (sentence-initial leaks via capitalization), and **don't hinge on a hard-to-spell target** — the runtime tolerates only a single-edit typo (Damerau–Levenshtein ≤ 1) — otherwise real knowledge fails on a typo and pollutes an already low-value signal.
- **Constrain the frame so the target is the uniquely natural fill.** Force a strong collocational frame (e.g. "I **still** ___ my brother fifty dollars **from last week**" — "still owe … from" is strongly collocated; "still lend … from" is broken). **Self-verify before finalizing:** attempt to fill your own blank with 10–15 candidate words; if more than ~3 non-target words fit naturally, regenerate the sentence with a tighter frame. This shrinks the true fit-set *before* you enumerate it in §6 — enumeration then only has to be good over a bounded set, not over English.

## 5. Productive meaning (the cued prompt)

- **Phrased distinctly from the recognition gloss** — this is an explicit §4 requirement, not a nicety: passing both the MCQ and the cued prompt should prove a *form–meaning link*, not memorization of one string. If the two glosses are paraphrase-identical, `Recognized` certifies rote recall.
- **Specific enough to make the target near-unique.** Unlike cloze there's no sentence frame — just bare meaning — so the same synonym-admission failure from the cloze applies and is *worse here*: the deterministic lemma-match grade (no judge) fails a learner who produces a correct-meaning synonym, with no rescue. The cue must funnel to one lemma.

## 6. Cloze fit-set (`cloze_fit_set`) — enumerate, then classify (Cloze only)

Because the cloze tier is evaluated by a deterministic lookup (no LLM judge), the runtime can only be as fair as this list. You **enumerate** every word that plausibly fills the constrained blank of your §4 cloze sentence, then **classify** each against `intended_sense` using the two-gate classification rubric that accompanies these rules. A flat synonym list is explicitly rejected: it under-covers, and it conflates a same-meaning near-miss (*pay* for *owe* — deserves a "close, be more precise" nudge) with a fits-but-different-sense word (*lend* for *owe* — accepting it as "close" would teach the false equivalence the app exists to correct).

- **Three classes, exactly one `target`.** Every entry is `{ "lemma": …, "class": … }` with class ∈ `target` / `same_sense_near_miss` / `different_sense_fit`. The `target` entry is the item's own lemma — exactly one, always present. Entry lemmas are distinct root lemmas (*assess*, not *assessing*); the runtime NLP layer handles inflections.
- **Justify every classification in one line** (a `why` key per entry — required, but stripped before commit). The justification is what stops frame-co-occurrence words (*refund*, *remit* for *owe*) from being misfiled as sense matches: you cannot honestly justify "same participant roles" for *refund*/*owe*.
- **Uncertain? → `different_sense_fit`.** Its learner-facing copy ("means something different") is the safer message; the asymmetric harm is telling a learner two non-equivalent words are close — the rubric's uncertainty default.
- **Strictly substitutable in the cloze frame, or not in the set at all.** A word that fits only ungrammatically or under a different subcategorization frame (needs "___ **to** his brother"; wrong POS like *analysis* for *evaluate*) gets **no bucket** — leave it out entirely; the runtime's wrong path handles it.
- **The "Lower-Band Fallback" principle drives enumeration.** The words worth anticipating are the higher-frequency, lower-CEFR words learners fall back on when they cannot retrieve the target: for C1 *ascertain*, enumerate B1/B2 fallbacks like *determine*, *discover*, *find out* — then classify each honestly.
- **Tagalog-L1 translation equivalents.** The app targets a Filipino demographic: include English words sharing a direct, common Tagalog translation with the target (target *fabricate* (a story) → L1 *gawa*/*imbento* → enumerate *make*, *create*, *invent*), then classify them — most are `same_sense_near_miss`, but check gate 1 first.
- **No `same_sense_near_miss` may appear in `distractors`.** If the MCQ taught "not this word for this meaning," a later "close!" for the same word contradicts the pedagogy — this is code-enforced (a hard fail). A `different_sense_fit` *may* coincide with a distractor: "means something different here" is consistent with the MCQ's lesson.
- **Curated, not a thesaurus dump — but err on the side of enumerating.** Archaic/ultra-rare synonyms are wasted payload; the bounded set your §4 constrained frame admits is the real budget. Completeness is *not* required (the offline heal queue closes gaps permanently at the next build), but every word you do list must be classified correctly — a misclassification mis-lanes every learner deterministically until a data fix.

## 6.1 Bounce gloss (`bounce_gloss`)

Shown only inside the different-sense soft bounce: "That's a real sentence — but *{typed word}* means something different here. This word means **{bounce_gloss}**…" — displayed while the learner must **still produce the target**, so it is a cue, not a reveal.

- **A short paraphrase variant of `productive_meaning`** — same sense, different wording. It must not be string-identical to either gloss (a verbatim repeat of the cued gloss would hand the learner that tier's exact cue; identical to the MCQ gloss certifies rote recall).
- **Zero target-form leakage** — no token whose lemma equals the target lemma (same code-enforced rule as `self_reference_prompt`).
- **Terse.** It sits inline in a one-line bounce callout, not a definition panel — aim well under the length of `intended_sense`.

## 6.2 Cued valid synonyms (`cued_valid_synonyms`) — the cued soft-bounce set (Cued only)

The cued tier withholds the target and asks the learner to **produce** it from the productive gloss, graded by a deterministic lemma-match (no judge). A learner who produces a correct-meaning **synonym** has demonstrated the productive skill but not retrieved *this* item — so instead of a harsh `Again`, they get a soft "that's a synonym; we're building one specific word" nudge (spec/15 `CUE-1`/`CUE-6`). This field is the set that triggers that lane.

- **Enumerate against the GLOSS, not the cloze frame.** This is cued's **own** set — do **not** copy `cloze_fit_set`. The cloze fit-set entries were chosen for a specific sentence; cued has no sentence, only the meaning. Ask: "what other words could a learner produce for *this exact sense* and be counted meaning-correct?" (`CUE-2`).
- **Same-sense only — a flat list of root lemmas.** Every entry must pass gate 1 of the classification rubric for the **intended sense**: a genuine same-meaning synonym (the cloze `same_sense_near_miss` bar). There is **no** `different_sense_fit` analogue — at cued, a different-sense word is a wrong retrieval, not a near-miss (`CUE-4`). Lemmas distinct; the runtime handles inflections.
- **Never the target lemma; never a distractor.** The target is the pass, not a synonym; and a word the MCQ taught as wrong (`distractors`) cannot be waved through here (both are hard fails — `CUE-4`).
- **`[]` when there is no good same-sense synonym.** Do not pad with loose or different-sense words — an over-broad set teaches false equivalence and fails learners into soft bounces they should have passed.
- **Same enumeration instincts as §6** — Lower-Band Fallback and Tagalog-L1 equivalents are exactly the words a learner reaches for when they cannot retrieve the target, and are the highest-value same-sense entries. Curate, don't thesaurus-dump; completeness is not required (gaps are backfilled at the next build).

## 7. Self-referential prompt (Free production)

- **Demand episodic retrieval, not a pronoun.** "Write about a time you *negotiated* something" beats "use *negotiate* in a sentence about yourself." The boost is in the elaboration, not the first person.
- **Set a situation, not a slot.** If the prompt constrains the sentence tightly it collapses into a cloze and you lose the output and the ILH "evaluation" component — which the research flags as the single highest-weight driver of retention. The learner deciding *how* to fit the word into self-generated context is the lesson.
- **Anchor the sense without doing the semantic work** — the hardest tension, and worse in v4. You're single-sense (§4.1) with no override (Risks #5), so a valid-but-off-sense sentence is wrongly failed *and unrecoverable*. The prompt should bias toward the dominant sense's typical context — but if it over-specifies (hands the learner the collocation), it defeats the involvement load. Nudge via situation; don't supply the partner words.
- **Be attemptable when stuck** (Krashen's affective-filter caveat, §3.4 scaffolding, §4 fallback). Concrete footing ("something you did last weekend") gives a starting point; abstract framing ("use it meaningfully") strands the learner.
- **Know when self-reference doesn't fit the word.** Your target zone is formal/academic vocab (§1). Words like *notwithstanding* or *ascertain* don't lend themselves to autobiography; forcing self-reference produces stilted sentences. A good prompt system detects this and offers a professional-context or "any sentence" alternative rather than insisting.
- **Rotate the angle across reviews** so the learner can't replay one memorized sentence (§5.2.2 verbatim bounce; §3.6 no retry-until-pass). Fresh production every spaced rep is precisely the spaced-*production* loop that is your §9 differentiator.

## 8. Model sentence

- **Demonstrate the intended sense clearly and naturally**, with register matched to the single clean-English mode (§5.7), ideally embedding a high-frequency collocation so it does double duty as chunk exposure (§9).
- **But make it structurally hard to parrot.** Because the free-production prompt is self-referential ("write a sentence using *{word}* — something true about you"), the model sentence should **not** be a first-person "I ___" frame — that directly seeds a one-swap near-copy. Prefer a third-person or specific-scenario sentence: it anchors the sense for the judge without handing the learner a fill-in-the-blank template for their own "I" sentence.
- **Consistent with the intended sense** — same sense, same POS. This is the consistency check that makes the intended-sense-first generation order pay off.
