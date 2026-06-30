## 1. MCQ distractors (Recognition, meaning→word)

- **POS- and band-homogeneous.** All four options should be the same part of speech and roughly the same CEFR/frequency band as the target. If three are obviously the wrong register or POS, the learner solves it by elimination — you've tested test-taking, not the form–meaning link. The research doc's own list of legitimate uses for frequency/embedding/CEFR data is exactly this: choosing "semantically/orthographically near words" as distractors.
- **Semantically near, but not sense-overlapping.** Distractors should be tempting near-neighbors (force real retrieval of the precise sense) but must *not* themselves be valid answers for the gloss. Because §4.1 keys each item to one dominant sense, a near-synonym that also fits the gloss makes the item invalid. The stakes here are lower than at the judge (recognition fails don't demote, §3.3, and carry low-value FSRS weight, §3.6) — but a too-easy or ambiguous MCQ does something specific and bad: it lets `Seen→Recognized` pass trivially and pushes a word into production it isn't ready for.
- **Include form-confusable options.** Since the MCQ confirms the *form*–meaning link, orthographic/phonological lookalikes (adverse/averse, principle/principal) are genuinely diagnostic — they catch a learner who has the meaning-region but the wrong form.
- **No surface cues.** No length tell, no clang association with the gloss keyword, no option that's the only one grammatically fitting the gloss frame. And per §4's instruction to vary gloss phrasing between MCQ and cued prompt, the distractor set shouldn't be defeatable by matching a single gloss keyword.

## 2. Self-referential prompt (Free production)

- **Demand episodic retrieval, not a pronoun.** "Write about a time you *negotiated* something" beats "use *negotiate* in a sentence about yourself." The boost is in the elaboration, not the first person.
- **Set a situation, not a slot.** If the prompt constrains the sentence tightly it collapses into a cloze and you lose the output and the ILH "evaluation" component — which the research flags as the single highest-weight driver of retention. The learner deciding *how* to fit the word into self-generated context is the lesson.
- **Anchor the sense without doing the semantic work** — the hardest tension, and worse in v4. You're single-sense (§4.1) with no override (Risks #5), so a valid-but-off-sense sentence is wrongly failed *and unrecoverable*. The prompt should bias toward the dominant sense's typical context — but if it over-specifies (hands the learner the collocation), it defeats the involvement load. Nudge via situation; don't supply the partner words.
- **Be attemptable when stuck** (Krashen's affective-filter caveat, §3.4 scaffolding, §4 fallback). Concrete footing ("something you did last weekend") gives a starting point; abstract framing ("use it meaningfully") strands the learner.
- **Know when self-reference doesn't fit the word.** Your target zone is formal/academic vocab (§1). Words like *notwithstanding* or *ascertain* don't lend themselves to autobiography; forcing self-reference produces stilted sentences. A good prompt system detects this and offers a professional-context or "any sentence" alternative rather than insisting.
- **Rotate the angle across reviews** so the learner can't replay one memorized sentence (§5.2.2 verbatim bounce; §3.6 no retry-until-pass). Fresh production every spaced rep is precisely the spaced-*production* loop that is your §9 differentiator.

## 3. Typed cloze sentence (Cued recall of form)

This sits below cued and free on the scaffolding curve (§4) — its job is cued recall, graded deterministically by lemma match (§5.2.1, no judge).

- **Recoverable by meaning, not by frame.** The blank should be near-uniquely fixed by the *sense* the sentence conveys, while still requiring the learner to retrieve the *form*. The failure mode on each side: too little context and several words fit (guessing); a fixed collocation ("a ___ of water") and grammar/idiom fixes it reflexively (tests the frame, not the word).
- **Sense-fixing is its main job, and it's load-bearing because there's no judge here.** The deterministic grade only checks lemma presence. If the context admits a synonym, the learner can produce a correct-meaning, wrong-lemma answer and be failed with no rescue (and per §3.6 the word drops back to MCQ). So the sentence must make the target lemma the natural, near-unique fit for the intended sense.
- **Authentic context, ideally embedding a high-frequency collocation.** This matches the research's #2-ranked productive task and does double duty — retrieval plus chunk exposure (Lexical Approach; your §9 collocation enrichment).
- **Don't make it solvable by pure reading comprehension.** If understanding the sentence lets the learner *deduce* the word without retrieving it from memory, you've built a recognition task in a typing costume — the exact receptive/productive confusion §1 is fighting. The blank must require producing the form.
- **One content-word blank, mid-sentence** (sentence-initial leaks via capitalization), and **don't hinge on a hard-to-spell target** while v1 spelling is strict (Damerau–Levenshtein tolerance is [v2], §3.6) — otherwise real knowledge fails on a typo and pollutes an already low-value signal.

## 4. Intended sense (the judge's gate reference)

This is the load-bearing one. It's input to the LLM, never shown to the learner, and it decides `used_in_target_sense`.

- **Disambiguating, not defining.** Its job isn't to define the word in the abstract — it's to draw the boundary against the word's *other* common senses, so the judge can place the learner's usage on the right side of that line. A dictionary gloss that doesn't name what's excluded is too weak for a gate reference.
- **Calibrated to the lenient bias (§5.5), and this is the single most important property.** Because there's no recovery path, a too-*narrow* intended sense is far more dangerous than a too-broad one: it makes the judge reject legitimate adjacent uses → `Again` + demotion buried in short intervals → unrecoverable. So it should describe the sense *generously enough to admit the full legitimate range* of that sense while still excluding genuinely different senses. Write the boundary, then widen it deliberately.
- **Carries POS and typical frame**, since the gate checks sense *and* POS. A bare meaning gloss underspecifies it.
- **Flags dangerous polysemy at generation time.** Where a word has two high-frequency senses near the same CEFR band, that's precisely the §4.1/§5.7 `[VALIDATE]` trigger — either split the item by sense or write the intended sense to tolerate the second sense. A "good" intended sense for a polysemous word is one that *notices it's polysemous*. This is the one place your build-time generator should be conservative, because the runtime can't catch its mistakes.

## 5. Recognition meaning (the MCQ gloss)

- **Selects exactly one of the four options.** Since the distractors are near-neighbor words, the gloss must point at the target *and exclude all three distractors*. If it's loose enough that a distractor also fits, the item is invalid — and you have no item analysis to catch it.
- **Glossed in higher-frequency vocabulary than the target.** A C1 word explained with C1+ words tests reading, not the form–meaning link.
- **No giveaway** — no shared root, no clang cue, no defining collocation only the target completes.
- **Faithful to the intended sense**, not some other sense of the word.

## 6. Productive meaning (the cued prompt)

- **Phrased distinctly from the recognition gloss** — this is an explicit §4 requirement, not a nicety: passing both the MCQ and the cued prompt should prove a *form–meaning link*, not memorization of one string. If the two glosses are paraphrase-identical, `Recognized` certifies rote recall.
- **Specific enough to make the target near-unique.** Unlike cloze there's no sentence frame — just bare meaning — so the same synonym-admission failure from the cloze applies and is *worse here*: the deterministic lemma-match grade (no judge) fails a learner who produces a correct-meaning synonym, with no rescue. The cue must funnel to one lemma.

## 7. Model sentence

- **Demonstrate the intended sense clearly and naturally**, with register matched to the single clean-English mode (§5.7), ideally embedding a high-frequency collocation so it does double duty as chunk exposure (§9).
- **But make it structurally hard to parrot.** Because the free-production prompt is self-referential ("write a sentence using *{word}* — something true about you"), the model sentence should **not** be a first-person "I ___" frame — that directly seeds a one-swap near-copy. Prefer a third-person or specific-scenario sentence: it anchors the sense for the judge without handing the learner a fill-in-the-blank template for their own "I" sentence.
- **Consistent with the intended sense** — same sense, same POS. This is the consistency check that makes the intended-sense-first generation order pay off.
