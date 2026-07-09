import { describe, expect, it } from "vitest";
import { isValidTimeZone, utcOffsetMinutesFor } from "./timezone.js";

describe("timezone (spec/01 SM-5b, spec/10 CNT-2 day boundary)", () => {
  it("CNT-2: UTC is a zero offset", () => {
    expect(utcOffsetMinutesFor("UTC", new Date("2026-07-01T00:00:00Z"))).toBe(0);
  });

  it("CNT-2: a fixed-offset zone east of UTC is positive (Asia/Manila = +480, no DST)", () => {
    expect(utcOffsetMinutesFor("Asia/Manila", new Date("2026-07-01T00:00:00Z"))).toBe(480);
    expect(utcOffsetMinutesFor("Asia/Manila", new Date("2026-01-01T00:00:00Z"))).toBe(480);
  });

  it("CNT-2: a zone west of UTC is negative (America/New_York = -300 in winter)", () => {
    expect(utcOffsetMinutesFor("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
  });

  it("CNT-2: the offset is instant-specific across a DST transition (New York -300 winter, -240 summer)", () => {
    expect(utcOffsetMinutesFor("America/New_York", new Date("2026-07-15T12:00:00Z"))).toBe(-240);
  });

  it("SM-5b: a recognized IANA zone validates; junk does not", () => {
    expect(isValidTimeZone("Asia/Manila")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
