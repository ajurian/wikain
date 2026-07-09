import { describe, it, expect } from "vitest";
import {
  promoteOnCuedPass,
  demoteOneRung,
  promoteOnJudgedPass,
  promoteOnClozePass,
} from "./mastery.js";

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

describe("SM-3 Seen on-ramp cloze-pass promotion", () => {
  it("promotes Seen → Recognized on a passing cloze", () => {
    expect(promoteOnClozePass("Seen", true)).toBe("Recognized");
  });

  it("SM-6: a cloze fail at Seen does not demote or promote (stays Seen)", () => {
    expect(promoteOnClozePass("Seen", false)).toBe("Seen");
  });

  it("leaves a non-Seen state unchanged (cloze on-ramp is shown only at Seen)", () => {
    expect(promoteOnClozePass("Recognized", true)).toBe("Recognized");
    expect(promoteOnClozePass("New", true)).toBe("New");
  });
});

describe("SM-5 judged-pass promotion to Fluent", () => {
  it("promotes Productive → Fluent when the gate qualifies", () => {
    expect(promoteOnJudgedPass("Productive", true)).toBe("Fluent");
  });

  it("leaves Productive unchanged when the gate does not qualify", () => {
    expect(promoteOnJudgedPass("Productive", false)).toBe("Productive");
  });

  it("a Fluent maintenance pass stays Fluent (no promotion above Fluent)", () => {
    expect(promoteOnJudgedPass("Fluent", true)).toBe("Fluent");
  });

  it("never promotes a state below Productive on a judged pass (only Productive promotes)", () => {
    expect(promoteOnJudgedPass("Recognized", true)).toBe("Recognized");
  });
});
