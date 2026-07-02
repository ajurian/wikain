/**
 * The authenticated-principal seam (STACK-4). BetterAuth is deferred (PRAG-1), so for now every
 * request acts as a single hardcoded dev user. Server functions call `currentUserId()` rather than
 * reading a userId from the client — when auth lands, only this module changes (the use-cases already
 * take `userId` as a plain string, so nothing downstream moves).
 */
export const DEV_USER_ID = "dev-user";

export function currentUserId(): string {
  return DEV_USER_ID;
}
