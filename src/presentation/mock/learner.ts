/*
 * ============================================================================
 * MOCK DATA — design-time only. TO BE REPLACED.
 * ----------------------------------------------------------------------------
 * Fakes the learner's per-user state (cards, review history, counter, goal —
 * DM-5..7, CNT-*, SM-*) so dashboard/words/settings screens render without a
 * backend. Replace with real server functions when wiring.
 * ============================================================================
 */

export type MasteryState = "New" | "Seen" | "Recognized" | "Productive" | "Fluent";

export interface MockHistoryEntry {
  /** ISO date (calendar day granularity is what SM-5b/CNT-2 care about) */
  date: string;
  tier: "recognition" | "cloze" | "cued" | "free";
  outcome: "pass" | "fail" | "bounce";
  /** mastery transition, if the review moved the ladder */
  moved?: { from: MasteryState; to: MasteryState };
  sentence?: string;
}

export interface MockLearnerWord {
  senseId: string;
  mastery: MasteryState;
  /** live retrievability at "read time" (CNT-3); mocked as a static number */
  retrievability: number;
  /** counted in "words you can use" (CNT-2: ≥2 spaced judged passes AND R ≥ 0.70) */
  counted: boolean;
  judgedPassDays: number;
  dueLabel: "due now" | "due today" | "due tomorrow" | `due in ${number} days`;
  history: MockHistoryEntry[];
}

/** COUNTER_R_FLOOR (spec 00 §3) — mirrored here for meters; replace with real constant. */
export const MOCK_R_FLOOR = 0.7;

export const MOCK_LEARNER = {
  name: "Amihan",
  email: "amihan@example.com",
  /** CNT-8: learner-set, unit = productive uses (sentences) */
  dailyGoal: 5,
  sentencesToday: 2,
  /** the headline counter (CNT-2/3/4) — honest: yesterday it was 134 */
  usableWords: 132,
  usableWordsYesterday: 134,
  levelBand: "B2 · upper-intermediate",
  timezone: "Asia/Manila",
};

export const MOCK_WORDS: MockLearnerWord[] = [
  {
    senseId: "negotiate_verb_01",
    mastery: "Productive",
    retrievability: 0.86,
    counted: true,
    judgedPassDays: 2,
    dueLabel: "due now",
    history: [
      { date: "2026-06-21", tier: "recognition", outcome: "pass" },
      { date: "2026-06-24", tier: "cloze", outcome: "pass", moved: { from: "Seen", to: "Recognized" } },
      { date: "2026-06-27", tier: "cued", outcome: "pass", moved: { from: "Recognized", to: "Productive" } },
      {
        date: "2026-06-29",
        tier: "free",
        outcome: "pass",
        sentence: "I negotiated a later deadline with my manager last week.",
      },
      {
        date: "2026-07-01",
        tier: "free",
        outcome: "pass",
        sentence: "We negotiate the renewal terms every June.",
      },
    ],
  },
  {
    senseId: "advocate_verb_01",
    mastery: "Recognized",
    retrievability: 0.78,
    counted: false,
    judgedPassDays: 0,
    dueLabel: "due now",
    history: [
      { date: "2026-06-28", tier: "recognition", outcome: "pass" },
      { date: "2026-07-01", tier: "cloze", outcome: "pass", moved: { from: "Seen", to: "Recognized" } },
    ],
  },
  {
    senseId: "resilient_adj_01",
    mastery: "Fluent",
    retrievability: 0.91,
    counted: true,
    judgedPassDays: 4,
    dueLabel: "due now",
    history: [
      { date: "2026-05-30", tier: "recognition", outcome: "pass" },
      { date: "2026-06-02", tier: "cloze", outcome: "pass", moved: { from: "Seen", to: "Recognized" } },
      { date: "2026-06-05", tier: "cued", outcome: "pass", moved: { from: "Recognized", to: "Productive" } },
      { date: "2026-06-09", tier: "free", outcome: "pass", sentence: "Our team stayed resilient through the reorg." },
      { date: "2026-06-14", tier: "free", outcome: "pass", sentence: "I try to be resilient when a release slips." },
      {
        date: "2026-06-30",
        tier: "free",
        outcome: "pass",
        moved: { from: "Productive", to: "Fluent" },
        sentence: "Being resilient after criticism is a skill I keep practicing.",
      },
    ],
  },
  {
    senseId: "meticulous_adj_01",
    mastery: "Recognized",
    retrievability: 0.62,
    counted: false,
    judgedPassDays: 1,
    dueLabel: "due now",
    history: [
      { date: "2026-06-10", tier: "recognition", outcome: "pass" },
      { date: "2026-06-13", tier: "cloze", outcome: "pass", moved: { from: "Seen", to: "Recognized" } },
      { date: "2026-06-16", tier: "cued", outcome: "pass", moved: { from: "Recognized", to: "Productive" } },
      {
        date: "2026-06-26",
        tier: "free",
        outcome: "fail",
        moved: { from: "Productive", to: "Recognized" },
        sentence: "The meticulous weather ruined our plans.",
      },
    ],
  },
  {
    senseId: "feasible_adj_01",
    mastery: "Seen",
    retrievability: 0.83,
    counted: false,
    judgedPassDays: 0,
    dueLabel: "due today",
    history: [{ date: "2026-07-01", tier: "recognition", outcome: "pass" }],
  },
  {
    senseId: "allocate_verb_01",
    mastery: "Productive",
    retrievability: 0.67,
    counted: false,
    judgedPassDays: 1,
    dueLabel: "due now",
    history: [
      { date: "2026-06-15", tier: "recognition", outcome: "pass" },
      { date: "2026-06-18", tier: "cloze", outcome: "pass", moved: { from: "Seen", to: "Recognized" } },
      { date: "2026-06-20", tier: "cued", outcome: "pass", moved: { from: "Recognized", to: "Productive" } },
      { date: "2026-06-25", tier: "free", outcome: "pass", sentence: "I allocate my mornings to deep work." },
    ],
  },
  {
    senseId: "coherent_adj_01",
    mastery: "New",
    retrievability: 1,
    counted: false,
    judgedPassDays: 0,
    dueLabel: "due now",
    history: [],
  },
  {
    senseId: "diligent_adj_01",
    mastery: "New",
    retrievability: 1,
    counted: false,
    judgedPassDays: 0,
    dueLabel: "due now",
    history: [],
  },
];

/** Dashboard ladder distribution (SM-1) — derived from a larger imaginary corpus. */
export const MOCK_LADDER = [
  { state: "Seen" as const, count: 14 },
  { state: "Recognized" as const, count: 23 },
  { state: "Productive" as const, count: 61 },
  { state: "Fluent" as const, count: 88 },
];

export const MOCK_QUEUE = {
  dueReviews: 6,
  newIntroductions: 2, // SEED-6 pacing: ≤ ~5/day, ≤30% under backlog
};
