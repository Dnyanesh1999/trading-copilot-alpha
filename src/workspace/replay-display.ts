import { isDemoReplay, DEMO_NOTICE } from "../core/demo-label";
import type { Finding, Position, Session } from "../core/types";
import { rupees, timestampInfo } from "../core/review";

export const replayPrice = (value: number | null | undefined) =>
  value == null ? "missing" : value.toFixed(2);

/** Presentation only: a previous-day stop must not appear later than entry. */
export function replayStopLabel(finding: Finding, position: Position): string {
  if (
    finding.ruleId !== "stop-before-entry" ||
    !finding.label.startsWith("Stop recorded ")
  )
    return finding.label;
  const stop = timestampInfo(position.stop?.recordedAt ?? null);
  const entry = position.executions
    .filter((e) => e.side === "entry")
    .map((e) => timestampInfo(e.timestamp))
    .filter((t) => t !== null)
    .sort((a, b) => a.epoch - b.epoch)[0];
  if (!stop || !entry || stop.day === entry.day) return finding.label;
  const date = (day: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      ...(stop.day.slice(0, 4) !== entry.day.slice(0, 4)
        ? { year: "numeric" as const }
        : {}),
    }).format(new Date(`${day}T00:00:00Z`));
  return `Stop recorded ${date(stop.day)} ${stop.clock} · entry ${date(entry.day)} ${entry.clock} IST`;
}

export function replayName(session: Session): string | null {
  const replay = session.historicalReplay;
  if (!replay) return null;
  return `${isDemoReplay(session) ? DEMO_NOTICE : "Historical replay"} · ${session.positions[0].instrument} · ${session.date} · ${replay.series?.source === "dhan" || replay.priceSource === "dhan" ? "Dhan" : "CSV"}`;
}

export function replayBanner(session: Session): string {
  const replay = session.historicalReplay!;
  const position = session.positions[0];
  const money = (value: number | null | undefined) =>
    value == null ? "missing" : rupees(value);
  return `${isDemoReplay(session) ? DEMO_NOTICE + ". " : ""}Signal: ${timestampInfo(position.signal?.at ?? null)?.day ?? "unknown"} close ${money(position.signal?.close)} vs resistance ${money(position.signal?.reference)} (high on ${replay.resistanceDate}, 20 sessions ${replay.lookbackStart}–${replay.lookbackEnd}). Simulated entry at the ${session.date} open, ${money(position.executions[0]?.price)}.`;
}

/** Display only: retain the engine's finding and unrounded comparison. */
export function replayCalculation(
  finding: Finding,
  position: Position,
): string {
  const signal = position.signal;
  if (
    finding.ruleId !== "setup-entry" ||
    signal?.close == null ||
    signal.reference == null ||
    !["followed", "deviated"].includes(finding.status)
  )
    return finding.calculation;
  return `${replayPrice(signal.close)} ${signal.close > signal.reference ? ">" : "≤"} ${replayPrice(signal.reference)}; signal precedes entry`;
}
