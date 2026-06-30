# 04 — Component principles

**Purpose.** Cohesion and coupling at the module/package boundary.
**Scope.** How files are grouped into packages/folders and how those packages depend on each other.
**See also.** `ARCH-1`, `SOLID-5`, `STACK-1`.

---

## Cohesion — what belongs together

### CMP-1 — REP (Release/Reuse Equivalency)
**Rule:** A package's modules MUST be releasable and versionable as one unit; group only what is
meant to be reused together.
**Why:** un-reusable grouping forces consumers to take code they don't want.

### CMP-2 — CCP (Common Closure)
**Rule:** Group modules that change together for the same reason; keep apart those that change for
different reasons.
**Why:** scattered co-changing code multiplies edit sites — the `SOLID-1` corollary at package scale.

### CMP-3 — CRP (Common Reuse)
**Rule:** Do not force a consumer to depend on things it doesn't use; split packages whose parts are
used independently.
**Why:** unnecessary deps trigger needless rebuilds and redeploys.

## Coupling — how packages relate

### CMP-4 — ADP (Acyclic Dependencies)
**Rule:** The package dependency graph MUST be a DAG — no cycles.
**Why:** cycles make modules un-testable and un-releasable in isolation. **In this repo:** the
`build/` graph is acyclic (A→B→C; all import `constants.ts`/`types.ts`) under NodeNext `.js`
imports — keep that shape.

### CMP-5 — SDP (Stable Dependencies)
**Rule:** Depend in the direction of stability — volatile packages MUST point at stable ones, never
the reverse.
**Why:** a stable package that depends on a volatile one becomes hard to change.

### CMP-6 — SAP (Stable Abstractions)
**Rule:** Stable packages MUST be abstract (interfaces/domain); concrete detail belongs in less
stable packages.
**Why:** balances `CMP-5` — stability without rigidity. Domain ports stay stable + abstract; infra
adapters stay concrete + replaceable.
