```
design system — instrument · v2.1 · spec-synced · 2026-07
00 principles01 color02 type03 layout & shape04 components05 review states06 motion07 voice
```

```
00 · PRINCIPLES
```

# wikain. 

A calibrated instrument for growing productive English vocabulary. Cool field, blue-black ink, one marigold signal, three typographic voices — and honesty as a layout principle: the counter can tick down, demotions weigh the same as promotions, bounces are nudges, never errors. Behavior mirrors the `spec/` tree. 

|`P1`<br>Three voices, strictly cast<br>Serif is the language in play — headwords and sentences.<br>Sans is the instrument speaking. Mono is the instrument<br>measuring: every count, tag, tally, and R value.<br>`P4`|`P2`<br>One signal color<br>Marigold marks the live thing: <br>word dot, the wordmark period<br>colors body text. More than tw<br>screen — demote one.<br>`P5`|goal fll, focus ring, counted-<br>. It never flls a button, never<br>o marigold elements on a|`P3`<br>Elevation by rule<br>Surfaces separate with 1px lines and paper steps, not<br>shadows. Crisp edges, 6–8px radii, tick-marked gauges.<br>The UI reads like a well-printed form, not a stack of cards.<br>`P6`|
|---|---|---|---|
|Honest by construction|Bounces are not errors||The sentence is the hero|
|The counter ticks down when words fade (CNT-4);<br>decreases animate identically to increases. Demotions|Rule-layer bounces (INV-2) an<br>render instantly in neutral ink|d cloze soft bounces (FIT-7)<br>on sunken paper — no red, no|The learner's sentence is typeset largest on the screen, in<br>serif, with the judge's corrections rendered on it —|
|render with the same weight as promotions. No streaks, no<br>confetti, no guilt states — ever (CNT-9).|spinner before them. Terracott<br>and destructive actions only.|a is reserved for judged fails|strikethrough + insertion, colored by reason — never buried<br>in a feedback paragraph below (EDIT-7).|
|**`01 · COLOR`**<br>Field & ink — cool, near-neutral<br>`paper`<br>`oklch(0.982 0.003 250)`|app background|Signals — marigold leads, mo<br>`marigold`|ss & terracotta judge<br>`oklch(0.70 0.15 66)`<br>goal fll, counted dot|
|`paper-raised`<br>`oklch(0.996 0.001 250)`|panels, inputs|`marigold-deep`|`oklch(0.56 0.13 64)`<br>focus ring, links, text on paper|
|`paper-sunken`<br>`oklch(0.957 0.005 250)`|wells, bounces, tracks|`moss`|`oklch(0.57 0.10 150)`<br>pass, healthy retrievability|
|`ink`<br>`oklch(0.24 0.02 265)`|text, primary buttons|`moss-wash`|`oklch(0.946 0.030 150)`<br>PASS verdict bar|
|`ink-soft`<br>`oklch(0.44 0.016 262)`|secondary text, bounce copy|`terracotta`|`oklch(0.55 0.15 32)`<br>judged fail, destructive only|
|`ink-faint`<br>`oklch(0.58 0.012 260)`|metadata, placeholders|`terra-wash`|`oklch(0.946 0.025 32)`<br>FAIL verdict bar|
|`line`<br>`oklch(0.90 0.007 255)`|rules · strong: 0.80|`fluent-blue`|`oklch(0.44 0.08 210)`<br>the fluent badge, solid|
|Edit-reason colors (EDIT-7 · priority sense > grammar > collocati|on > register)|Mastery ramp (SM-1 · tint dee|pens with growth, fluent is the only solid)|
|sense `= terracotta`<br>grammar `0.60 0.14 45`<br>coll|ocation `= marigold-deep`|`new`<br>`seen`<br>`recogni`|`zed`<br>`productive`<br>`fluent`|
|register `0.55 0.06 320`||Chips are mono, lowercase, 3px|corners — tags on a form, not pills. seen `oklch(0.68 0.08 85)` ·|
|Yesterday I~~negotiate~~<br>negotiatedwith my<br>~~made an agreement~~<br>agreedon the rent.<br>`▸ tap an edit for its note · advisory reasons never fail`|landlord and we<br>`the gate (JDG-5)`|recognized = marigold · produc<br>floor is _recognized_ (SM-7).|tive = moss · fluent `oklch(0.44 0.08 210)`. The ladder can regress:|



Marigold discipline. Marigold never fills a button and never colors running text. If a screen has more than two marigold elements, demote one. Terracotta discipline. Only judged gate fails and destructive actions. Bounces, soft bounces, offline, and retry states are neutral ink on sunken paper — they are not the learner's fault. Washes carry verdicts. moss-wash / terra-wash tint the verdict bar only (with a 3px accent rule on its left edge); the mono label and one line of text carry the color, the panel stays paper. 

**`02 · TYPE`** `SOURCE SERIF 4 — THE LANGUAGE IN PLAY IBM PLEX SANS — THE INSTRUMENT SPEAKING IBM PLEX MONO — THE INSTRUMENT MEASURING` Start session `142` negotiate Labels, buttons, verdict lines, prompts, settings — `03/09 · R 0.84 · due 12` I negotiated a later deadline with my everything the instrument says. `verb / B2 / free-production` professor. Write a sentence using negotiate — ideally Every count, tag, tally, R value, and spec reference. something true about you. Tabular numerals always. Headwords, learner sentences, cloze frames, model sentences. Strictly the learner's language — never UI. 

|`USE`|`SAMPLE`|`SPEC`|
|---|---|---|
|Target word (review card)|gather|`serif 36px / 600`|
|Counter numeral|`127`|`mono 40px / 500 / tabular-nums`|
|Learner sentence / cloze / model|She gathered everyone for the announcement.|`serif 20px / 1.6`|
|Page title|Your words|`sans 20px / 600`|
|UI labels / buttons|Show a starter|`sans 14px / 500`|
|Metadata (pos / CEFR / tier)|`VERB / B2 / CUED-PRODUCTION`|`mono 10.5px / uppercase / tracked`|





<!-- Start of picture text -->
03 · LAYOUT & SHAPE<br>One column, mobile-first Radius Elevation<br>Design at 390px; content column max 448px centered, 576px on ·<br>panels 8px<br>desktop. No multi-pane layouts. paper — the field<br>App chrome: sticky top bar (wordmark left, counter right); bottom buttons & inputs · 6px<br>tab nav on mobile (Home / Words / Settings), inline top-right on paper-raised — panels & inputs<br>desktop. chips & tags · 3px<br>The review session is chromeless — a thin progress bar, a close ×, Crisp edges. Nothing is a pill; chips read as printed tags. paper-sunken — wells & bounces<br>and the card. Nothing else.<br>Spacing rhythm: 4px base · sections 24px apart · panel padding 20– Depth is 1px rules + paper steps. No shadows — the UI is a printed<br>form, not floating cards.<br>24px.<br>One panel = one thought. Never stack two decisions in one panel.<br>04 · COMPONENTS<br>Buttons — marigold never fills a button · 44px min touch target on mobile CounterStat & GoalGauge — the two honest dials (CNT-2/3/4/8)<br>Start session Skip for now Show a starter Delete account<br>127<br>3/5 SENTENCES<br>Words you can use<br>Submit<br>▾ 3 faded — reviewing brings them back R floor 0.70 · due 12<br>Inputs — focus ring marigold-deep · learner writes in the content voice Counter counts words with ≥2 spaced judged passes and live retrievability ≥ 0.70 — it ticks down<br>between reviews; a decrease animates identically to an increase. Goal is a tick-marked gauge, unit =<br>productive uses (sentences), learner-set; it fills once and never pulses.<br>Type the word…<br>Session progress — 4px track, marigold fill<br>Write a sentence using “gather” — ideally something<br>TierTag<br>true about you.<br>RECOGNITION / SEEN FREE-PRODUCTION / PRODUCTIVE<br>FREE-PRODUCTION / FLUENT / MAINTENANCE<br>BounceCallout — rule layer (RL-2/3/4) · instant, neutral, no Cloze soft bounce — fit-set lanes (FIT-6/7/8) · new CheckingIndicator — only after the rule layer passes (NET-2)<br>red<br>After dinner she reminded me that I Checking…<br>i Your sentence needs “gather” in it — any still  pay  her ₱200. MCQ grading — 4 options · tint, no shake · deterministic =<br>form works (gather, gathered, gathers…). instant<br>near-miss “Pay” works here, but we’re after a gather ✓<br>i Give it a bit more — a full sentence with a few more precise word — try again.<br>more words.<br>collect<br>diff-sense “Own” fits the blank, but the word<br>i Let’s keep this one in English — try rewriting we’re after means to need to give assemble<br>it. something back, usually money .<br>borrow<br>no rating · no scheduler call · card stays due (INV- same consequence as a bounce, distinct class — never<br>2) fold into the bounce counter · cap 3 → reveal target, Prompt is a meaning; options are 4 words — 1 target + 3<br>cap 3 → ModelSentenceReveal · no spinner precedes a grade Again · typo lane: “owwe” → counted as owe,<br>distractors (TIER-2). A wrong choice never demotes and never<br>bounce (NET-2) Good, flag recorded (FIT-9)<br>uses demotion language (SM-6).<br>VerdictPanel — pass + EditedSentence polish (JDG-5, EDIT-7) VerdictPanel — fail sense evidence + demotion line (LOOP-4, SM-6/7)<br>PASS — nicely used. One polish: FAIL — not the sense we’re after here.<br>Every Sunday we  gather gathered at my grandmotherʼs I feel fine about the new schedule.<br>house in Laguna. DETECTED fine = acceptable, in good health<br>▸ grammar · tap for note INTENDED fine = money paid as a penalty<br>Past events take the past form — “gathered.” fine moved back a step — it’ll come around again. recognized<br>You could also say: the whole family gathers — a natural collocation. Already recorded — keep practicing if you like; this one won’t be scored. (SM-8: no<br>Feedback is on-demand, never the primary surface. Pass and fail share the same 250ms fade — color override, no rejudge.)<br>carries the meaning.<br>ModelSentenceReveal — bounce cap (RL-6) RetryNotice & OfflineBar — neutral, never terracotta (NET- WordRow — retrievability vs floor 0.70 · counted dot (CNT-<br>3/5) 2/3)<br>Here’s one way to use it:<br>We gathered our things and left Couldn’t check that one — try again. Your negotiate  fluent<br>sentence is saved right here.<br>before the rain started.<br>gather  productive<br>Try once more Skip for now You’re offline — reconnect to check this<br>sentence. owe recognized<br>skip = no rating · no FSRS update · card stays due<br>closes the loop without a phantom lapse Failures leave the card due with no rating (INV-2). Not the Marigold dot = in “words you can use”. Meter: moss ≥ 0.70,<br>learner’s fault, so no red. Sentence always preserved. terracotta below. Detail view lists promotions and demotions<br>with equal weight.<br><!-- End of picture text -->

**`05 · REVIEW STATES — THE SPEC MAP`** Every spec-mandated state and its treatment. A screen is incomplete until every row it owns renders. Deterministic tiers are instant; only the judged branch may show “checking…”. 

|`STATE`|`SPEC`|`TREATMENT`|
|---|---|---|
|Recognition MCQ graded|`TIER-2, RAT-1`|instant; correct tints moss, chosen-wrong tints terracotta; no demotion language|
|Cloze pass / fail|`TIER-5`|instant; on fail show the word + “we’ll show it again soon” — no demotion (SM-6)|
|Cloze soft bounce (near-miss / diff-sense)|`FIT-6/7`|neutral callout, no rating, card stays due; diff-sense carries bounce_gloss; never reveals the target|
|Soft-bounce cap (3) reached|`FIT-8`|target revealed, grades Again; softBounceCount/Lanes recorded on the log|
|Cloze typo (DL **≤** 1)|`FIT-9`|counted as the target, rates Good, quiet “typo noted” metadata — no scolding|
|Cued pass promotes|`SM-4`|quiet promotion line: chip pair “recognized → productive”; no fanfare|
|Rule bounce (absent / degenerate / Taglish)|`RL-2/3/4`|BounceCallout, instant, input preserved; fallback offer after 1 degenerate (switches only on tap, TIER-7)|
|Rule-bounce cap (3)|`RL-6`|ModelSentenceReveal + Try once more / Skip; skip = no rating, card stays due|
|Checking…|`NET-2`|3-dot pulse, only after the rule layer passes; the app’s only loop besides gauge fll|
|Pass (clean / polish / enrichment)|`LOOP-4, CNT-7`|moss bar; polish edits inline (advisory reasons); enrichment framed as an upgrade, never a fx|
|Fail (sense / meaning-obscuring grammar)|`JDG-2, SM-6/7`|terracotta bar; detected vs intended sense; demotion line with chip; floor recognized|
|Unresolvable edit fallback|`EDIT-4`|whole corrected sentence under a “suggested rewrite” label — never a guessed span|
|Unscored practice after fail|`SM-8, RAT-4`|input stays open with “already recorded” label; no override, no rejudge|
|Cloud failure / offline|`NET-3/4/5`|neutral notice, sentence preserved, card stays due, no rating — never terracotta|
|Session summary<br>**`06 · MOTION`**|`—`|sentences written vs goal; words moved — promotions and demotions listed with equal visual weight; counter delta|



|Tokens — libra|ry: motion/react|Patterns|
|---|---|---|
|`fast`|`150ms`<br>hovers, chips, popovers, bounce fade|Card enter: fade + 8px rise, 250ms; exit fade-only (AnimatePresence wait).<br>Verdict reveal: 250ms fade — identical for pass and fail; color carries the meaning, not the movement.|
|`base`|`250ms`<br>card enter, verdict reveal|Inline edits: spans stagger in 40ms apart, opacity-only.|
|`slow`|`600ms`<br>counter numeral, gauge fll|Bounce callout: 150ms fade, no movement — instant feel.<br>Counter numeral: count up/down 600ms — decreases identical to increases (CNT-4).|
|`easing`|`cubic-bezier(0.25, 0.1, 0.25, 1)`|Goal gauge: fll animates 600ms, once; never pulses at rest.|
|Reduced motio|n: y-offsets → 0, loops stop (checking dots become static text); opacity fades|MCQ grade: 150ms color tints; no shake.|
|may remain.||Page transitions: none — only within-session card swaps animate.|
|||Forbidden: confetti/particles, scale-bounce on success, shake on failure, idle attention-seekers, skeleton shimmer<br>on deterministic grades (they’re instant — NET-2).|



|**`07 · VOICE`**|||
|---|---|---|
|Plain, precise, specifc. Never blames; never says “wrong answer”.|`MOMENT`|`COPY (SPEC-FIXED)`|
|Bouncesarenudgesframedpositively—whattodonextnotwhatwentwrong.|||
|,    <br>Fails show their evidence: the sense detected vs the sense practiced.|Pass, clean|“Nicely used.”|
|Demotion copy is matter-of-fact and forward-looking; the ladder can regress<br>dtht’l|Pass with polish|“Nicely used — one polish:”|
|an as norma.<br>Network problems are the app’s fault, never the learner’s.|Sense fail|“Not the sense we’re after here.” + detected vs intended sense lines|
|Enrichment is an upgrade, never a correction.|Demotion|“_fne_ moved back a step — it’ll come around again.”|
||Bounce: absent|“Your sentence needs ‘{word}’ in it — any form works.”|
||Bounce: degenerate|“Give it a bit more — a full sentence with a few more words.”|
||Bounce: Taglish|“Let’s keep this one in English — try rewriting it.”|
||Counter faded|“Some words faded — reviewing brings them back.”|
||Edit feedback hint|“Tap an edit to see why.”|
||Cloud failure|“Couldn’t check that one — try again.”|
||Offline|“You’re offline — reconnect to check this sentence.”|



Behavior mirrors `spec/00–13` + the screen-state map @ `claude-code-web-transfer` . Visual tokens are the <u>1b Instrument</u> direction (Brand Directions) — the repo's `styles.css` currently implements the warm-editorial palette; migrating means swapping the `:root` token block and fonts, component structure unchanged. 

wikain. 

