import { readRows } from "./trade-csv";
import type { Session } from "./types";

export const LOOKBACK = 20;

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function isSessionDate(date: string) {
  const time = Date.parse(date);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
  );
}

export function validDailyPrices({ open, high, low, close }: DailyBar) {
  return (
    [open, high, low, close].every(
      (price) => Number.isFinite(price) && price > 0,
    ) &&
    low <= Math.min(open, close) &&
    high >= Math.max(open, close)
  );
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
    const bar = { date, open, high, low, close };
    if (
      row.length !== columns.length ||
      !isSessionDate(date) ||
      dates.has(date) ||
      prices.some((value) => !/^\d+(\.\d+)?$/.test(value)) ||
      !validDailyPrices(bar)
    )
      throw new Error(
        `CSV row ${i + 2}: check the unique ISO date and OHLC prices.`,
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

export function createHistoricalReplay(
  bars: DailyBar[],
  entryDate: string,
  instrument: string,
  quantity: number,
  stop: number | null,
  target: number | null,
  priceSource?: "dhan",
): Session {
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
      ...(priceSource ? { priceSource } : {}),
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
