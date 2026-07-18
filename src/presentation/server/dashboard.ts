import { createServerFn } from "@tanstack/react-start";
import {
  readDashboardSummary,
  type ReadDashboardSummaryResult,
} from "~/application/progress/readDashboardSummary.js";
import { readSettings } from "~/application/readSettings.js";
import { readPlacementProfile } from "~/application/placement/readPlacementProfile.js";
import { utcOffsetMinutesFor } from "~/domain/timezone.js";
import { currentUserId } from "./currentUser.js";
import { dashboardDeps, placementProfileDeps, settingsDeps } from "./composition.js";

/**
 * The dashboard read-model for the current (dev) user (spec/01 SM-1 ladder, spec/10 CNT-8 goal, SEED-6
 * pacing). A pure read: it reduces the persisted cards + ReviewLogs to the mastery distribution, the
 * due count, the new-intro allowance, and today's judged uses — no writes, no rating, no scheduling.
 * "Today" (CNT-8) follows the learner's own clock: the persisted IANA timezone → the instant's UTC
 * offset. DB access stays server-side (NET-7/STACK-3); only the serializable summary crosses to the client.
 */
export const dashboardSummaryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReadDashboardSummaryResult> => {
    const userId = await currentUserId();
    const now = new Date();
    const { timezone } = await readSettings({ userId }, settingsDeps());
    // SEED-2: the band the next build would seed at — the "new" count is computed against it (same
    // frontier band the review path resolves in `sessionContext`).
    const { frontierBand } = await readPlacementProfile({ userId }, placementProfileDeps());
    return readDashboardSummary(
      { userId, frontierBand, now, utcOffsetMinutes: utcOffsetMinutesFor(timezone, now) },
      dashboardDeps(),
    );
  },
);
