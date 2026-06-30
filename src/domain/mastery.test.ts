import { describe, it, expect } from "vitest";
import { promoteOnCuedPass } from "./mastery.js";

describe("SM-4 cued-pass promotion", () => {
  it("promotes Recognized → Productive on a cued pass", () => {
    expect(promoteOnCuedPass("Recognized")).toBe("Productive");
  });

  it("leaves a non-Recognized state unchanged (cued is shown only at Recognized, SM-1)", () => {
    expect(promoteOnCuedPass("Productive")).toBe("Productive");
    expect(promoteOnCuedPass("Seen")).toBe("Seen");
    expect(promoteOnCuedPass("Fluent")).toBe("Fluent");
  });
});
