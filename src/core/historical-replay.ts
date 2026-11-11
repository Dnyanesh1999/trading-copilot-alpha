import { readRows } from "./trade-csv";
import type { DailyBar, ReplaySeries, Session } from "./types";
import { hashReplayBars } from "./replay-evidence";
export type { DailyBar } from "./types";

export const LOOKBACK = 20;

export function isSessionDate(date: string) {
  const time = Date.parse(date);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
  );
}

export function validDailyPrices({ open, high, low, close, volume }: DailyBar) {
  return (
    [open, high, low, close].every(
      (price) => Number.isFinite(price) && price > 0,
    ) &&
    low <= Math.min(open, close) &&
    high >= Math.max(open, close) &&
    (volume === undefined || (Number.isFinite(volume) && volume >= 0))
  );
}

/** Calendar coverage of the rows actually used; no exchange-holiday model. */
export function replayCoverage(bars: DailyBar[]): number {
  let maxGapDays = 0;
  for (const [index, bar] of bars.entries()) {
    if (!isSessionDate(bar.date) || !validDailyPrices(bar))
      throw new Error(`Invalid daily prices for ${bar.date}.`);
    const weekday = new Date(bar.date).getUTCDay();
    if (weekday === 0 || weekday === 6)
      throw new Error(
        `Prices include a weekend row on ${bar.date}. Use weekday daily sessions.`,
      );
    if (index === 0) continue;
    const previous = bars[index - 1].date;
    const gap = (Date.parse(bar.date) - Date.parse(previous)) / 86_400_000;
    if (gap <= 0) throw new Error("Use unique daily rows in date order.");
    if (gap > 5)
      throw new Error(
        `Prices are missing between ${previous} and ${bar.date}. Use a complete daily series.`,
      );
    maxGapDays = Math.max(maxGapDays, gap);
  }
  return maxGapDays;
}

/** A single INR equity series with consistent OHLC prices and ISO session dates. */
export function parseDailyBars(text: string): DailyBar[] {
  const [header, ...rows] = readRows(
    text.replace(/^\uFEFF/, ""),
    10_000,
    "market",
  );
  const columns = header?.map((name) => name.trim().toLowerCase()) ?? [];
  const required = ["date", "open", "high", "low", "close"];
  const indexes = required.map((name) => columns.indexOf(name));
  const volumeIndex = columns.indexOf("volume");
  if (indexes.includes(-1) || new Set(columns).size !== columns.length)
    throw new Error(
      "Use a CSV with distinct date, open, high, low and close columns.",
    );

  const bars: DailyBar[] = [];
  const dates = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (row.every((value) => !value.trim())) continue;
    const [date, ...prices] = indexes.map((index) => row[index]?.trim() ?? "");
    const [open, high, low, close] = prices.map(Number);
    const volume = volumeIndex < 0 ? "" : (row[volumeIndex]?.trim() ?? "");
    const bar: DailyBar = {
      date,
      open,
      high,
      low,
      close,
      ...(volume ? { volume: Number(volume) } : {}),
    };
    if (
      row.length !== columns.length ||
      !isSessionDate(date) ||
      dates.has(date) ||
      prices.some((value) => !/^\d+(\.\d+)?$/.test(value)) ||
      (volume !== "" && !/^\d+(\.\d+)?$/.test(volume)) ||
      !validDailyPrices(bar)
    )
      throw new Error(
        `CSV row ${i + 2}: check the unique ISO date, OHLC prices and optional non-negative volume.`,
      );
    dates.add(date);
    bars.push(bar);
  }
  if (bars.length < LOOKBACK + 2)
    throw new Error(
      "Add at least 22 daily rows for the 20-day lookback, signal and entry.",
    );
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function createHistoricalReplay(
  bars: DailyBar[],
  entryDate: string,
  instrument: string,
  quantity: number,
  stop: number | null,
  target: number | null,
  provenance: Omit<ReplaySeries, "bars" | "sha256"> = {
    source: "csv",
    fetchedAt: new Date().toISOString(),
  },
): Promise<Session> {
  const index = bars.findIndex((bar) => bar.date === entryDate);
  if (index < LOOKBACK + 1)
    throw new Error("Select an entry day with 21 earlier daily rows.");
  const symbol = instrument.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.&_-]{0,39}$/.test(symbol))
    throw new Error("Enter one instrument symbol, for example SBIN.");
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error("Enter a positive whole share quantity.");
  if (
    [stop, target].some(
      (price) => price !== null && (!Number.isFinite(price) || price <= 0),
    )
  )
    throw new Error(
      "Use positive stop and target prices, or leave them blank.",
    );

  const entry = bars[index];
  const signal = bars[index - 1];
  const lookback = bars.slice(index - LOOKBACK - 1, index - 1);
  const usedBars = bars
    .slice(index - LOOKBACK - 1, index + 1)
    .map(({ date, open, high, low, close, volume }) => ({
      date,
      open,
      high,
      low,
      close,
      ...(volume === undefined ? {} : { volume }),
    }));
  const maxGapDays = replayCoverage(usedBars);
  const series: ReplaySeries = {
    source: provenance.source,
    fetchedAt: provenance.fetchedAt,
    ...(provenance.fileName === undefined
      ? {}
      : { fileName: provenance.fileName }),
    bars: usedBars,
    sha256: await hashReplayBars(usedBars),
  };
  const resistance = lookback.reduce((highest, bar) =>
    bar.high > highest.high ? bar : highest,
  );
  const signalAt = `${signal.date}T15:30:00+05:30`;
  const id = `replay-${symbol}-${entry.date}`;

  return {
    id,
    date: entry.date,
    dataSource: "user-supplied",
    recordsComplete: false,
    historicalReplay: {
      lookbackStart: lookback[0].date,
      lookbackEnd: lookback[LOOKBACK - 1].date,
      resistanceDate: resistance.date,
      ...(series.source === "dhan" ? { priceSource: "dhan" as const } : {}),
      maxGapDays,
      series,
    },
    positions: [
      {
        id: `${id}-position`,
        name: "Simulated long entry",
        instrument: symbol,
        direction: "long",
        firstEntryCovered: true,
        allEntriesCovered: true,
        executionsComplete: true,
        executions: [
          {
            id: `${id}-entry`,
            side: "entry",
            timestamp: `${entry.date}T09:15:00+05:30`,
            price: entry.open,
            quantity,
          },
        ],
        stop:
          stop === null
            ? null
            : { id: `${id}-stop`, price: stop, recordedAt: signalAt },
        target:
          target === null
            ? null
            : { id: `${id}-target`, price: target, recordedAt: signalAt },
        signal: {
          at: signalAt,
          close: signal.close,
          reference: resistance.high,
          previousClose: null,
          previousReference: null,
          rangeEnd: null,
        },
      },
    ],
  };
}
