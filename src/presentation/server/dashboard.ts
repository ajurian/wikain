import { createServerFn } from "@tanstack/react-start";
import {
  readDashboardSummary,
  type ReadDashboardSummaryResult,
} from "../../application/readDashboardSummary.js";
import { currentUserId } from "./currentUser.js";
import { dashboardDeps } from "./composition.js";

/**
 * The dashboard read-model for the current (dev) user (spec/01 SM-1 ladder, spec/10 CNT-8 goal, SEED-6
 * pacing). A pure read: it reduces the persisted cards + ReviewLogs to the mastery distribution, the
 * due count, the new-intro allowance, and today's judged uses — no writes, no rating, no scheduling.
 * DB access stays server-side (NET-7/STACK-3); only the serializable summary crosses to the client.
 */
export const dashboardSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReadDashboardSummaryResult> =>
    readDashboardSummary({ userId: await currentUserId() }, dashboardDeps()),
);
