/*
 * DEV-ONLY runtime overrides, the shared spine of the Dev Tools panel (replaces the `WIKAIN_DEV_TIER`
 * env pin). The panel writes a `wikain-dev-overrides` cookie client-side; the server reads it per-request
 * at the composition edge (`server/devOverrides.ts`) and injects the result into the same three
 * use-cases the env var fed — so shown-tier still equals graded-tier, but the value now changes live
 * with no dev-server restart.
 *
 * This module is pure (parse/serialize/type) so both sides share ONE definition and cannot drift. It
 * NEVER throws on bad input: an unknown tier or malformed cookie degrades to the neutral default rather
 * than crashing the app — a dev tool must never be able to take the whole page down.
 */
import type { ReviewTier } from "~/domain/review/review.js";

export const DEV_OVERRIDES_COOKIE = "wikain-dev-overrides";

export interface DevOverrides {
  /** The pinned review tier, or `undefined` for `auto` (the real `resolveReviewTier` router decides). */
  tier?: ReviewTier;
  /** "Show cards even when not due" — bypasses the `orderSessionQueue` due filter. */
  includeNotDue: boolean;
  /** "Freeze FSRS scheduling" — the card's schedule does not advance on grade (stays due). */
  freezeFsrs: boolean;
}

export const DEV_OVERRIDES_DEFAULT: DevOverrides = {
  includeNotDue: false,
  freezeFsrs: false,
};

const TIERS: readonly ReviewTier[] = ["recognition", "cloze", "cued", "free"];

function isTier(v: unknown): v is ReviewTier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

/** Parse a (url-encoded) cookie value into overrides; any bad/absent input → the neutral default. */
export function parseDevOverrides(raw: string | null | undefined): DevOverrides {
  if (!raw) return DEV_OVERRIDES_DEFAULT;
  let obj: unknown;
  try {
    obj = JSON.parse(decodeURIComponent(raw));
  } catch {
    return DEV_OVERRIDES_DEFAULT;
  }
  if (typeof obj !== "object" || obj === null) return DEV_OVERRIDES_DEFAULT;
  const o = obj as Record<string, unknown>;
  return {
    ...(isTier(o.tier) ? { tier: o.tier } : {}),
    includeNotDue: o.includeNotDue === true,
    freezeFsrs: o.freezeFsrs === true,
  };
}

/** Serialize to a compact url-encoded cookie value, omitting everything left at its default. */
export function serializeDevOverrides(o: DevOverrides): string {
  const payload: Record<string, unknown> = {};
  if (o.tier) payload.tier = o.tier;
  if (o.includeNotDue) payload.includeNotDue = true;
  if (o.freezeFsrs) payload.freezeFsrs = true;
  return encodeURIComponent(JSON.stringify(payload));
}

/** Pull the override cookie's raw value out of a `Cookie:` header (or `document.cookie`); null if absent. */
export function readDevOverridesCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp("(?:^|;\\s*)" + DEV_OVERRIDES_COOKIE + "=([^;]+)"),
  );
  return match?.[1] ?? null;
}
