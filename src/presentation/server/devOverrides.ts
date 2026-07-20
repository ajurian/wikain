import { getRequest } from "@tanstack/react-start/server";
import {
  DEV_OVERRIDES_DEFAULT,
  parseDevOverrides,
  readDevOverridesCookie,
  type DevOverrides,
} from "@/lib/devOverrides";

/**
 * The server-side reader for the Dev Tools overrides (replaces the module-load `WIKAIN_DEV_TIER` read).
 * Called per-request inside the dep factories in `composition.ts` — the same composition edge the env
 * pin was resolved at — so a single value is injected into `resolveReviewPrompt`, `runReviewPass`, AND
 * the batch builder, and shown-tier still equals graded-tier.
 *
 * Hard-gated to non-production: in production it returns the neutral default without ever reading a
 * cookie, so a stray `wikain-dev-overrides` cookie cannot pin a real learner's tier or corrupt FSRS.
 * The pure `parseDevOverrides` degrades any malformed value to the default rather than throwing.
 */
export function devOverrides(): DevOverrides {
  if (process.env.NODE_ENV === "production") return DEV_OVERRIDES_DEFAULT;
  const cookie = getRequest().headers.get("cookie");
  return parseDevOverrides(readDevOverridesCookie(cookie));
}
