/**
 * DeepSeek judge configuration (spec/06 JDG-10, spec/08 NET-7). Sourced from the environment at the
 * composition root so the API key stays server-side (NET-7: the key MUST NOT reach the client) and the
 * adapter receives config as plain data — no `process.env` read inside the adapter, keeping it testable.
 */
import { CLOUD_RETRY_COUNT } from "../domain/constants.js";

export interface DeepSeekConfig {
  /** NET-7: secret, server-side only — never sent to the client. */
  apiKey: string;
  /** JDG-10: DeepSeek HTTPS base URL (no trailing slash). */
  baseUrl: string;
  /** JDG-10: the live judge model id. */
  model: string;
  /** NET-3: per-attempt timeout; an overrun aborts the request and is treated as a transient failure. */
  timeoutMs: number;
  /** NET-3: retries after the first attempt on a transient/offline/rate-limit failure. */
  retryCount: number;
  /** NET-3: base backoff between attempts (multiplied by attempt #); injectable to 0 in tests. */
  backoffMs: number;
}

/**
 * Build the config from environment variables (NET-7). `DEEPSEEK_API_KEY` is required and unset is a
 * hard error (fail loud rather than silently produce a mis-authenticated adapter). The model id
 * defaults to the JDG-10 model; endpoint/timeout/backoff have sensible defaults overridable per deploy.
 */
export function deepSeekConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set (NET-7: the judge key is server-side and required)");
  }
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: env.DEEPSEEK_MODEL ?? "deepseek-v4-flash", // JDG-10
    timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS ?? 20_000),
    retryCount: CLOUD_RETRY_COUNT, // NET-3
    backoffMs: Number(env.DEEPSEEK_BACKOFF_MS ?? 500),
  };
}
