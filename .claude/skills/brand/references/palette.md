# Wikain palette — full values & usage rules

All colors oklch (Tailwind v4 native). Light theme is primary; a **dark theme is now defined** (see
**Dark theme** below) and shipped as a user preference (light / dark / system) — do not improvise
*new* dark values, extend the recorded set.

The field is **cool and near-neutral** (hues 250–265, chroma ≤ 0.02) so that the one warm signal —
marigold — is the only thing on screen that draws the eye. Warmth is a mark here, not an atmosphere.

## Neutrals (paper & ink)

| Token | Value | Use |
| --- | --- | --- |
| paper | `oklch(0.982 0.003 250)` | app background — the field |
| paper-raised | `oklch(0.996 0.001 250)` | panels, inputs |
| paper-sunken | `oklch(0.957 0.005 250)` | wells, bounces, tracks |
| ink | `oklch(0.24 0.02 265)` | primary text, primary buttons |
| ink-soft | `oklch(0.44 0.016 262)` | secondary text, bounce copy |
| ink-faint | `oklch(0.58 0.012 260)` | metadata, placeholders |
| line | `oklch(0.90 0.007 255)` | borders, dividers |
| line-strong | `oklch(0.80 0.007 255)` | emphasized rules; the edge of a floating surface |

## Signals — marigold leads, moss & terracotta judge

| Token | Value | Use |
| --- | --- | --- |
| marigold | `oklch(0.70 0.15 66)` | goal fill, counted dot, active highlights |
| marigold-deep | `oklch(0.56 0.13 64)` | focus ring, links, marigold text/icons on paper (contrast-safe) |
| marigold-wash | `oklch(0.951 0.035 70)` | marigold-tinted backgrounds (selected chips) |
| moss | `oklch(0.57 0.10 150)` | pass, healthy retrievability |
| moss-wash | `oklch(0.946 0.030 150)` | PASS verdict bar |
| terracotta | `oklch(0.55 0.15 32)` | judged fail, destructive only |
| terra-wash | `oklch(0.946 0.025 32)` | FAIL verdict bar |
| fluent-blue | `oklch(0.44 0.08 210)` | the fluent badge, solid |

> `marigold-wash` has no value in the source design and is **kept** because it is in live use
> (selected onboarding chips, the coarse-level picker). It is the old amber-wash re-hued to the
> marigold signal.

## Edit-reason colors (inline replacements — EDIT-7, CNT-7)

Priority: **sense > grammar > collocation > register**. Sense is the gate; collocation/register are
advisory polish and never fail a sentence (JDG-5).

| reason | Color | Treatment |
| --- | --- | --- |
| sense | terracotta `oklch(0.55 0.15 32)` | strongest: strikethrough + underline, wash bg |
| grammar | vermilion `oklch(0.60 0.14 45)` | strong: strikethrough + underline |
| collocation | marigold-deep `oklch(0.56 0.13 64)` | polish: dotted underline |
| register | plum `oklch(0.55 0.06 320)` | polish: dotted underline |

## Mastery-ladder colors (SM-1) — tint deepens with growth

| State | Color | Chip style |
| --- | --- | --- |
| New | ink-faint on paper-sunken | outline only |
| Seen | sand `oklch(0.68 0.08 85)` | tinted chip |
| Recognized | marigold `oklch(0.70 0.15 66)` | tinted chip; **label** takes marigold-deep (see below) |
| Productive | moss `oklch(0.57 0.10 150)` | tinted chip |
| Fluent | fluent-blue `oklch(0.44 0.08 210)` | solid chip, the only solid one |

The ladder can regress; the floor is *Recognized* (SM-7). Chips are **mono, lowercase, 3px corners**
— tags on a form, not pills.

> Recognized tints from `marigold` but its label renders in `marigold-deep`: the ramp rule speaks to
> the fill, and marigold is not a text color on paper (see Rules).

## Dark theme

Shipped as a user preference (light / dark / **system** = follow the OS). Implemented in
`src/presentation/styles.css` as a single `.dark {}` block that redeclares **only the ~19 raw
tokens** below — every semantic/shadcn/mastery token is a `var()` alias and re-resolves per element,
so it inherits these automatically (never restate `--background`, `--reason-sense`,
`--mastery-recognized`, …). `color-scheme` is set per theme (`light` on `:root`, `dark` on `.dark`).

**Derivation rules** (so the theme stays *the same instrument*, not a different brand):

1. **Lightness inverts** — dark field, light ink. Elevation still runs `paper-sunken → paper → paper-raised`
   (raised = one step *lighter* = nearer the viewer), separated by 1px lines. **Still no shadows.**
2. **Hue + intent are preserved** — the field stays cool and near-neutral (hue ~260–265), and marigold
   stays the single scarce warm signal.
3. **`-deep` / `-wash` roles flip sign.** On a dark field the readable-as-text marigold is *lighter*
   (`--marigold-deep`), and the washes become dark, low-chroma tints (they carry verdict bars / selected
   chips against a dark panel).

| Token | Dark value | Note |
| --- | --- | --- |
| paper | `oklch(0.17 0.008 265)` | the field (darkest base) |
| paper-raised | `oklch(0.215 0.01 265)` | panels/inputs — one step lighter |
| paper-sunken | `oklch(0.14 0.006 265)` | wells/bounces — one step darker |
| ink | `oklch(0.93 0.008 260)` | primary text |
| ink-soft | `oklch(0.72 0.012 260)` | secondary text |
| ink-faint | `oklch(0.56 0.012 260)` | metadata/placeholder |
| line | `oklch(0.3 0.008 260)` | borders/dividers |
| line-strong | `oklch(0.42 0.01 260)` | emphasized rules / floating edge |
| marigold | `oklch(0.78 0.148 74)` | goal fill, counted dot, active highlights |
| marigold-deep | `oklch(0.82 0.13 74)` | links/focus ring/marigold-as-text (lighter on dark) |
| marigold-wash | `oklch(0.3 0.045 72)` | selected-chip tint |
| moss | `oklch(0.7 0.11 150)` | pass / healthy R |
| moss-wash | `oklch(0.3 0.045 150)` | PASS verdict bar |
| terracotta | `oklch(0.68 0.15 34)` | judged fail / destructive |
| terra-wash | `oklch(0.32 0.06 34)` | FAIL verdict bar |
| fluent-blue | `oklch(0.72 0.1 215)` | fluent badge |
| reason-grammar | `oklch(0.72 0.14 48)` | vermilion (raw) |
| reason-register | `oklch(0.74 0.07 320)` | plum (raw) |
| mastery-seen | `oklch(0.76 0.09 85)` | sand (raw) |

The alias tokens follow automatically: `reason-sense`=terracotta, `reason-collocation`=marigold-deep,
`mastery-new`=ink-faint, `mastery-recognized`=marigold, `mastery-productive`=moss,
`mastery-fluent`=fluent-blue. Mastery chips tint via `/20` opacity, so they adapt with no extra tokens.

## Rules

- **Marigold is scarce.** It marks the live thing. If a screen has >2 marigold elements, demote the
  least important to ink.
- Primary CTAs are **ink** buttons (`ink` bg, paper text). **Marigold never fills a button** and
  never colors running text.
- Terracotta appears only for judged fails and destructive actions — **never** for bounces, soft
  bounces, offline, or retry. Those are neutral ink on sunken paper: they are not the learner's
  fault (INV-2, FIT-7, NET-3/5).
- **Washes carry verdicts.** moss-wash / terra-wash tint the **verdict bar only**, with a 3px accent
  rule on its left edge; the mono label and one line of text carry the color, and the panel stays
  paper.
- Text contrast: body text is always ink or ink-soft on paper/paper-raised. Never marigold body
  text; use `marigold-deep` for any marigold that must be read as text.
- **Elevation is by rule, not shadow.** Surfaces separate with 1px lines and paper steps
  (paper → paper-raised → paper-sunken). No drop shadows anywhere; a floating surface (popover)
  takes `line-strong` instead.
