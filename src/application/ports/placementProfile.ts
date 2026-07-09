import type { PlacementProfile } from "../../domain/placement/placementProfile.js";

/**
 * The per-user placement profile store (spec/09 SEED-1/2/4, ARCH-3). Narrow by intent (SOLID-4): the
 * onboarding flow writes a partial patch as each step resolves; the session start and `/settings` read the
 * whole object. Scoped by `userId` — a profile is never shared across accounts (multi-tenant).
 *
 * Deliberately separate from `SettingsStore` even though the shape rhymes: the two answer to different
 * actors (SOLID-1), and `onboardedAt` is a lifecycle gate that must not sit on a client-writable
 * preferences patch. Cf. `PlacementMarksStore` — the OTHER placement mechanism (SEED-2), kept apart too.
 *
 * `read` always resolves a COMPLETE `PlacementProfile`, filling absent fields from
 * `DEFAULT_PLACEMENT_PROFILE`, so a consumer never sees a missing row. `write` merges the patch onto the
 * current (default-seeded) profile and upserts.
 */
export interface PlacementProfileStore {
  read(userId: string): Promise<PlacementProfile>;
  write(userId: string, patch: Partial<PlacementProfile>): Promise<void>;
}
