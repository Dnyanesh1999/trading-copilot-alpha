import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { dhanHistoryPlugin, normalizeDhanBars } from "./dhan-history";

const dates = Array.from({ length: 40 }, (_, i) =>
  new Date(Date.UTC(2022, 10, 23 + i)).toISOString().slice(0, 10),
)
  .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
  .slice(0, 22);
const daily = {
  timestamp: dates.map((date) => Date.parse(`${date}T00:00:00+05:30`) / 1000),
  open: dates.map(() => 99),
  high: dates.map(() => 102),
  low: dates.map(() => 97),
  close: dates.map(() => 101),
};
const instrumentList = [
  "EXCH_ID,INSTRUMENT,SERIES,UNDERLYING_SYMBOL,SECURITY_ID",
  "NSE,EQUITY,EQ,SBIN,3045",
].join("\n");

describe("Dhan daily history", () => {
  it("joins whole-second timestamps to prices using the IST session date", () => {
    const bars = normalizeDhanBars(
      { ...daily, timestamp: daily.timestamp.map((epoch) => `${epoch}.0`) },
      "2022-10-23",
      "2022-12-22",
    );
    expect(bars.at(-1)).toEqual({
      date: "2022-12-22",
      open: 99,
      high: 102,
      low: 97,
      close: 101,
    });
  });

  it("rejects shifted arrays, duplicated sessions and a missing entry day", () => {
    expect(() =>
      normalizeDhanBars(
        { ...daily, high: daily.high.slice(1) },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(/arrays/);
    expect(() =>
      normalizeDhanBars(
        { ...daily, timestamp: daily.timestamp.map(() => daily.timestamp[0]) },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(/daily candle/);
    expect(() => normalizeDhanBars(daily, "2022-10-23", "2022-12-23")).toThrow(
      /entry date/,
    );
  });

  it("preserves optional non-negative Dhan volume and rejects malformed volume", () => {
    const volume = dates.map((_, i) => (i === 0 ? "0" : "1234.5"));
    const bars = normalizeDhanBars(
      { ...daily, volume },
      "2022-10-23",
      "2022-12-22",
    );
    expect(bars[0].volume).toBe(0);
    expect(bars[1].volume).toBe(1234.5);
    expect(
      normalizeDhanBars(daily, "2022-10-23", "2022-12-22")[0],
    ).not.toHaveProperty("volume");
    expect(() =>
      normalizeDhanBars(
        { ...daily, volume: volume.slice(1) },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(/volume array/);
    expect(() =>
      normalizeDhanBars(
        { ...daily, volume: dates.map(() => -1) },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(/daily candle/);
  });

  it("rejects weekend and suspended-stock gaps in the Dhan replay window", () => {
    const weekend = [...daily.timestamp];
    weekend[1] = Date.parse("2022-11-26T00:00:00+05:30") / 1000;
    expect(() =>
      normalizeDhanBars(
        { ...daily, timestamp: weekend },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(/weekend row on 2022-11-26/);
    const gap = [...daily.timestamp];
    gap[0] = Date.parse("2022-11-18T00:00:00+05:30") / 1000;
    expect(() =>
      normalizeDhanBars(
        { ...daily, timestamp: gap },
        "2022-10-23",
        "2022-12-22",
      ),
    ).toThrow(
      "Prices are missing between 2022-11-18 and 2022-11-24. Use a complete daily series.",
    );
  });

  it("allows a five-calendar-day Dhan gap", () => {
    const later = Array.from({ length: 40 }, (_, i) =>
      new Date(Date.UTC(2022, 10, 21 + i)).toISOString().slice(0, 10),
    )
      .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
      .slice(0, 21);
    const timestamp = ["2022-11-16", ...later].map(
      (date) => Date.parse(`${date}T00:00:00+05:30`) / 1000,
    );
    expect(
      normalizeDhanBars({ ...daily, timestamp }, "2022-10-23", later[20]),
    ).toHaveLength(22);
  });

  describe("local route", () => {
    let server: ViteDevServer;
    let url: string;
    const transport = vi.fn<typeof fetch>();
    beforeAll(async () => {
      server = await createServer({
        configFile: false,
        plugins: [dhanHistoryPlugin("server-only-token", transport)],
        server: { host: "127.0.0.1", port: 0, ws: false },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (typeof address !== "object" || !address)
        throw new Error("No local test address");
      url = `http://127.0.0.1:${address.port}/local-market/history?symbol=SBIN&date=2022-12-22`;
    });
    afterAll(async () => {
      await server?.close();
    });

    it("blocks cross-site requests, fetches by resolved ID and never returns the token", async () => {
      const headers = { "X-Trading-Copilot": "replay" };
      const denied = await fetch(url, {
        headers: { ...headers, Origin: "https://example.test" },
      });
      expect(denied.status).toBe(403);
      expect(transport).not.toHaveBeenCalled();
      transport
        .mockResolvedValueOnce(new Response(instrumentList))
        .mockResolvedValueOnce(Response.json(daily));
      const accepted = await fetch(url, { headers });
      const body = await accepted.text();
      expect(accepted.status).toBe(200);
      expect(body).not.toContain("server-only-token");
      expect(JSON.parse(body).bars).toHaveLength(22);
      expect(new Date(JSON.parse(body).fetchedAt).toISOString()).toBe(
        JSON.parse(body).fetchedAt,
      );
      expect(transport.mock.calls[0][0]).toBe(
        "https://api.dhan.co/v2/instrument/NSE_EQ",
      );
      const [provider, options] = transport.mock.calls[1];
      expect(provider).toBe("https://api.dhan.co/v2/charts/historical");
      expect(JSON.parse(String(options?.body))).toMatchObject({
        securityId: "3045",
        exchangeSegment: "NSE_EQ",
        toDate: "2022-12-23",
      });
    });
  });
});
