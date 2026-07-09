# 00 — Engineering Rules Overview

**Purpose.** Index + conventions for the rule tree under `.claude/rules/`. These rules bind all
runtime/code work and are auto-loaded via `@`-imports in `CLAUDE.md`.
**Scope.** The v4 web runtime specified in `spec/` does not exist yet — these rules govern it as it
is built. The implemented `build/` pipeline is the **living proof** cited throughout.
**See also.** `spec/00-overview-invariants.md` (the spec-tree style these files mirror).

---

## Conventions

- **RFC-2119.** MUST / SHOULD / MAY carry their standard normative weight.
- **Stable IDs.** Every rule has `<PREFIX>-<n>`; one prefix per file; IDs are never renumbered.
  Cross-reference by ID — never restate another rule's body.
- **Grounded, not generic.** Each rule names its **failure mode** and ties to `build/`, `spec/`, or
  a named stack component.

## File / prefix map

| File | Prefix | Topic |
| --- | --- | --- |
| `01-architecture.md` | `ARCH` | clean/onion layers, dependency rule, separation of concerns |
| `02-solid.md` | `SOLID` | the five object-design principles |
| `03-composition.md` | `COMP` | composition over inheritance |
| `04-component-principles.md` | `CMP` | module cohesion (REP/CCP/CRP) + coupling (ADP/SDP/SAP) |
| `05-pragmatism.md` | `PRAG` | YAGNI, KISS, reuse-vs-AHA |
| `06-tdd.md` | `TDD` | red→green→refactor discipline, test placement |
| `07-stack.md` | `STACK` | Node/ESM/npm/Vite/TanStack/Neon/BetterAuth/shadcn |
| `08-comments.md` | `CMT` | comment the why, not the what |
| `09-structure.md` | `DIR` | directory tree: subject grouping below the four layers |
