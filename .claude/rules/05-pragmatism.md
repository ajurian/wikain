# 05 — Pragmatism (anti-over-engineering)

**Purpose.** Guardrails that stop the other rules from breeding needless abstraction.
**Scope.** Every design decision.
**See also.** `SOLID-1`, `CMP-2`, `COMP-1`.

---

### PRAG-1 — YAGNI
**Rule:** Build only what v1 needs now. Anything marked `[v2]`/Deferred in `spec/` MUST stay unbuilt
and untested until pulled into scope.
**Why:** speculative generality is dead weight that still must be maintained.

### PRAG-2 — KISS
**Rule:** Choose the simplest design that satisfies the `spec/` ID; add structure only when a
concrete requirement forces it.
**Why:** complexity is the default failure mode — see `build/`'s "halt, don't guess" over clever
inference.

### PRAG-3 — Reuse over replication, but avoid hasty abstraction (AHA)
**Rule:** Don't copy-paste logic — extract a shared unit. But extract only on **proven** duplication
(rule of three / identical reason to change, per `CMP-2`); a premature abstraction is worse than
duplication.
**Why:** the wrong abstraction couples unrelated callers and is costly to unwind. **In this repo:**
`constants.ts` is the single source for shared literals — reuse it, never re-hardcode.
