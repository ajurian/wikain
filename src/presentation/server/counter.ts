import { createServerFn } from "@tanstack/react-start";
import {
  readUsableCounter,
  type UsableCounterResult,
} from "../../application/readUsableCounter.js";
import { readSettings } from "../../application/readSettings.js";
import { utcOffsetMinutesFor } from "../../domain/timezone.js";
import { currentUserId } from "./currentUser.js";
import { counterDeps, settingsDeps } from "./composition.js";

/**
 * The "words you can now use" counter for the current (dev) user (spec/10 CNT-2/3/4/6). A pure read:
 * it reduces the persisted ReviewLogs to spaced judged passes and reads live retrievability, so the
 * number ticks down honestly between reviews (CNT-4) — no writes, no rating, no scheduling. The day
 * boundary (CNT-2) is the learner's own: the persisted IANA timezone → the instant's UTC offset. DB
 * access stays server-side (NET-7/STACK-3); only the `{ count, senseIds }` result crosses to the client.
 */
export const usableCounterFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsableCounterResult> => {
    const userId = await currentUserId();
    const now = new Date();
    const { timezone } = await readSettings({ userId }, settingsDeps());
    return readUsableCounter(
      { userId, now, utcOffsetMinutes: utcOffsetMinutesFor(timezone, now) },
      counterDeps(),
    );
  },
);
