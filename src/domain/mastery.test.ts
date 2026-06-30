import { describe, it, expect } from "vitest";
import { promoteOnCuedPass, demoteOneRung } from "./mastery.js";

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

describe("SM-6 / SM-7 judged-fail demotion", () => {
  it("demotes one rung: Fluent → Productive → Recognized", () => {
    expect(demoteOneRung("Fluent")).toBe("Productive");
    expect(demoteOneRung("Productive")).toBe("Recognized");
  });

  it("SM-7: floors at Recognized — a fail never drops below the form–meaning link", () => {
    expect(demoteOneRung("Recognized")).toBe("Recognized");
    expect(demoteOneRung("Seen")).toBe("Seen");
    expect(demoteOneRung("New")).toBe("New");
  });
});
