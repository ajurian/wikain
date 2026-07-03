# Wikain palette — full values & usage rules

All colors oklch (Tailwind v4 native). Light theme is primary; a dark theme is **not designed yet**
— do not improvise one.

## Neutrals (paper & ink)

| Token | Value | Use |
| --- | --- | --- |
| paper | `oklch(0.977 0.008 84)` | app background |
| paper-raised | `oklch(0.993 0.004 84)` | cards, inputs |
| paper-sunken | `oklch(0.955 0.010 84)` | wells, muted chips, secondary surfaces |
| ink | `oklch(0.27 0.02 55)` | primary text, primary buttons |
| ink-soft | `oklch(0.45 0.015 55)` | secondary text |
| ink-faint | `oklch(0.58 0.012 55)` | metadata, placeholders |
| line | `oklch(0.90 0.010 84)` | borders, dividers |

## Accents

| Token | Value | Use |
| --- | --- | --- |
| amber | `oklch(0.75 0.14 75)` | goal ring fill, wordmark period, active highlights |
| amber-deep | `oklch(0.62 0.13 70)` | amber text/icons on paper (contrast-safe) |
| amber-wash | `oklch(0.95 0.035 85)` | amber-tinted backgrounds |
| moss | `oklch(0.58 0.10 145)` | pass states, growth, counter-positive |
| moss-wash | `oklch(0.95 0.03 145)` | pass banners/backgrounds |
| terracotta | `oklch(0.55 0.16 30)` | judged fail, demotion, destructive buttons |
| terracotta-wash | `oklch(0.95 0.025 30)` | fail banners/backgrounds |

## Edit-reason colors (inline replacements — EDIT-7, CNT-7)

PRD §9: amber = collocation/register polish; a **stronger** treatment = grammar; sense is the gate.

| reason | Color | Treatment |
| --- | --- | --- |
| sense | terracotta `oklch(0.55 0.16 30)` | strongest: strikethrough + underline, wash bg |
| grammar | vermilion `oklch(0.60 0.14 45)` | strong: strikethrough + underline |
| collocation | amber-deep `oklch(0.62 0.13 70)` | polish: dotted underline |
| register | plum `oklch(0.55 0.06 320)` | polish: dotted underline |

## Mastery-ladder colors (SM-1) — a warmth→growth ramp

| State | Color | Chip style |
| --- | --- | --- |
| New | ink-faint on paper-sunken | outline only |
| Seen | sand `oklch(0.78 0.06 80)` | tinted chip |
| Recognized | amber `oklch(0.75 0.14 75)` | tinted chip |
| Productive | moss `oklch(0.58 0.10 145)` | tinted chip |
| Fluent | deep teal `oklch(0.45 0.08 195)` | solid chip, the only solid one |

## Rules

- **Amber is scarce.** If a screen has >2 amber elements, demote the least important to ink.
- Primary CTAs are **ink** buttons (`ink` bg, paper text). Amber never fills a button.
- Terracotta appears only for judged fails/demotions/destructive actions — never for bounces
  (bounces are neutral ink-soft callouts on paper-sunken; INV-2 says they're not errors).
- Moss and terracotta washes always pair with their full-strength color as text/icon.
- Text contrast: body text is always ink or ink-soft on paper/paper-raised. Never amber body text.
