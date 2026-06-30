# 03 — Composition over inheritance

**Purpose.** Default to composition; treat inheritance as the exception.
**Scope.** All runtime code.
**See also.** `SOLID-2`, `SOLID-3`, `SOLID-5`, `ARCH-3`.

---

### COMP-1 — Compose, inject, delegate
**Rule:** Build behavior by composing small functions/objects and injecting collaborators through
ports — not by extending base classes.
**Why:** inheritance hard-wires a single axis of variation and leaks parent internals; composition
keeps `SOLID-5` wiring explicit and testable.

### COMP-2 — Inheritance only for true is-a
**Rule:** Use `extends` only when the subtype is a faithful, substitutable specialization that
honors `SOLID-3`; never for code reuse alone.
**Why:** reuse-driven inheritance produces fragile base classes — prefer a shared helper or an
injected strategy.

### COMP-3 — Prefer plain functions + interfaces
**Rule:** Model domain logic as pure functions over data; reach for classes only when identity or an
encapsulated invariant demands it.
**Why:** matches `build/`'s function-centric, side-effect-light style and keeps the domain
framework-free (`ARCH-2`).
