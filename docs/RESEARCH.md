# Building an App for ACTIVE Vocabulary: An Evidence-Grounded Design Review

## TL;DR
- **Your core learning loop is built backwards.** The definition→word "guess the word" task is a *recognition/receptive* exercise, and the SLA evidence (Nation; Laufer & Hulstijn; Barcroft; Webb) is unambiguous that recognition practice mainly builds *recognition* knowledge — retrieval is direction-specific. The sentence-writing step you treat as an afterthought is the single most evidence-backed productive-vocabulary activity in the entire literature. Flip the priority: **the sentence is the lesson, not the reward.**
- **Keep spaced repetition, drop the embedding-based difficulty engine, and reframe what gets scheduled.** Use FSRS-6 (MIT-licensed, `py-fsrs`/`ts-fsrs`); in the open-spaced-repetition benchmark it has lower log loss than SM-2 in 99.6% of collections, and simulations imply learners need 20-30% fewer reviews for the same retention. It empirically tracks per-user, per-item difficulty, making your planned "embeddings or some algorithm" difficulty estimator redundant. Schedule *production* cards (meaning→produce), not recognition cards.
- **Minimize LLM cost with a staged pipeline, not a model choice.** ~80% of sentence-checking ("did they use the word? is it grammatical?") can be done for free with deterministic rules + LanguageTool + spaCy. Reserve a cheap LLM (Gemini 2.5 Flash-Lite at $0.10/$0.40 per million tokens) for the one thing rules can't do: semantic/collocational appropriateness — and cache aggressively. Your differentiator (no surveyed competitor evaluates user-written sentences) is real and worth building around.

## Key Findings

1. **Receptive ≠ productive, and the gap is large and direction-specific.** Nation's framework decomposes word knowledge into form, meaning, and use, each with a receptive and a productive side (18 sub-components). Productive vocabulary is consistently smaller than receptive, and the gap *widens* as words get less frequent and as proficiency rises. Practising recognition does not reliably transfer to production.

2. **Output and "pushed output" are the mechanism, not a nicety.** Swain's Output Hypothesis holds that producing language forces syntactic processing, surfaces gaps, and tests hypotheses in ways comprehension never does. Sentence production is exactly this.

3. **The Involvement Load Hypothesis directly ranks your candidate tasks.** Hulstijn & Laufer (2001) found, verbatim, that "amount of retention was related to amount of task-induced involvement load: Retention was highest in the composition task, lower in reading plus fill-in, and lowest in the reading." Your sentence step is the highest-involvement task available; your definition→word step is among the lowest.

4. **Retrieval practice works, and production-direction retrieval builds production.** Karpicke & Roediger (2008, *Science* 319:966-968) found "repeated studying after learning had no effect on delayed recall, but repeated testing produced a large positive effect." Nakata, Webb, and Barcroft show retrieval is *direction-specific*: productive retrieval builds productive knowledge; receptive retrieval builds receptive.

5. **Words live in chunks.** Lewis's Lexical Approach, Pawley & Syder, and Wray show that fluent production is largely formulaic — collocations and chunks. Teaching isolated single words underprepares learners for production.

6. **Self-referential sentences boost retention.** A 2025 study (*Psychonomic Bulletin & Review*) found self-reference encoding beat both translation-repetition and semantic-processing controls for L2 vocabulary, immediately and after a week.

7. **Frequency and coverage give you a principled syllabus.** The 95%/98% coverage thresholds (Hu & Nation; Laufer & Ravenhorst-Kalovski) plus free CEFR-tagged lists (NGSL, Oxford 3000/5000) tell you which words to teach in what order.

8. **FSRS is the clear SRS pick; embeddings for difficulty are over-engineering.** FSRS-6 models difficulty/stability/retrievability per card from review history — empirically superior to a-priori estimates.

9. **No surveyed competitor evaluates user-written sentences.** Across Anki, Quizlet, Memrise, Drops, WordUp, Vocabulary.com, Duolingo, Babbel, Lingvist, Clozemaster, and LingQ/Readlang, the "active" ones stop at single-word cued recall. This is a genuine open niche.

## Details

### PART 1 — METHODOLOGY (the part that should reshape your design)

#### A. Receptive vs. productive vocabulary

Paul Nation's "What is involved in knowing a word" framework (Nation, 2001/2013) is the standard reference. Knowing a word spans three domains — **form** (spoken, written, word parts), **meaning** (form–meaning link, concept/referents, associations), and **use** (grammatical functions, collocations, constraints on use such as register/frequency) — and *each* is split into a **receptive** and a **productive** dimension, giving 18 kinds of lexical knowledge. Receptive knowledge is recognizing form and retrieving meaning while reading/listening; productive knowledge is retrieving and producing the form when speaking/writing.

Empirically, **productive vocabulary is always smaller than receptive**, and the gap widens as word frequency drops (Laufer & Nation, 1999; Hajiyeva/CCSE; the readingmatrix studies). One Turkish-EFL study measured the productive-to-receptive ratio at roughly 47-49% at A1/A2 and ~62% at B1 — i.e., even at B1 learners can produce only about three-fifths of what they can recognize. The crucial design implication: **receptive knowledge does not automatically convert to productive knowledge** — the conversion has to be trained directly, by practising production.

#### B. What actually builds productive vocabulary

- **Swain's Output Hypothesis (1985, 1993, 1995):** producing language pushes *syntactic* processing (vs. the semantic shortcuts comprehension allows), triggers *noticing* of gaps, allows *hypothesis testing*, and develops fluency. Krashen's critique (output is rare; pushing learners can raise the affective filter) is worth noting but doesn't undermine the case for a low-stakes, supported writing task.
- **Involvement Load Hypothesis (Hulstijn & Laufer, 2001, *Language Learning* 51:539-558):** retention depends on task-induced involvement = **need + search + evaluation**. In their two-country experiment, retention was highest in composition-writing with target words, lower in reading-plus-fill-in, lowest in reading comprehension. "Evaluation" is strongest when the learner must decide how to combine a word into a self-generated context — i.e., writing a sentence. A 2022 systematic review (PMC) found the evaluation component carried the most weight across studies. This is the strongest single piece of evidence that your sentence step should be the centre of the app.
- **Retrieval practice / testing effect:** Karpicke & Roediger (2008, *Science*) — repeated *retrieval* produced large gains; repeated *restudy* after first success produced none. Short-answer (production) testing tends to beat multiple-choice (recognition) for durable, higher-order retention (Greving & Richter, 2018).
- **Direction-specific retrieval:** Studies by Barcroft (2007), Nakata, and Webb show receptive retrieval builds receptive knowledge and **productive retrieval (recall the form) builds productive knowledge**. Receptive scores are always higher; "forward" (productive) learning is slower but is what you want if production is the goal. **This is the empirical heart of your redesign: to build active vocabulary you must practise in the productive direction (meaning → produce the word/sentence), not word→meaning.**
- **Generation effect & depth of processing:** Craik & Lockhart (1972) — deeper, more elaborate processing yields better retention; ILH is explicitly built on this. Generating a sentence is deep processing.
- **Chunks/collocations:** Lewis's Lexical Approach (1993), Pawley & Syder (1983, "nativelike selection"), Wray (2002). Up to ~50% of native production is formulaic. Single-word drilling underprepares learners for natural production — so capturing/teaching collocations matters.
- **Self-reference effect:** Rogers, Kuiper & Kirker (1977); meta-analysis Symons & Johnson (1997); and a 2025 *Psychonomic Bulletin & Review* study ("Self-reference promotes vocabulary learning in a foreign language") that used an **oral L2 sentence-generation task** and found self-referential sentences beat both translation-repetition and semantic-processing controls, immediately and at one week. Prompting learners to write sentences *about themselves* is a free retention multiplier.
- **Incidental vs. intentional:** Webb et al.'s meta-analyses show intentional learning yields far higher gains (≈39.4% mean meaning-recall retention vs. <20% for incidental reading). A vocabulary app is and should be an *intentional* learning tool.
- **Frequency and coverage:** 95% coverage ≈ minimal comprehension (~4,000-5,000 word families); 98% ≈ optimal (~6,000-8,000, up to 8,000-9,000 for written text) — Hu & Nation (2000); Laufer & Ravenhorst-Kalovski (2010); Schmitt et al. (2011). Teach high-frequency words the learner doesn't yet know, in frequency order. Free lists: **NGSL** (Browne, Culligan & Phillips, March 2013; updated 2016 & 2023 to v1.2 ≈ 2,809 words; built on a 273-million-word subset of the Cambridge English Corpus; "provides over 92% coverage for most general English texts," CC BY-SA 4.0, ~97% CEFR-aligned), **AWL/NAWL**, and **Oxford 3000/5000** (CEFR-tagged, free PDFs, developed with James Milton and reviewed by Paul Nation).

#### C. Spaced repetition for productive vocabulary

SRS as usually implemented (recognition cards) mostly builds recognition. The fix is not to abandon SRS but to **change the card**: schedule *production* cards (cue = meaning/context → response = produce the target word and/or write a sentence) and context/cloze cards rather than word→meaning recognition cards. SRS still empirically tracks per-item difficulty, which is why you don't need a separate difficulty model.

#### D. Card formats, ranked by productive value
1. **Self-referential sentence production** (write a sentence using the word, ideally about yourself) — highest involvement load + output + self-reference + generation.
2. **Cloze in authentic context, typed (not MCQ)** — forced retrieval in context; what Clozemaster does, but still single-word.
3. **Meaning/L1 → produce the target word** (productive retrieval direction).
4. **Recognition (word→meaning, MCQ, definition→word)** — useful only for cheap initial familiarization and cold-start calibration, not as the main event.

### PART 2 — TECHNICAL / ALGORITHMIC DESIGN

#### A. Spaced repetition algorithm — use FSRS-6

- **SM-2** (1987, SuperMemo/old Anki): one ease factor per card; rigid; suffers "ease hell."
- **FSRS** (Jarrett Ye / open-spaced-repetition community, developed since 2022): models Difficulty, Stability, Retrievability per card; default weights (FSRS-6 has 21 parameters) trained on ~700M reviews. In the open-spaced-repetition benchmark (9,999 Anki collections, ~350M filtered reviews) **FSRS-6 has a lower log loss than SM-2 in 99.6% of collections**, and simulations imply **20-30% fewer reviews** for the same retention rate. **Anki adopted FSRS as the default in version 23.10 (November 2023).** Lets you target a retention rate (e.g., 90%).
- **Half-life regression** (Settles & Meeder, Duolingo, ACL 2016): elegant trainable model, MIT-licensed code, reduced error 45%+ vs. baselines on Duolingo data and lifted daily activity ~12% in production — but needs large data to shine and has weak standalone predictive power in independent reanalysis; not worth training yourself early.
- **Leitner:** trivial but crude.
- **Recommendation:** **FSRS-6** via the official MIT-licensed libraries — `pip install fsrs` (**py-fsrs**, Python ≥3.10, FSRS-6, pure Python, no torch; authored by Jarrett Ye, maintained by open-spaced-repetition) for a Python backend, or `npm install ts-fsrs` (**ts-fsrs**, TypeScript, MIT, FSRS-6) for JS/TS. Use default parameters initially; optimize per-user later (with `fsrs-optimizer`, or `fsrs-rs-python` to avoid installing torch) once a user has ~1,000+ reviews — below that, defaults already beat SM-2. Note: the heavyweight Rust optimizer engine `fsrs-rs` is BSD-3-Clause; **py-fsrs and ts-fsrs are confirmed MIT** and safe for commercial use.

#### B. Word difficulty / user-knowledge modeling

Your instinct that embeddings might be over-engineering is **correct**. FSRS already estimates per-user, per-item difficulty *empirically* from responses — strictly better than guessing difficulty a-priori from embeddings. Where frequency/embeddings/CEFR data *do* add value:
- **Cold-start seeding** of initial difficulty from CEFR level + word frequency band.
- **Choosing distractors** for any MCQ (semantically/orthographically near words).
- **Generating letter clues** (deterministic, no embeddings needed).
- **Interleaving / finding related words** and surfacing collocations.

Free resources: **COCA** frequency data, **SUBTLEX**, **Google Books n-grams**, **NGSL** (open-source, with frequency), **Oxford 3000/5000** (CEFR), **English Vocabulary Profile** (CEFR-tagged). **IRT** is overkill for a solo dev — FSRS subsumes the need.

#### C. LLM cost minimization

Cheapest current options (per million tokens, input/output; late-2025/early-2026 snapshots):
- **Gemini 2.5 Flash-Lite**: **$0.10 / $0.40** (released July 22, 2025; 1M-token context; cheapest in Google's lineup) — your best default.
- **Gemini 2.5 Flash**: **$0.30 / $2.50** (released June 17, 2025).
- **GPT-4o-mini / GPT-5 nano class**: ~$0.05-0.15 input.
- **Claude Haiku class**: ~$0.25 / $1.25.
- **DeepSeek / open-weight (Llama, Qwen, Phi via Groq/Together, or local Ollama)**: cheapest or free if self-hosted.

Cost strategies:
- **Staged pipeline (most important):** do the cheap, deterministic checks first and only escalate to the LLM for genuine semantic judgment.
- **Rule-based free checks:** Does the target word (or an inflected form) appear? — free string/lemma match via spaCy. Is it grammatical? — **LanguageTool** (LGPL, free, self-hostable; `language_tool_python` wrapper) catches agreement, article, and many usage errors. POS/dependency sanity — **spaCy** (free). These cost nothing per call.
- **Caching:** exact-match cache on identical sentences; semantic cache for near-duplicates. Cache the rubric/system prompt via provider prompt-caching (Gemini context caching, cache reads ~0.1x base).
- **Batch** non-interactive evaluations (50% discounts on OpenAI/Anthropic batch APIs).
- **When NOT to use an LLM:** word-presence, spelling, basic grammar — all rule-based and free.

#### D. Evaluating "did they use the word meaningfully and correctly"

"Correct use" operationally = (1) **target word present** (incl. correct inflection), (2) **grammatical**, (3) **collocationally/semantically appropriate** (the word fits the meaning and typical partners), (4) **register** reasonable. Layers 1-2 are free (spaCy + LanguageTool); layers 3-4 need an LLM.

Staged pipeline:
1. **Rule layer (free):** word present? grammatical (LanguageTool)? If word absent → reject immediately, no LLM call.
2. **LLM layer (cheap, only if rule layer passes):** Gemini Flash-Lite with a tight rubric returning structured JSON: `{used_correctly, meaning_match, collocation_natural, brief_feedback, corrected_sentence}`.

Sample rubric prompt: *"You are an ESL writing tutor. The learner is practising the word '{word}' (meaning: '{gloss}'). Their sentence: '{sentence}'. Judge ONLY: (a) is '{word}' used with this meaning, (b) is it grammatically correct, (c) does it sound natural (collocations). Be encouraging but honest. Return JSON: used_correctly, meaning_match, collocation_natural, one_sentence_feedback, corrected_version. Do not be lenient about wrong meanings; do not penalize stylistic choices."*

**Calibration:** LLMs drift lenient or strict. Pin behaviour with 2-3 few-shot examples (one good, one wrong-meaning, one ungrammatical), force structured output, and spot-check a sample against your own judgments. Keep a small gold-standard set of ~30 hand-labelled sentences to detect drift when you change prompts/models.

#### E. CEFR placement on signup

Asking CEFR self-report (your current plan) is the weakest option — LexTALE research (Lemhöfer & Broersma, 2012) shows objective tests beat self-ratings. Best feasible option: a **LexTALE-style yes/no vocabulary test**: ~3-5 minutes, 60 items including nonwords to detect yes-bias, validated against vocabulary size and general proficiency, free. Far better validated than self-report and far cheaper to build than adaptive IRT testing. Nation's Vocabulary Size Test is an alternative but longer (20-40 min). **Recommendation: keep an optional CEFR self-report for instant onboarding, but encourage a 3-minute LexTALE-style yes/no test to actually seed level.**

#### F. Cold start

Seed initial FSRS difficulty and word selection from (CEFR level from the yes/no test) × (frequency band from NGSL/Oxford lists). Start the learner on the highest-frequency words just above their known level (the "95% coverage frontier"). This gives a principled first deck without any embeddings.

### PART 3 — COMPETITIVE SCAN

| App | Method | Productive or passive? | Grades user-written sentences? |
|---|---|---|---|
| **Anki** | Two-sided flashcards + SRS (FSRS-capable) | Either, but defaults lean recognition; only exact-match type-in | No |
| **Quizlet** | Flashcards + Write/Match/Learn/Test (MCQ) | Mostly recognition; "Write" = exact spelling of target | No |
| **Memrise** | Flashcards + mnemonics + native video; MemBot AI chat | Mostly recognition/cued recall | Only via MemBot AI chat add-on, not core |
| **Drops** | Word↔image swipe games | Recognition only — no typing, no writing | No |
| **WordUp** | AI-ranked words, media examples, SRS | Claims "active" but core is recognition + recall | No (separate newer "Zann" writing app exists) |
| **Vocabulary.com** | Adaptive MCQ VocabTrainer | Recognition/MCQ recall | No |
| **Duolingo** | Gamified translation, MCQ, word-bank tiles, flashcards | Mix; weak on production (word banks reduce true output) | No |
| **Babbel** | Dialogue lessons, fill-in-blank, speech | Recognition + cued recall + guided speaking | No |
| **Lingvist** | AI-adaptive cloze flashcards, type the word (ACT-R model) | Word-level active recall; "not active output" | No |
| **Clozemaster** | Cloze on real sentences, MCQ or type the word | Both modes; closest to production but single-word | No |
| **LingQ / Readlang** | Reading-based comprehensible input + SRS | Recognition/passive input | No (production offloaded to external tutors) |

**The gap:** None of the eleven asks the learner to *compose an original sentence with a target word and get automated feedback on it.* The "active" apps stop at single-word cued recall, and Clozemaster's own blog concedes that cloze and flashcards are "primarily recognition practice." Your sentence-evaluation loop — tied to an FSRS schedule — is a genuinely differentiated, pedagogically defensible product: it operationalizes Swain's output + ILH evaluation + the self-reference effect, which none of these tools do in their core loop. (The only adjacent threats are bolt-on AI conversation features — Memrise's MemBot, WordUp's newer "Zann" writing app — that are not tied to a spaced vocabulary schedule.)

## Recommendations

**Stage 1 — Restructure the core loop (do this first).** Make the **productive sentence the lesson, not the reward.** The loop should be:
1. Present the word in a meaning-first, production-oriented prompt (target word + short gloss + one model sentence/collocation).
2. **Primary task:** "Write a sentence using *{word}* — ideally something true about you." (output + ILH evaluation + self-reference).
3. Staged evaluation: free rule checks → cheap LLM only if needed → return encouraging, specific feedback + a corrected version.
4. Optionally, a productive-direction retrieval check (meaning/context → produce the word) and/or typed cloze for words not yet ready for free production.
5. FSRS schedules the next review of that word's production card.

Demote definition→word guessing to an *optional* low-stakes warm-up/recognition check for brand-new or cold-start words. Drop the elaborate letter-clue system as a primary mechanic — it's a patch for an ill-posed task you no longer need at the centre. (Keep a simple "reveal" + first-letter hint for when a learner is stuck.)

**Stage 2 — Tech stack for a solo dev minimizing LLM cost.**
- SRS: **FSRS-6** (`py-fsrs` or `ts-fsrs`, MIT), default params, optimize per-user after ~1,000 reviews.
- Word data: **NGSL** + **Oxford 3000/5000** (CEFR) + frequency bands; seed cold-start from these.
- Placement: 3-minute **LexTALE-style yes/no test** (+ optional self-report).
- Evaluation pipeline: **spaCy** (lemma/POS, free) → **LanguageTool** (self-hosted, free) → **Gemini 2.5 Flash-Lite** ($0.10/$0.40) only for semantics, with prompt caching + exact/semantic response caching + few-shot calibration + structured JSON output.
- Track a small gold-standard labelled set to monitor LLM calibration drift.

**Stage 3 — Differentiate and deepen.** Lean into collocations/chunks (Lexical Approach): when you teach a word, teach 1-2 high-frequency collocations and accept/encourage them in produced sentences. Surface a learner's own past correct sentences on review (spaced production). Make the real progress metric "words you've successfully *produced* N times" (productive mastery), not just "words reviewed."

**Benchmarks that would change the plan:**
- If LLM cost per active user exceeds your budget, push *more* of the evaluation to rules and only call the LLM on sentences that pass the rule layer but look semantically risky (e.g., a rare collocation), or batch overnight.
- If users churn on the writing task (too effortful — Krashen's affective-filter critique), add scaffolding (sentence starters, model sentences, accept short phrases) rather than reverting to recognition.
- If FSRS per-user optimization shows no measurable benefit at your data scale, stay on default weights.

## Caveats
- Much of the productive-vocabulary evidence comes from **L2/EFL** classroom and lab studies (often intermediate learners); transfer to L1 enrichment and to a self-directed app context is reasonable but not directly tested. Effect sizes vary across studies.
- The ILH "evaluation" component is the best-supported, but a 2022 systematic review notes the three components likely carry *different* weights and that the hypothesis's predictive power is **not perfectly consistent** across all studies — treat "writing > gap-fill > reading" as a robust ordinal finding, not a precise formula.
- LLM **pricing and model names change fast**; the figures here are late-2025/early-2026 snapshots from official Google pricing plus third-party trackers (pricepertoken.com, intuitionlabs, tldl.io) and should be re-checked against official provider pricing pages before you commit.
- Vendor marketing claims in the competitive scan ("active mastery," retention-percentage claims) are *claims*, not verified outcomes; some product-method details came via a secondary scan and should be re-verified against current official product docs before public comparison.
- The 2025 self-reference study used **oral** sentence generation; the benefit should extend to written sentences but that specific modality wasn't the tested condition.
- FSRS personalization needs a meaningful review history (~1,000 reviews) before per-user weights beat defaults; early on, all users effectively run on default parameters.