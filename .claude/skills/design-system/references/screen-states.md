# Screen-state map — every spec-mandated UI state

Route → states → owning spec ID → component (see components.md). This is the checklist for the
review flow; a screen is incomplete until every row it owns renders.

## `/review` — session (chromeless focus mode)

Session shell: Progress bar (position/total) + close (×) → back to dashboard.

### Deterministic tiers (instant grade — NET-2, LOOP-2)

| State | Spec | Render |
| --- | --- | --- |
| Recognition MCQ: gloss + 4 word options | TIER-2 | WordOptionList — the prompt is a meaning, the options are 4 words (1 target + 3 distractors) |
| Recognition graded | RAT-1 | instant; correct → moss tint; wrong choice → terracotta tint + correct shown moss; **150ms tint, no shake**; a wrong choice never demotes and never uses demotion language (SM-6) |
| Cloze: sentence with blank + input | TIER-5 | serif sentence, auto-sizing BlankInput |
| Cloze graded | TIER-5 | instant; pass/fail tint; on fail show the word + "we'll show it again soon" — no demotion (SM-6) |
| Cloze soft bounce (near-miss / diff-sense) | FIT-6/7 | SoftBounceCallout — neutral, **no rating**, card stays due; diff-sense carries `bounce_gloss`; **never reveals the target** |
| Soft-bounce cap (3) reached | FIT-8 | target revealed, grades `Again`; `softBounceCount`/`softBounceLanes` recorded on the log |
| Cloze typo (DL ≤ 1) | FIT-9 | counted as the target, rates `Good`, quiet "typo noted" metadata — no scolding |
| Cued: gloss + type-the-word | TIER-3 | gloss (different phrasing from MCQ — TIER-2), BlankInput |
| Cued pass promotes | SM-4 | quiet promotion line "recognized → productive" via MasteryChip pair; no fanfare |

### Free production / maintenance (judged branch — LOOP-3/4)

| State | Spec | Render |
| --- | --- | --- |
| Prompt: self-reference | TIER-6 | WordTitle + prompt + serif Textarea |
| Maintenance variant | TIER-8 | same + `· maintenance` in TierTag |
| Scaffolding (hint/starter) used | SM-9 | "Show a starter" ghost button; if used, attempt marked scaffolded (metadata chip) |
| Bounce: target absent | RL-2 | BounceCallout, instant, input preserved |
| Bounce: degenerate (short / no verb / verbatim) | RL-3 | BounceCallout (two copy variants) |
| Bounce: Taglish | RL-4 | BounceCallout ("let's keep this one in English") |
| Fallback offer after 1 degenerate/empty | TIER-7 | offer chip; mode switches ONLY on tap |
| Bounce cap (3) reached | RL-6 | ModelSentenceReveal + Try once more / Skip; skip = no rating, card stays due |
| Checking (post-rule-layer only) | NET-2 | CheckingIndicator |
| Pass, clean | LOOP-4 | VerdictPanel pass |
| Pass + polish edits | JDG-5, EDIT-7 | VerdictPanel pass + EditedSentence (non-failing reasons) |
| Pass + enrichment | CNT-7 | "You could also say…" block |
| Fail: sense | LOOP-4, SM-6/7 | VerdictPanel fail + detected/intended sense + EditedSentence + demotion line |
| Fail: grammar (meaning-obscuring) | JDG-2 | VerdictPanel fail (grammar copy) + EditedSentence |
| EDIT-4 fallback (unresolvable edit) | EDIT-4 | EditedSentence fallback mode: whole corrected_sentence |
| Edit feedback on demand | EDIT-7 | tap span → one_line_feedback popover |
| Transient failure after retry | NET-3/4 | RetryNotice (neutral), sentence preserved, card stays due |
| Offline at submit | NET-5 | OfflineBar, submit blocked |
| Session complete | — | SessionSummary |

## `/` — dashboard

| State | Spec | Render |
| --- | --- | --- |
| Counter (can tick down) | CNT-2/3/4 | CounterStat + optional fade caption |
| Daily goal gauge | CNT-8, SEED-9 | GoalGauge — tick-marked (unit: sentences) |
| Due queue summary + Start session CTA | LOOP-1, SEED-6 | due count, intro count ("~5 new/day" pacing visible) |
| Ladder distribution | SM-1 | 5-state bar with MasteryChips |
| No streaks anywhere | CNT-9 | (absence is the requirement) |

## `/onboarding`

welcome → coarse level (3 bands) → seeding intro (2 words, SEED-1) → straight into first
recognition + first free production win → "tune your level" offer (per-word marking grid +
LexTALE entry point, both skippable — SEED-2/3/4). The first win MUST come before any long test.

## `/words`, `/words/$wordId`

WordRow list (filter by mastery); detail = mastery history timeline (promotions AND demotions with
equal weight), retrievability meter vs `COUNTER_R_FLOOR`, counted-status (CNT-2), review log list,
the word's model sentence, learner's past sentences.

## `/signin`, `/signup`, `/settings`

Auth: real BetterAuth email+password (STACK-4), behind the `_public` → `_authenticated` →
`_onboarded` guard chain. Settings: daily goal stepper (CNT-8, default 5), level band + a `Retune`
link to `/placement`, timezone (calendar-day logic SM-5b — a **Combobox**, ~400 IANA zones),
sign-out. No notification/streak settings (CNT-9).

> Per-word marking is **not** re-offered outside onboarding: marks are additive-only in v1, so a
> mistaken tap would be permanent (SEED-2/3/7).
