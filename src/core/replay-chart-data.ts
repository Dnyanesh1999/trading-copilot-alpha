import type {
  CandlestickData,
  HistogramData,
  SeriesMarker,
} from "lightweight-charts";
import type { DailyBar } from "./types";
import { LOOKBACK } from "./historical-replay";

// Muted companions to the workspace palette; red matches .finding-status.deviated.
export const REPLAY_CHART_COLORS = {
  up: "#8cae9d",
  down: "#c9a7a0",
  signal: "#e86f5a",
  broken: "#a22b2b",
  resistance: "#8a83ab",
  stop: "#b47b73",
  target: "#719782",
  volume: "#d7dae1",
  ink: "#5f6675",
} as const;

/** Presentation data only. Never round or mutate the stored price series. */
export function replayChartData(
  bars: DailyBar[],
  plan: { stop?: number | null; target?: number | null },
) {
  if (bars.length !== LOOKBACK + 2)
    throw new Error("Replay chart requires exactly 22 stored bars.");
  const resistanceBar = bars
    .slice(0, LOOKBACK)
    .reduce((highest, bar) => (bar.high > highest.high ? bar : highest));
  const resistance = resistanceBar.high;
  const signal = bars[LOOKBACK];
  const entry = bars[LOOKBACK + 1];
  const signalColor =
    signal.close > resistance
      ? REPLAY_CHART_COLORS.signal
      : REPLAY_CHART_COLORS.broken;
  const candles: CandlestickData<string>[] = bars.map(
    ({ date, open, high, low, close }, index) => ({
      time: date,
      open,
      high,
      low,
      close,
      ...(index === LOOKBACK
        ? {
            color: signalColor,
            borderColor: signalColor,
            wickColor: signalColor,
          }
        : {}),
    }),
  );
  const volume: HistogramData<string>[] = bars.flatMap((bar) =>
    bar.volume === undefined
      ? []
      : [
          {
            time: bar.date,
            value: bar.volume,
            color: REPLAY_CHART_COLORS.volume,
          },
        ],
  );
  const lines = [
    {
      price: resistance,
      title: `Resistance ₹${resistance.toFixed(2)}`,
      color: REPLAY_CHART_COLORS.resistance as string,
    },
  ];
  if (plan.stop != null)
    lines.push({
      price: plan.stop,
      title: `Stop ₹${plan.stop.toFixed(2)}`,
      color: REPLAY_CHART_COLORS.stop,
    });
  if (plan.target != null)
    lines.push({
      price: plan.target,
      title: `Target ₹${plan.target.toFixed(2)}`,
      color: REPLAY_CHART_COLORS.target,
    });
  const markers: SeriesMarker<string>[] = [
    {
      time: resistanceBar.date,
      position: "aboveBar",
      shape: "circle",
      color: REPLAY_CHART_COLORS.resistance,
      text: "20-day high",
    },
    {
      time: signal.date,
      position: "aboveBar",
      shape: "circle",
      color: signalColor,
      text: "Signal close",
    },
    {
      time: entry.date,
      position: "belowBar",
      shape: "arrowUp",
      color: REPLAY_CHART_COLORS.ink,
      text: `Entry ₹${entry.open.toFixed(2)} (open)`,
    },
  ];
  return { candles, volume, lines, markers, resistance, signal, entry };
}

export function replayChartRange(
  start: string,
  end: string,
  includeYear = false,
): string {
  const date = (value: string, year: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  return `${date(start, includeYear && start.slice(0, 4) !== end.slice(0, 4))}–${date(end, includeYear)}`;
}
