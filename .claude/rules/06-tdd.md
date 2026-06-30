# 06 — Test-Driven Development

**Purpose.** The red→green→refactor execution discipline and where tests live.
**Scope.** All runtime code, written test-first against `spec/` IDs.
**See also.** `PRAG-1`, `ARCH`, `SOLID`, `CMP`. Runner: **vitest** (npm).

---

### TDD-1 — RED: write a failing test first
1. Pick the smallest unproven `spec/` requirement ID / Given-When-Then scenario.
2. Write **one** test that states the intended behavior and names the ID.
3. Run `vitest`; confirm it fails **for the expected reason** (an assertion, not a typo/import error).
4. Write **no** production code in this phase.

**Why:** a test that never failed proves nothing.

### TDD-2 — GREEN: minimum code to pass
1. Write the least code that makes the test pass — hardcoding is acceptable here.
2. Run `vitest`; all green.
3. Add **no** behavior the test didn't demand (defer to `PRAG-1`).

**Why:** extra code now is untested code.

### TDD-3 — REFACTOR: clean up on green
1. Tests stay green throughout — change structure, not behavior.
2. Remove duplication (`PRAG-3`); improve names; align with `ARCH`/`SOLID`/`COMP`/`CMP`.
3. Re-run `vitest` **and** `npm run typecheck`.
4. Commit only when both are green.

**Why:** refactoring without a green bar is just editing.

### TDD-4 — Test placement (side-by-side)
**Rule:** A test file MUST sit next to its implementation — `foo.ts` + `foo.test.ts` in the same
folder. No separate `tests/` or `__tests__/` root.
**Why:** co-location keeps a module and its contract together and makes move/delete atomic.

### TDD-5 — One behavior per test
**Rule:** Each `it` asserts one behavior and cites the `spec/` ID under test.
**Why:** multi-assert tests hide which behavior regressed.

> vitest is not yet a devDependency, and `tsconfig.json` `include` is `build/**` only — both must
> broaden when the runtime phase begins.
