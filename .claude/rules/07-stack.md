# 07 — Stack conventions

**Purpose.** Tooling choices and per-library layer placement for the v4 runtime.
**Scope.** Runtime + tooling.
**See also.** `ARCH-2`, `ARCH-3`, `CMP-4`.

---

### STACK-1 — npm + ESM + NodeNext
**Rule:** Use **npm** only (`package-lock.json` is canonical). Code is ESM (`"type": "module"`);
relative imports carry explicit `.js` extensions; Node built-ins use the `node:` prefix; TypeScript
`strict` stays on.
**Why:** matches `build/`; mixed package managers or module styles break NodeNext resolution.

### STACK-2 — Vite + TanStack in presentation
**Rule:** Vite is the bundler/dev server. TanStack Router/Query/Form/Table live in **presentation**;
server state flows through TanStack Query, never ad-hoc fetches scattered across components.
**Why:** keeps data-fetching policy in one layer (`ARCH-2`).

### STACK-3 — Neon/PostgreSQL behind a repository port
**Rule:** All DB access MUST go through an infrastructure repository that implements an
application-declared port (`ARCH-3`); no SQL or Neon client in application/domain/presentation.
**Why:** keeps the domain DB-agnostic and the data layer fakeable in `06-tdd.md`.

### STACK-4 — BetterAuth in infrastructure
**Rule:** BetterAuth integration lives in infrastructure behind an auth port; use-cases receive the
authenticated principal, never the auth library itself.
**Why:** auth is a swappable detail, not business policy.

### STACK-5 — shadcn-ui + Tailwind, presentation only
**Rule:** shadcn-ui components and Tailwind classes appear only in presentation; no
domain/application module imports UI.
**Why:** UI is the most volatile layer (`CMP-5`) — keep it out of stable code.
