# 01 — Architecture

**Purpose.** Clean/onion architecture and separation of concerns for the v4 runtime.
**Scope.** All runtime modules. `build/`'s carried-vs-generated split is the existing proof.
**See also.** `SOLID-5` (DIP), `CMP-4` (ADP), `STACK-3`, `06-tdd.md`.

---

### ARCH-1 — Dependency rule
**Rule:** Source dependencies MUST point inward only: presentation → application → domain;
infrastructure → application/domain. The **domain** layer MUST import nothing outward — no
framework, no DB driver, no HTTP.
**Why:** outward domain deps couple business rules to volatile detail, so a Neon or TanStack change
ripples into core logic.

### ARCH-2 — Four layers
**Rule:** Place each module in exactly one layer:
- **domain** — pure TS entities, value objects, invariants (`INV-1..4`), FSRS math. No I/O.
- **application** — use-cases orchestrating domain + ports (interfaces). No framework types.
- **infrastructure** — adapters implementing ports: Neon/PostgreSQL repos, BetterAuth, the cloud
  judge client, network.
- **presentation** — TanStack Router/Query, shadcn-ui/Tailwind components.

**Why:** mixing layers (e.g. SQL inside a component) destroys testability and breaks `ARCH-1`.

### ARCH-3 — Infrastructure behind ports
**Rule:** Application code MUST depend on an interface (port) it declares, not a concrete adapter.
Infrastructure implements the port; wiring happens once at the composition root.
**Why:** lets the judge/DB be faked in tests (`06-tdd.md`) and swapped without touching use-cases.
**In this repo:** `build/` centralizes validation in one `validateItem` reused by `ingest` and
standalone `validate` — one path, not duplicated. Mirror that for runtime ports.

### ARCH-4 — One reason to exist
**Rule:** A module MUST own a single concern; split it when it serves two callers for different
reasons (defer to `SOLID-1`, `CMP-2`).
**Why:** see `build/`'s deterministic harness vs. generator separation — blending them is how
hallucinated facts could enter carried fields.
