import type { ConfirmedRules, Position, RuleId, Session } from "./types";
import {
  priceMetrics,
  reviewSession,
  timestampInfo,
  validRules,
} from "./review";
import { initialLevelErrors, stopDeclarations } from "./stop-record";

export interface StrategyDraft {
  setup?: ConfirmedRules["setup"];
  name: string;
  description: string;
  style: "intraday" | "swing";
  maxPositions: number;
  cutoff: string;
  stopBeforeEntry: boolean;
  maxRisk: number;
  minRewardRisk: number;
  enabledRules: RuleId[];
}
export const defaultStrategy: StrategyDraft = {
  name: "My swing strategy",
  description: "",
  style: "swing",
  maxPositions: 3,
  cutoff: "11:00",
  stopBeforeEntry: true,
  maxRisk: 500,
  minRewardRisk: 2,
  enabledRules: ["stop-before-entry", "planned-risk", "reward-risk"],
};
export function confirmStrategy(draft: StrategyDraft): ConfirmedRules {
  if (!draft.name.trim()) throw new Error("Give your strategy a name.");
  if (!["intraday", "swing"].includes(draft.style))
    throw new Error("Choose a trading style.");
  const maxPositions = draft.enabledRules.includes("daily-limit")
    ? draft.maxPositions
    : 3;
  const cutoff = draft.enabledRules.includes("entry-cutoff")
    ? draft.cutoff
    : "11:00";
  if (!validRules(maxPositions, cutoff))
    throw new Error("Use a daily limit from 1 to 50 and a valid IST cutoff.");
  const rules: ConfirmedRules = {
    ...(draft.setup ? { setup: structuredClone(draft.setup) } : {}),
    id: crypto.randomUUID(),
    confirmedAt: new Date().toISOString(),
    comparison: "hypothetical",
    timezone: "Asia/Kolkata",
    maxPositions,
    cutoff,
    enabledRules: [...draft.enabledRules],
    checks: {
      stopBeforeEntry:
        draft.enabledRules.includes("stop-before-entry") &&
        draft.stopBeforeEntry,
      maxRisk: draft.enabledRules.includes("planned-risk")
        ? draft.maxRisk
        : null,
      minRewardRisk: draft.enabledRules.includes("reward-risk")
        ? draft.minRewardRisk
        : null,
    },
  };
  reviewSession(rules, {
    id: "validation",
    date: "",
    recordsComplete: false,
    positions: [],
  });
  return rules;
}
export interface TradeDraft {
  stopDeclaration: "" | NonNullable<Position["stopDeclaration"]>;
  planTimeUnknown: string;
  instrument: string;
  direction: "long" | "short";
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  stopPrice: string;
  targetPrice: string;
  enteredAt: string;
  exitedAt: string;
  planRecordedAt: string;
}
export const defaultTrade: TradeDraft = {
  stopDeclaration: "",
  planTimeUnknown: "",
  instrument: "",
  direction: "long",
  quantity: "",
  entryPrice: "",
  exitPrice: "",
  stopPrice: "",
  targetPrice: "",
  enteredAt: "",
  exitedAt: "",
  planRecordedAt: "",
};
function positive(value: string, label: string): number {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number <= 0)
    throw new Error(`${label} must be a positive number.`);
  return number;
}
function ist(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw new Error(`${label} needs a valid date and time in IST.`);
  const timestamp = `${value.length === 16 ? `${value}:00` : value}+05:30`;
  if (!timestampInfo(timestamp))
    throw new Error(`${label} needs a valid date and time in IST.`);
  return timestamp;
}
export class TradeInputError extends Error {
  constructor(
    message: string,
    public tradeIndex: number,
    public field: keyof TradeDraft,
  ) {
    super(message);
  }
}
export function correctStopRecord(
  position: Position,
  declaration: TradeDraft["stopDeclaration"],
  price: string,
  recordedAt: string,
  timeUnknown: boolean,
): Position {
  if (
    !stopDeclarations.includes(
      declaration as NonNullable<Position["stopDeclaration"]>,
    )
  )
    throw new Error("Choose Had a stop, No stop or Not recorded.");
  if (declaration !== "had-stop")
    return {
      ...position,
      stopDeclaration: declaration,
      stop: null,
    } as Position;
  const stop = positive(price, "Initial stop price");
  const filled = priceMetrics(position);
  if (!filled || !position.direction)
    throw new Error(
      "Complete initial entry records are needed to correct the stop.",
    );
  const issue = initialLevelErrors(position.direction, filled.price, stop).stop;
  if (issue) throw new Error(issue);
  if (!recordedAt && !timeUnknown)
    throw new Error(
      "Enter the stop recording time or explicitly mark it unknown.",
    );
  return {
    ...position,
    stopDeclaration: "had-stop",
    stop: {
      id: position.stop?.id ?? `${position.id}-stop`,
      price: stop,
      recordedAt: timeUnknown ? null : ist(recordedAt, "Stop recording"),
    },
  };
}
export function tradesToSession(
  trades: TradeDraft[],
  recordsComplete: boolean,
): Session {
  if (!trades.length) throw new Error("Add at least one trade to review.");
  if (typeof recordsComplete !== "boolean")
    throw new Error("Confirm whether your entry records are complete.");
  const positions = trades.map((trade, index) => {
    const prefix = `Trade ${index + 1}`;
    const instrument = trade.instrument.trim();
    if (!instrument) throw new Error(`${prefix}: enter an instrument.`);
    if (!["long", "short"].includes(trade.direction))
      throw new Error(`${prefix}: choose long or short.`);
    const quantity = positive(trade.quantity, `${prefix} quantity`);
    const price = positive(trade.entryPrice, `${prefix} entry price`);
    const fail = (field: keyof TradeDraft, message: string): never => {
      throw new TradeInputError(`${prefix}: ${message}`, index, field);
    };
    if (
      !stopDeclarations.includes(
        trade.stopDeclaration as NonNullable<Position["stopDeclaration"]>,
      )
    )
      fail("stopDeclaration", "choose Had a stop, No stop or Not recorded.");
    if (trade.stopDeclaration === "had-stop" && !trade.stopPrice.trim())
      fail("stopPrice", "enter the initial stop price.");
    if (trade.stopDeclaration !== "had-stop" && trade.stopPrice.trim())
      fail("stopPrice", "a stop price requires Had a stop.");
    let stopPrice: number | null = null;
    let targetPrice: number | null = null;
    if (trade.stopPrice.trim()) {
      try {
        stopPrice = positive(trade.stopPrice, `${prefix} stop price`);
      } catch {
        fail("stopPrice", "initial stop price must be a positive number.");
      }
    }
    if (trade.targetPrice.trim()) {
      try {
        targetPrice = positive(trade.targetPrice, `${prefix} target price`);
      } catch {
        fail("targetPrice", "initial target price must be a positive number.");
      }
    }
    const levels = initialLevelErrors(
      trade.direction,
      price,
      stopPrice,
      targetPrice,
    );
    if (levels.stop) fail("stopPrice", levels.stop);
    if (levels.target) fail("targetPrice", levels.target);
    if (
      (trade.stopPrice.trim() || trade.targetPrice.trim()) &&
      !trade.planRecordedAt.trim() &&
      trade.planTimeUnknown !== "yes"
    )
      fail(
        "planRecordedAt",
        "enter the plan recording time or explicitly mark it unknown.",
      );
    const timestamp = ist(trade.enteredAt, `${prefix} entry`);
    const id = crypto.randomUUID();
    const executions: Session["positions"][number]["executions"] = [
      { id: `${id}-entry`, side: "entry", quantity, price, timestamp },
    ];
    const hasExit = !!trade.exitPrice.trim() || !!trade.exitedAt.trim();
    if (hasExit) {
      const exitPrice = positive(trade.exitPrice, `${prefix} exit price`);
      const exitTime = ist(trade.exitedAt, `${prefix} exit`);
      if (Date.parse(exitTime) < Date.parse(timestamp))
        throw new Error(`${prefix}: exit cannot be before entry.`);
      executions.push({
        id: `${id}-exit`,
        side: "exit",
        quantity,
        price: exitPrice,
        timestamp: exitTime,
      });
    }
    const recordedAt =
      trade.planTimeUnknown === "yes"
        ? null
        : trade.planRecordedAt.trim()
          ? ist(trade.planRecordedAt, `${prefix} plan recording`)
          : null;
    return {
      id,
      instrument,
      stopDeclaration: trade.stopDeclaration as NonNullable<
        Position["stopDeclaration"]
      >,
      direction: trade.direction,
      firstEntryCovered: true,
      allEntriesCovered: true,
      executionsComplete: hasExit,
      executions,
      stop: trade.stopPrice.trim()
        ? {
            id: `${id}-stop`,
            price: stopPrice!,
            recordedAt,
          }
        : null,
      target: trade.targetPrice.trim()
        ? {
            id: `${id}-target`,
            price: targetPrice!,
            recordedAt,
          }
        : null,
    };
  });
  return {
    id: crypto.randomUUID(),
    date: trades[0].enteredAt.slice(0, 10),
    recordsComplete,
    positions,
  };
}
