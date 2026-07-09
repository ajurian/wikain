/**
 * Shared SettingsStore conformance suite (spec/10 CNT-8). Every implementation MUST pass identically —
 * the executable statement of Liskov substitutability (SOLID-3). With the in-memory adapters removed,
 * the sole implementation is `DrizzleSettings`, run here over pglite; the suite stays a shared contract
 * so a second adapter would be held to the same behavior. Not a `*.test.ts` itself.
 */
import { describe, expect, it } from "vitest";
import type { SettingsStore } from "../../application/ports/settings.js";
import { DEFAULT_USER_SETTINGS } from "../../domain/settings.js";
import { USER_A, USER_B } from "../testIds.js";

export function describeSettingsContract(
  label: string,
  makeStore: () => Promise<SettingsStore>,
): void {
  describe(`SettingsStore contract — ${label}`, () => {
    it("CNT-8: an absent row resolves the defaults", async () => {
      const store = await makeStore();
      expect(await store.read(USER_A)).toEqual(DEFAULT_USER_SETTINGS);
    });

    it("CNT-8: a written setting round-trips", async () => {
      const store = await makeStore();
      await store.write(USER_A, { dailyGoal: 12, timezone: "Asia/Manila" });
      expect(await store.read(USER_A)).toEqual({ dailyGoal: 12, timezone: "Asia/Manila" });
    });

    it("CNT-8: a partial patch merges — unset fields keep their prior value", async () => {
      const store = await makeStore();
      await store.write(USER_A, { dailyGoal: 8 });
      await store.write(USER_A, { timezone: "Europe/Berlin" });
      const s = await store.read(USER_A);
      expect(s.dailyGoal).toBe(8); // retained across the second (partial) write
      expect(s.timezone).toBe("Europe/Berlin");
    });

    it("multi-tenant: user B never sees user A's settings", async () => {
      const store = await makeStore();
      await store.write(USER_A, { dailyGoal: 15 });
      expect(await store.read(USER_B)).toEqual(DEFAULT_USER_SETTINGS);
    });
  });
}
