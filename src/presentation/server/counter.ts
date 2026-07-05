import { createServerFn } from "@tanstack/react-start";
import {
  readUsableCounter,
  type UsableCounterResult,
} from "../../application/readUsableCounter.js";
import { currentUserId } from "./currentUser.js";
import { counterDeps } from "./composition.js";

/**
 * The "words you can now use" counter for the current (dev) user (spec/10 CNT-2/3/4/6). A pure read:
 * it reduces the persisted ReviewLogs to spaced judged passes and reads live retrievability, so the
 * number ticks down honestly between reviews (CNT-4) — no writes, no rating, no scheduling. DB access
 * stays server-side (NET-7/STACK-3); only the `{ count, senseIds }` result crosses to the client.
 */
export const usableCounterFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsableCounterResult> =>
    readUsableCounter({ userId: await currentUserId() }, counterDeps()),
);
