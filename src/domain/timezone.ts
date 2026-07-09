/**
 * Timezone helpers for the "separate calendar days" boundary (spec/01 SM-5b, spec/10 CNT-2). Pure —
 * they use only the JS built-in `Intl`, no I/O — so they stay in the domain (ARCH-1). The offset is
 * computed for a specific instant, so it is correct across DST transitions (a fixed number would drift
 * twice a year). The sign convention matches `judgedPassLedger.localDayKey`: minutes to ADD to UTC to
 * reach local wall-clock time — positive east of UTC (Asia/Manila → +480).
 */

/** True if `zone` is an IANA timezone this runtime's `Intl` data recognizes (e.g. "Asia/Manila", "UTC"). */
export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    // Constructing a formatter with an unknown timeZone throws a RangeError.
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Minutes to add to UTC to get local wall-clock time in `zone` at instant `at`. Technique: read the
 * instant's wall-clock components in `zone`, reinterpret them as if they were UTC, and diff against the
 * instant — the gap is the offset. Throws (via the formatter) if `zone` is not a valid IANA zone.
 */
export function utcOffsetMinutesFor(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const field = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}
