# 08 — Comments

**Purpose.** What to comment and what to leave unsaid.
**Scope.** All code.
**See also.** `PRAG-2`, `spec/` `§`/ID citation convention.

---

### CMT-1 — Why, not what
**Rule:** Comments MUST explain intent, trade-offs, and non-obvious constraints — *why* this
approach over the obvious one. Do NOT narrate what the code plainly does (`// increment i`).
**Why:** what-comments duplicate the code and rot; why-comments capture context the code can't.

### CMT-2 — Names over narration
**Rule:** Prefer a clearer name or a smaller function to an explanatory comment.
**Why:** a comment is often a confession that the code isn't self-documenting (`PRAG-2`).

### CMT-3 — Cite the source of truth
**Rule:** When code realizes a spec/doc requirement, cite it by `§`/ID rather than paraphrasing the
rule.
**Why:** paraphrase drifts from the spec; a citation stays correct. **In this repo:** `build/` JSDoc
cites `docs/BUILD.md §…`; runtime code cites `spec/` IDs (`SM-3`, `INV-1`).

### CMT-4 — Be terse
**Rule:** Keep comments to the minimum that conveys the why.
**Why:** verbose comments bury the one line that mattered.
