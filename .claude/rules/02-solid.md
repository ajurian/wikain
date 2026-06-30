# 02 — SOLID

**Purpose.** Object/module design principles.
**Scope.** All runtime code.
**See also.** `ARCH`, `COMP`, `CMP`.

---

### SOLID-1 — Single Responsibility
**Rule:** A class/module MUST have one reason to change — one actor it answers to.
**Why:** multiple responsibilities couple unrelated changes. **In this repo:** Stage A (assemble)
vs. Stage B (generate) vs. Stage C (validate) each change for one reason.

### SOLID-2 — Open/Closed
**Rule:** Extend behavior by adding code (a new port implementation), not by editing stable modules.
**Why:** editing tested core to add a case risks regressions; prefer the `COMP-1` strategy pattern.

### SOLID-3 — Liskov Substitution
**Rule:** Any implementation of a port MUST be usable wherever the port is expected, with no
stronger preconditions and no surprising behavior.
**Why:** a substitute that breaks the contract forces type-checks at call sites and defeats `ARCH-3`.

### SOLID-4 — Interface Segregation
**Rule:** Ports MUST be narrow and client-specific; a consumer MUST NOT depend on methods it never
calls.
**Why:** fat interfaces force needless fakes in tests and spread change across unrelated consumers.

### SOLID-5 — Dependency Inversion
**Rule:** High-level policy (application/domain) and low-level detail MUST both depend on
abstractions owned by the high-level side.
**Why:** this is the linchpin of `ARCH-1`/`ARCH-3`. **Example:** the use-case depends on a
`JudgeClient` interface; the HTTP adapter implements it.
