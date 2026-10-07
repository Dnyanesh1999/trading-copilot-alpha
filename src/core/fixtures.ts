import type {
  Session,
  Execution,
  ConfirmedRules,
  PlanChecks,
  ExampleMode,
} from "./types";
const fill = (
  id: string,
  time: string,
  quantity: number,
  price: number,
): Execution => ({
  id,
  side: "entry",
  timestamp: `2026-09-23T${time}:00+05:30`,
  quantity,
  price,
});
export const DEFAULT_RULES = { maxPositions: 3, cutoff: "11:00" };
export const DEFAULT_CHECKS: PlanChecks = {
  stopBeforeEntry: true,
  maxRisk: 500,
  minRewardRisk: 2,
};
export function createRules(
  maxPositions: number,
  cutoff: string,
  checks?: PlanChecks,
): ConfirmedRules {
  return {
    ...(checks ? { checks: structuredClone(checks) } : {}),
    id: crypto.randomUUID(),
    maxPositions,
    cutoff,
    timezone: "Asia/Kolkata",
    confirmedAt: new Date().toISOString(),
    comparison:
      maxPositions === 3 &&
      cutoff === "11:00" &&
      (!checks ||
        (checks.stopBeforeEntry &&
          checks.maxRisk === 500 &&
          checks.minRewardRisk === 2))
        ? "sample-plan"
        : "hypothetical",
  };
}
export function sampleSession(recordsComplete = true): Session {
  return {
    id: "fictional-2026-09-23",
    date: "2026-09-23",
    recordsComplete,
    positions: [
      {
        id: "A",
        instrument: "SAMPLE-ALPHA",
        firstEntryCovered: true,
        executions: [
          fill("A-entry-01", "09:25", 6, 210),
          fill("A-entry-02", "09:26", 4, 210.5),
        ],
      },
      {
        id: "B",
        instrument: "SAMPLE-BETA",
        firstEntryCovered: true,
        executions: [fill("B-entry-01", "09:48", 10, 325)],
      },
      {
        id: "C",
        instrument: "SAMPLE-GAMMA",
        firstEntryCovered: true,
        executions: [fill("C-entry-01", "10:32", 5, 480)],
      },
      {
        id: "D",
        instrument: "SAMPLE-DELTA",
        firstEntryCovered: true,
        executions: [fill("D-entry-01", "11:20", 8, 150)],
      },
    ],
  };
}
export const FOCUS_LABELS = {
  "entry-check": "Check before entry",
  "daily-limit": "Keep to my daily limit",
  "risk-plan": "Check my risk plan",
  later: "Choose later",
} as const;

// Invented instruments and prices, not historical market data. Keep the legacy fixture above
// for old two-rule saved reviews and regression checks.
export function realisticSession(mode: ExampleMode = "full"): Session {
  const level = (id: string, price: number, time: string) => ({
    id,
    price,
    recordedAt: `2026-09-23T${time}:00+05:30`,
  });
  const exit = (
    id: string,
    time: string,
    quantity: number,
    price: number,
  ): Execution => ({ ...fill(id, time, quantity, price), side: "exit" });
  const session: Session = {
    id: "fictional-equities-v2-2026-09-23",
    date: "2026-09-23",
    exampleMode: mode,
    recordsComplete: mode !== "daily-gap",
    positions: [
      {
        id: "A",
        instrument: "ASTER",
        name: "Aster Motors",
        direction: "long",
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        stop: level("A-stop", 1220, "09:20"),
        target: level("A-target", 1285, "09:20"),
        executions: [
          fill("A-entry-01", "09:25", 6, 1240),
          fill("A-entry-02", "09:26", 4, 1242),
          exit("A-exit", "09:58", 10, 1285),
        ],
      },
      {
        id: "B",
        instrument: "HARBOR",
        name: "Harbor Bank",
        direction: "short",
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        stop: level("B-stop", 875, "10:01"),
        target: level("B-target", 825, "09:44"),
        executions: [
          fill("B-entry-01", "09:48", 20, 860),
          exit("B-exit", "10:20", 20, 850),
        ],
      },
      {
        id: "C",
        instrument: "CEDAR",
        name: "Cedar Tech",
        direction: "long",
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        stop: level("C-stop", 2120, "10:25"),
        target: level("C-target", 2210, "10:25"),
        executions: [
          fill("C-entry-01", "10:32", 8, 2150),
          exit("C-exit", "11:02", 8, 2120),
        ],
      },
      {
        id: "D",
        instrument: "LOTUS",
        name: "Lotus Pharma",
        direction: "long",
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        stop: level("D-stop", 960, "11:15"),
        target: level("D-target", 1008, "11:15"),
        executions: [
          fill("D-entry-01", "11:20", 30, 980),
          exit("D-exit", "12:05", 30, 1004),
        ],
      },
    ],
  };
  if (mode === "plan-gap") {
    session.positions[3].stop = null;
    session.positions[3].target = null;
  }
  return session;
}
