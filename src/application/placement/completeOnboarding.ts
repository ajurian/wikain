import type { PlacementProfileStore } from "../ports/placementProfile.js";

export interface CompleteOnboardingInput {
  userId: string;
  /** Defaults to `new Date()`; injectable for deterministic tests. */
  now?: Date;
}

export interface CompleteOnboardingDeps {
  profile: PlacementProfileStore;
}

/**
 * Stamp the end of the learner's first session (spec/09 SEED-1) — the single fact the `_onboarded` route
 * guard reads. It must be an explicit write: "has cards" cannot stand in for it, because seeding happens
 * mid-flow (before the production win), so a user who abandons at the first-win screen would otherwise be
 * treated as placed and never see the tune step.
 *
 * Idempotent by *keeping the first* instant: a re-run is a no-op rather than a re-stamp, so a double-click
 * or a retried request can't make a returning user look freshly onboarded.
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
  deps: CompleteOnboardingDeps,
): Promise<void> {
  const current = await deps.profile.read(input.userId);
  if (current.onboardedAt !== null) return;
  await deps.profile.write(input.userId, { onboardedAt: input.now ?? new Date() });
}
