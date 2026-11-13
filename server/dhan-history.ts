import type { Plugin } from "vite";
import {
  isSessionDate,
  validDailyPrices,
  replayCoverage,
  LOOKBACK,
  type DailyBar,
} from "../src/core/historical-replay";
import { readRows } from "../src/core/trade-csv";

const DHAN = "https://api.dhan.co/v2";
// The public master is independent of the small trade-upload row limit.
const MAX_INSTRUMENT_ROWS = 1_000_000;
type DhanStage =
  | "instrument-http"
  | "instrument-parse"
  | "candles-http"
  | "candles-parse"
  | "coverage";
const stageMessages: Record<DhanStage, string> = {
  "instrument-http":
    "Dhan instrument list could not be downloaded. Retry or use a CSV.",
  "instrument-parse":
    "Dhan instrument list could not be read. Retry or use a CSV.",
  "candles-http": "Dhan candle request failed. Retry or use a CSV.",
  "candles-parse":
    "Dhan candle response could not be read. Retry or use a CSV.",
  coverage: "Dhan coverage check failed.",
};
const dayMs = 86_400_000;
const indianDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kolkata",
});

class HistoryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function instruments(csv: string): Map<string, string[]> {
  const [header = [], ...rows] = readRows(
    csv.replace(/^\uFEFF/, ""),
    MAX_INSTRUMENT_ROWS,
    "instrument",
  );
  const indexes = [
    "EXCH_ID",
    "INSTRUMENT",
    "SERIES",
    "UNDERLYING_SYMBOL",
    "SECURITY_ID",
  ].map((field) => header.indexOf(field));
  if (indexes.includes(-1)) throw new Error("Unexpected instrument list");
  const bySymbol = new Map<string, string[]>();
  for (const row of rows) {
    const [exchange, instrument, series, symbol, id] = indexes.map((index) =>
      row[index]?.trim(),
    );
    if (
      exchange !== "NSE" ||
      instrument !== "EQUITY" ||
      series !== "EQ" ||
      !symbol ||
      !/^\d+$/.test(id ?? "")
    )
      continue;
    const ids = bySymbol.get(symbol) ?? [];
    if (!ids.includes(id)) ids.push(id);
    bySymbol.set(symbol, ids);
  }
  return bySymbol;
}

function numeric(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()))
    return Number(value);
  return NaN;
}

export function normalizeDhanBars(
  payload: Record<string, unknown>,
  from: string,
  entry: string,
): DailyBar[] {
  const columns = ["timestamp", "open", "high", "low", "close"].map(
    (key) => payload[key],
  );
  if (
    !columns.every(Array.isArray) ||
    !columns.every((column) => column.length === columns[0].length)
  )
    throw new Error("Invalid candle arrays");
  const [timestamps, opens, highs, lows, closes] = columns;
  const volumes = payload.volume;
  if (
    volumes !== undefined &&
    (!Array.isArray(volumes) || volumes.length !== timestamps.length)
  )
    throw new Error("Invalid volume array");
  const dates = new Set<string>();
  const bars = timestamps
    .map((value, index) => {
      const epoch = numeric(value);
      if (!Number.isSafeInteger(epoch) || epoch <= 0 || epoch > 4_102_444_800)
        throw new Error("Invalid Unix timestamp");
      const date = indianDate.format(epoch * 1000);
      const bar = {
        date,
        open: numeric(opens[index]),
        high: numeric(highs[index]),
        low: numeric(lows[index]),
        close: numeric(closes[index]),
        ...(volumes === undefined ? {} : { volume: numeric(volumes[index]) }),
      };
      if (!validDailyPrices(bar) || dates.has(date))
        throw new Error("Invalid daily candle");
      dates.add(date);
      return bar;
    })
    .filter((bar) => bar.date >= from && bar.date <= entry);
  if (!dates.has(entry))
    throw new HistoryError(
      422,
      "Dhan has no candle for that entry date. Choose a completed trading session.",
    );
  if (bars.length < LOOKBACK + 2)
    throw new HistoryError(
      422,
      "Dhan returned too few earlier trading sessions for the breakout check.",
    );
  bars.sort((a, b) => a.date.localeCompare(b.date));
  try {
    replayCoverage(bars.slice(-LOOKBACK - 2));
  } catch (error) {
    throw new HistoryError(422, (error as Error).message);
  }
  return bars;
}

export function dhanHistoryPlugin(token: string, transport = fetch): Plugin {
  let master: { expiresAt: number; data: Map<string, string[]> } | undefined;
  let busy = false;
  let lastRequest = 0;
  return {
    name: "local-dhan-history",
    configureServer(server) {
      server.middlewares.use("/local-market/history", async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          res.end(JSON.stringify(body));
        };
        const host = req.headers.host ?? "";
        if (
          !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress ?? "",
          ) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`) ||
          req.headers["sec-fetch-site"] === "cross-site" ||
          req.headers["x-trading-copilot"] !== "replay"
        ) {
          return reply(403, { error: "Local replay requests only." });
        }
        if (req.method !== "GET") return reply(405, { error: "GET required." });
        if (!token)
          return reply(503, {
            error:
              "Start the local app with a Dhan access token, or use a CSV.",
          });
        const query = new URL(req.url ?? "/", "http://localhost").searchParams;
        const symbol = query.get("symbol")?.trim().toUpperCase() ?? "";
        const entry = query.get("date") ?? "";
        if (
          !/^[A-Z0-9][A-Z0-9.&_-]{0,39}$/.test(symbol) ||
          !isSessionDate(entry) ||
          entry >= indianDate.format(new Date())
        ) {
          return reply(400, {
            error: "Choose an NSE equity symbol and a past trading date.",
          });
        }
        if (busy || Date.now() - lastRequest < 1000)
          return reply(429, {
            error: "Wait a moment before fetching prices again.",
          });
        busy = true;
        lastRequest = Date.now();
        let stage: DhanStage = "instrument-http";
        try {
          if (!master || master.expiresAt <= Date.now()) {
            const list = await transport(`${DHAN}/instrument/NSE_EQ`, {
              // This token-free endpoint redirects to the public master on S3.
              redirect: "follow",
              signal: AbortSignal.timeout(12000),
            });
            if (!list.ok)
              throw new Error(
                `Instrument endpoint returned HTTP ${list.status}`,
              );
            stage = "instrument-parse";
            master = {
              data: instruments(await list.text()),
              expiresAt: Date.now() + 6 * 60 * 60 * 1000,
            };
          }
          const ids = master.data.get(symbol);
          if (ids?.length !== 1)
            return reply(404, {
              error: "No unique NSE equity found. Check the trading symbol.",
            });
          const entryTime = Date.parse(entry);
          const from = new Date(entryTime - 60 * dayMs)
            .toISOString()
            .slice(0, 10);
          const until = new Date(entryTime + dayMs).toISOString().slice(0, 10);
          stage = "candles-http";
          const result = await transport(`${DHAN}/charts/historical`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "access-token": token,
            },
            body: JSON.stringify({
              securityId: ids[0],
              exchangeSegment: "NSE_EQ",
              instrument: "EQUITY",
              fromDate: from,
              toDate: until,
              oi: false,
            }),
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          });
          let data;
          try {
            data = await result.json();
          } catch {
            // Native JSON errors can quote response bodies. Never log those.
            stage = "candles-parse";
            throw new Error("Invalid JSON candle response");
          }
          const code = String(data?.errorCode ?? "");
          if (!result.ok || code) {
            if (["DH-905", "811", "812", "813", "814"].includes(code))
              return reply(400, {
                error:
                  "Dhan rejected the request inputs. Check the symbol and date.",
              });
            if (["806", "DH-902"].includes(code) || result.status === 403)
              return reply(403, {
                error:
                  "Dhan denied access to historical data. Check the Data API plan.",
              });
            if (
              ["807", "808", "809", "DH-901"].includes(code) ||
              result.status === 401
            )
              return reply(401, {
                error:
                  "Dhan access token is invalid or expired. Restart the local app with a fresh token.",
              });
            if (["805", "DH-904"].includes(code) || result.status === 429)
              return reply(429, {
                error: "Dhan rate limit reached. Wait before retrying.",
              });
            if (["DH-907"].includes(code) || result.status === 404)
              return reply(422, {
                error:
                  "Dhan returned no historical candles for this selection.",
              });
            throw new Error(`Candle endpoint returned HTTP ${result.status}`);
          }
          stage = "candles-parse";
          return reply(200, {
            bars: normalizeDhanBars(data, from, entry),
            fetchedAt: new Date().toISOString(),
          });
        } catch (error) {
          if (error instanceof HistoryError) stage = "coverage";
          // One line only. Do not include headers, bodies, URLs or stack/cause.
          const reason = (
            error instanceof Error ? error.message : "Unknown error"
          )
            .split(token)
            .join("[redacted]")
            .replace(/https?:\/\/\S+/g, "[URL redacted]")
            .replace(/[\r\n\t]/g, " ")
            .slice(0, 240);
          console.error(`[dhan-history] stage=${stage} reason=${reason}`);
          if (error instanceof HistoryError)
            return reply(error.status, {
              error: `${stageMessages.coverage} ${error.message}`,
              stage,
            });
          return reply(502, {
            error: stageMessages[stage],
            stage,
          });
        } finally {
          busy = false;
        }
      });
    },
  };
}
