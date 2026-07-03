# Wikain voice — microcopy catalog

Fixed copy for every loop state. Use these verbatim (or minimally adapted); the tone constraints
they encode are normative brand. Spec IDs cite why each state exists.

## Tier instructions

| Tier | Instruction line |
| --- | --- |
| Recognition (TIER-2) | "Which word means…" (gloss follows as the content) |
| Cloze (TIER-5) | "Complete the sentence." |
| Cued (TIER-3) | "Type the word for this meaning." |
| Free production (TIER-6) | "Write a sentence using *{word}* — ideally something true about you." |
| Maintenance (TIER-8) | Same as free production; add the quiet tag "maintenance" in metadata, no scare copy ("Still yours? Prove it." is FORBIDDEN tone). |

## Rule-layer bounces (instant, never "checking…" — NET-2; no penalty framing — INV-2)

| State | Copy |
| --- | --- |
| Target absent (RL-2) | "Your sentence needs *{word}* in it — any form works ({word}, {inflected examples})." |
| Degenerate: too short (RL-3) | "Give it a bit more — a full sentence with a few more words." |
| Degenerate: verbatim copy (RL-3) | "That's the example sentence — try one of your own." |
| Taglish (RL-4) | "Let's keep this one in English — try rewriting it." |
| Bounce cap reached (RL-6) | "Here's the example to lean on:" + model sentence, then buttons **"Try once more"** / **"Skip for now"**. Sub-line: "Skipping is fine — it stays due and doesn't count against you." |

## Free-production flow

| State | Copy |
| --- | --- |
| Fallback offer (TIER-7, after one degenerate/empty self-reference) | Offer chip: "Stuck on something true about you? **Just write any sentence.**" — mode switches only when tapped. |
| Checking (NET-2) | "Checking…" (nothing else; a quiet inline state, not a modal). |
| Pass, clean (LOOP-4) | "Nicely used." + green check. |
| Pass with polish edits (JDG/EDIT-7) | "Nicely used — one polish:" + inline edits. Edits framed as upgrade, not fix. |
| Pass + enrichment (CNT-7) | "You could also say:" + enrichment_suggestion. |
| Fail, sense (LOOP-4/SM-6) | "Not the sense we're after here." + detected vs intended sense + inline edits. Then: "*{word}* moved back a step — it'll come around again." |
| Fail, grammar (meaning-obscuring) | "The meaning gets lost here." + inline edits + same moved-back line. |
| Unscored further practice (SM-8) | Input stays open, labeled: "Keep practicing if you like — this one's already recorded." |

## Failure path (never the learner's fault — NET-3/4/5)

| State | Copy |
| --- | --- |
| Transient / 5xx / timeout after retry (NET-3) | "Couldn't check that one — try again. Your sentence is still here." |
| Rate limited (NET-4) | Same message; no mention of "rate limits". |
| Offline at submit (NET-5) | "You're offline — reconnect to check this sentence." Submit disabled, sentence preserved. |

## Progress & dashboard

| Surface | Copy |
| --- | --- |
| Counter label (CNT-2) | "Words you can use" — never "learned", never "mastered". |
| Counter decrease (CNT-4) | No apology, no alarm. Optional caption: "Some words faded — reviewing brings them back." |
| Daily goal (CNT-8) | "{n} of {goal} sentences today" — unit is always sentences/uses, never minutes or cards. Goal met: "Goal met." Nothing about tomorrow. |
| Mastery states (SM-1) | Learner-facing names: New → Seen → Recognized → Productive → Fluent (keep the spec names; they read well). |
| Demotion in history | "moved back to {state}" — never "failed", "lost", "broke". |

## Onboarding (SEED-1)

- Welcome: "Wikain grows the English you can actually *use* — one written sentence at a time."
- Level question (coarse signal): "How does your English writing feel at work?" (3 friendly bands)
- Before first word: "Two words to start. You'll write your first sentence in about a minute."
- After first win: "That sentence is yours now. Want to tune your level, or keep going?"
- Placement (SEED-2/3): per-word marking headline "Tap the words you already know." LexTALE offer:
  "Prefer precision? Take the 5-minute placement test." — always optional, never a wall.

## Forbidden patterns

- "Streak", "don't break", "you're on fire", fire/flame iconography (CNT-9).
- "Wrong!", "Incorrect", "Oops!" for judged fails.
- Apologizing for honest metrics ("sorry, your counter went down").
- Exclamation marks on any failure, bounce, or system-error message.
