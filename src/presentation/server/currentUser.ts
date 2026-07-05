import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./composition.js";

/**
 * The authenticated-principal seam (STACK-4). Every server function resolves its `userId` here rather
 * than trusting a client-supplied id: it reads the request's session cookie, asks BetterAuth for the
 * session, and returns the real `user.id` (a uuid). No session → a 401 `Response` (server functions
 * surface a thrown `Response` as the HTTP result). The use-cases downstream still take a plain
 * `userId: string`, so this is the ONLY module that knows about auth.
 */
export async function currentUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session.user.id;
}
