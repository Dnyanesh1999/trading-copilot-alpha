import type { RuleId, Session, SetupKind } from "./types";
export interface StrategyPreset {
  kind: SetupKind;
  id: SetupKind;
  title: string;
  style: "swing" | "intraday";
  description: string;
  explanation: string;
  referenceLabel: string;
  defaultEnabledRules: RuleId[];
  defaultMaxPositions: number;
  defaultCutoff: string;
  defaultMaxRisk: number;
  defaultMinRewardRisk: number;
}
const risk: RuleId[] = ["stop-before-entry", "planned-risk", "reward-risk"];
export const strategyPresets: StrategyPreset[] = [
  {
    kind: "breakout",
    id: "breakout",
    title: "Resistance breakout",
    style: "swing",
    description:
      "For long positions, wait for a documented closing price above resistance, then enter after the signal. Record stop and target before entry. Keep planned risk at or below ₹500 and reward-to-risk at least 2R.",
    explanation:
      "Checks your supplied signal close against your documented resistance. It does not detect resistance, verify a market breakout, or recommend an entry.",
    referenceLabel: "Documented resistance",
    defaultEnabledRules: [...risk],
    defaultMaxPositions: 3,
    defaultCutoff: "11:00",
    defaultMaxRisk: 500,
    defaultMinRewardRisk: 2,
  },
  {
    kind: "ma-reclaim",
    id: "ma-reclaim",
    title: "20-period MA reclaim",
    style: "swing",
    description:
      "For long positions, use two completed candles on the same timeframe: the previous close must be at or below its 20-period simple moving average (SMA) and the signal close above its 20-period SMA. Enter after that signal. Record stop and target before entry, risk at most ₹500 and require at least 2R.",
    explanation:
      "Checks the two close/reference pairs you provide. Supply the 20-period SMA values for two completed candles on the same timeframe; this app does not compute or independently validate them.",
    referenceLabel: "Signal 20-period SMA",
    defaultEnabledRules: [...risk],
    defaultMaxPositions: 3,
    defaultCutoff: "11:00",
    defaultMaxRisk: 500,
    defaultMinRewardRisk: 2,
  },
  {
    kind: "opening-range",
    id: "opening-range",
    title: "Opening-range breakout",
    style: "intraday",
    description:
      "For long positions, record the 09:15–09:30 IST range high. After that range closes, require a signal close above it and enter strictly after the signal, before 11:00 IST. At most 3 new positions per day, ₹500 planned risk and at least 2R.",
    explanation:
      "Uses a fixed 09:15–09:30 IST range supplied by you, not live market data. The signal must be at or after 09:30 and strictly before entry.",
    referenceLabel: "09:15–09:30 IST range high",
    defaultEnabledRules: ["daily-limit", "entry-cutoff", ...risk],
    defaultMaxPositions: 3,
    defaultCutoff: "11:00",
    defaultMaxRisk: 500,
    defaultMinRewardRisk: 2,
  },
];
/** Deterministic teaching fixtures, not market observations or experiment results. */
export function createPresetSession(kind: SetupKind): Session {
  if (!strategyPresets.some((p) => p.kind === kind))
    throw new Error("Unknown strategy example.");
  return {
    id: `synthetic-${kind}`,
    dataSource: "fictional",
    date: "2026-10-15",
    recordsComplete: true,
    positions: [0, 1, 2, 3].map((index) => {
      const id = `${kind}-${index + 1}`;
      const clock = ["09:40", "09:50", "10:00", "10:10"][index];
      const at = (time: string) => `2026-10-15T${time}:00+05:30`;
      const base = 100 + index * 50;
      return {
        id,
        name: [
          "Fictional setup followed · gain",
          "Fictional setup followed · loss",
          "Fictional entry / sizing mismatch",
          "Fictional signal missing",
        ][index],
        instrument: `DEMO-${["ALPHA", "BETA", "GAMMA", "DELTA"][index]}`,
        direction: "long" as const,
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        stop: {
          id: `${id}-stop`,
          price: base - 5,
          recordedAt: index === 3 ? null : at("09:31"),
        },
        target: {
          id: `${id}-target`,
          price: base + 10,
          recordedAt: index === 3 ? null : at("09:31"),
        },
        signal: {
          at:
            index === 3
              ? null
              : kind === "opening-range"
                ? at("09:35")
                : "2026-10-14T15:30:00+05:30",
          close: index === 2 ? base - 3 : base - 1,
          reference: base - 2,
          previousClose: base - 4,
          previousReference: base - 3,
          rangeEnd: kind === "opening-range" ? at("09:30") : null,
        },
        executions: [
          {
            id: `${id}-entry`,
            side: "entry" as const,
            timestamp: at(clock),
            quantity: index === 2 ? 120 : 20,
            price: base,
          },
          {
            id: `${id}-exit`,
            side: "exit" as const,
            timestamp:
              kind === "opening-range"
                ? at("14:00")
                : "2026-10-19T14:00:00+05:30",
            quantity: index === 2 ? 120 : 20,
            price: index === 1 ? base - 5 : base + 10,
          },
        ],
      };
    }),
  };
}
