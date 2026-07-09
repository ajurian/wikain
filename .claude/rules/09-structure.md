# 09 — Directory structure

**Purpose.** How files are grouped *below* the layer boundary.
**Scope.** `src/**`. `ARCH-2` fixes the four top-level layers; these rules shape what is inside them.
**See also.** `CMP-1`/`CMP-2`/`CMP-3` (cohesion), `PRAG-1`/`PRAG-3` (don't over-group), `TDD-4`.

---

### DIR-1 — Subject folders, not kind folders
**Rule:** A folder inside a layer MUST be named for the **subject** it serves (`review/`, `mastery/`,
`placement/`), never for a technical **kind** (`utils/`, `helpers/`, `types/`, `models/`, `services/`).
**Exception:** in **infrastructure** the subject *is* the seam being adapted — `db/`, `auth/`,
`judge/`, `nlp/`, `persistence/` are correct, because the vendor is the reason that code changes.
**Why:** a kind-folder scatters co-changing files across the tree, so one slice edits five directories
(`CMP-2`). A subject-folder makes a slice one directory.

### DIR-2 — One subject level, created on the third file
**Rule:** Keep files at the layer root until **three** share a subject; then move all three into a
folder named for it. Nest at most **one** subject level below the layer root. Never pre-create an
empty or two-file folder for a subject you expect later.
**Why:** a premature folder is a premature abstraction (`PRAG-3`) and deep nesting hides the seam it
was meant to reveal (`PRAG-2`). Three is where a pile starts costing you.

### DIR-3 — Cross-subject modules stay at the layer root
**Rule:** A module used by three or more subjects MUST NOT be filed under one of them. It stays at the
layer root (`domain/constants.ts`, `infrastructure/composition.ts`). `application/ports/` is the
sanctioned by-kind folder for this reason: it is the layer's stable, abstract, published surface
(`CMP-6`), keyed by port, not by consumer.
**Why:** filing a shared module under one consumer's folder invents a false owner and drags every
other consumer across a folder boundary (`CMP-3`).

### DIR-4 — Tests, doubles, and contracts sit with what they serve
**Rule:** A `*.test.ts` sits beside its implementation (`TDD-4`). A test double or shared contract
test sits beside the port implementation it exercises — `fakeJudge.ts` in `infrastructure/judge/`,
`cardRepositoryContract.ts` in `infrastructure/persistence/`. End-to-end smoke tests have no single
implementation: their unit under test is the composition root, so they live in
`infrastructure/smoke/`, one level below `composition.ts`.
**Why:** co-location makes move/delete atomic. `smoke/` is the one sanctioned kind-folder, and only
because `TDD-4`'s "next to its implementation" has no other answer for a test of the whole wiring.

### DIR-5 — Framework-owned paths are exempt
**Rule:** Paths whose shape a tool dictates MUST NOT be reorganized for cohesion:
`presentation/routes/**` (TanStack file-based routing — shape *is* the URL),
`presentation/components/ui/**` + `presentation/lib/**` (pinned by `components.json`),
`infrastructure/db/**` (pinned by `drizzle.config.ts` and `db:seed:catalog`; `pglite.ts` resolves
`drizzle/` relative to its own depth), and generated files (`routeTree.gen.ts`).
**Why:** re-grouping a generated or tool-addressed path silently breaks the tool, and the next
`shadcn add` or route generation puts it back.

### DIR-6 — No barrels
**Rule:** Import the module directly. Do NOT add `index.ts` re-export files to make a folder look like
a package.
**Why:** barrels create import cycles (`CMP-4`), and a single barrel re-exporting a server module is
how a Neon or DeepSeek identifier reaches the client bundle — the exact leak `npm run build` gates on.
