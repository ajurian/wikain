import { describe, expect, it } from "vitest";
import { updateSettings } from "./updateSettings.js";
import { readSettings } from "./readSettings.js";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../domain/settings.js";
import type { SettingsStore } from "./ports/settings.js";

const USER = "u1";

/** A minimal inline SettingsStore double (Map-backed) — the persistence contract is covered by
 * settingsContract.ts over the real adapter; here we exercise only the use-case guard/merge. */
function fakeStore(): SettingsStore {
  const rows = new Map<string, UserSettings>();
  return {
    async read(userId) {
      return rows.get(userId) ?? { ...DEFAULT_USER_SETTINGS };
    },
    async write(userId, patch) {
      rows.set(userId, { ...(rows.get(userId) ?? DEFAULT_USER_SETTINGS), ...patch });
    },
  };
}

describe("updateSettings (CNT-8)", () => {
  it("CNT-8: persists an in-range daily goal", async () => {
    const settings = fakeStore();
    await updateSettings({ userId: USER, patch: { dailyGoal: 7 } }, { settings });
    expect((await readSettings({ userId: USER }, { settings })).dailyGoal).toBe(7);
  });

  it("CNT-8: rejects a daily goal above the max (no write)", async () => {
    const settings = fakeStore();
    await expect(
      updateSettings({ userId: USER, patch: { dailyGoal: 21 } }, { settings }),
    ).rejects.toThrow(RangeError);
    expect((await readSettings({ userId: USER }, { settings })).dailyGoal).toBe(
      DEFAULT_USER_SETTINGS.dailyGoal,
    );
  });

  it("CNT-8: rejects a non-integer daily goal", async () => {
    const settings = fakeStore();
    await expect(
      updateSettings({ userId: USER, patch: { dailyGoal: 3.5 } }, { settings }),
    ).rejects.toThrow(RangeError);
  });

  it("CNT-8: a patch without dailyGoal skips the guard and writes", async () => {
    const settings = fakeStore();
    await updateSettings({ userId: USER, patch: { timezone: "Asia/Manila" } }, { settings });
    expect((await readSettings({ userId: USER }, { settings })).timezone).toBe("Asia/Manila");
  });
});
