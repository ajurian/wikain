import { describe, it, expect } from "vitest";
import {
  DEV_OVERRIDES_DEFAULT,
  parseDevOverrides,
  serializeDevOverrides,
  readDevOverridesCookie,
} from "./devOverrides.js";

describe("Dev Tools: devOverrides parse/serialize", () => {
  it("absent/empty cookie → neutral default", () => {
    expect(parseDevOverrides(null)).toEqual(DEV_OVERRIDES_DEFAULT);
    expect(parseDevOverrides("")).toEqual(DEV_OVERRIDES_DEFAULT);
  });

  it("malformed cookie → neutral default (never throws)", () => {
    expect(parseDevOverrides("not-json")).toEqual(DEV_OVERRIDES_DEFAULT);
    expect(parseDevOverrides(encodeURIComponent("[1,2,3]"))).toEqual(DEV_OVERRIDES_DEFAULT);
  });

  it("valid overrides round-trip", () => {
    const o = { tier: "cloze" as const, includeNotDue: true, freezeFsrs: false };
    expect(parseDevOverrides(serializeDevOverrides(o))).toEqual(o);
  });

  it("unknown tier is dropped, booleans preserved", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ tier: "bogus", includeNotDue: true, freezeFsrs: true }),
    );
    expect(parseDevOverrides(raw)).toEqual({ includeNotDue: true, freezeFsrs: true });
  });

  it("serialize omits defaults (compact cookie)", () => {
    expect(serializeDevOverrides(DEV_OVERRIDES_DEFAULT)).toBe(
      encodeURIComponent("{}"),
    );
  });

  it("readDevOverridesCookie extracts the value from a Cookie header", () => {
    const val = serializeDevOverrides({ tier: "free", includeNotDue: false, freezeFsrs: false });
    const header = `wikain-theme=dark; wikain-dev-overrides=${val}; other=1`;
    expect(readDevOverridesCookie(header)).toBe(val);
    expect(readDevOverridesCookie("only-other=1")).toBeNull();
    expect(readDevOverridesCookie(null)).toBeNull();
  });
});
