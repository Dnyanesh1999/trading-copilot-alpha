// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReplayChart from "./ReplayChart";
import { createHistoricalReplay } from "../core/historical-replay";
import type { DailyBar } from "../core/types";
import type { AutoscaleInfoProvider } from "lightweight-charts";

const mock = vi.hoisted(() => {
  const candles = { setData: vi.fn(), createPriceLine: vi.fn() };
  const scale = { applyOptions: vi.fn() };
  const volume = { setData: vi.fn(), priceScale: vi.fn(() => scale) };
  const chart = {
    addSeries: vi.fn((kind: string, _options?: unknown) =>
      kind === "candle" ? candles : volume,
    ),
    timeScale: vi.fn(() => ({ fitContent: fitContent })),
    remove: vi.fn(),
  };
  const fitContent = vi.fn();
  return {
    candles,
    volume,
    scale,
    chart,
    fitContent,
    detach: vi.fn(),
    createChart: vi.fn(() => chart),
    createSeriesMarkers: vi.fn(),
  };
});
vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candle",
  HistogramSeries: "volume",
  ColorType: { Solid: "solid" },
  LineStyle: { Dashed: 2 },
  createChart: mock.createChart,
  createSeriesMarkers: mock.createSeriesMarkers.mockImplementation(() => ({
    detach: mock.detach,
  })),
}));

async function session(withVolume = false) {
  const dates = Array.from({ length: 40 }, (_, i) =>
    new Date(Date.UTC(2022, 10, 16 + i)).toISOString().slice(0, 10),
  )
    .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
    .slice(0, 22);
  const bars: DailyBar[] = dates.map((date, i) => ({
    date,
    open: 610,
    high: 619.799988,
    low: 600,
    close: 612,
    ...(withVolume ? { volume: i * 1000 } : {}),
  }));
  bars[20] = { ...bars[20], high: 627, close: 625.5 };
  bars[21] = { ...bars[21], open: 625.549988, high: 630 };
  return createHistoricalReplay(bars, dates[21], "SBIN", 10, null, null, {
    source: "dhan",
    fetchedAt: "2026-11-11T13:00:00.000Z",
  });
}

describe("ReplayChart", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn());
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("creates the v5 chart with attribution, candles, dashed levels and markers; cleans it up", async () => {
    const value = await session();
    value.positions[0].stop = { id: "stop", price: 610, recordedAt: null };
    value.positions[0].target = { id: "target", price: 660, recordedAt: null };
    const original = structuredClone(value);
    await act(() => root.render(<ReplayChart session={value} />));
    expect(mock.createChart).toHaveBeenCalledWith(
      host.querySelector(".replay-chart-plot"),
      expect.objectContaining({
        autoSize: true,
        layout: expect.objectContaining({ attributionLogo: true }),
      }),
    );
    expect(mock.candles.setData.mock.calls[0][0]).toHaveLength(22);
    expect(
      mock.candles.createPriceLine.mock.calls.map(([line]) => line),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Resistance ₹619.80",
          price: 619.799988,
          lineStyle: 2,
        }),
        expect.objectContaining({
          title: "Stop ₹610.00",
          price: 610,
          lineStyle: 2,
        }),
        expect.objectContaining({
          title: "Target ₹660.00",
          price: 660,
          lineStyle: 2,
        }),
      ]),
    );
    expect(mock.createSeriesMarkers.mock.calls[0][1]).toHaveLength(3);
    expect(mock.createSeriesMarkers.mock.calls[0][2]).toEqual({
      autoScale: false,
    });
    const options = mock.chart.addSeries.mock.calls[0][1] as {
      autoscaleInfoProvider: AutoscaleInfoProvider;
    };
    expect(
      options.autoscaleInfoProvider!(() => ({
        priceRange: { minValue: 600, maxValue: 630 },
      }))?.priceRange,
    ).toEqual({ minValue: 600, maxValue: 660 });
    expect(mock.fitContent).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(value).toEqual(original);
    await act(() => root.render(null));
    expect(mock.detach).toHaveBeenCalledOnce();
    expect(mock.chart.remove).toHaveBeenCalledOnce();
  });

  it("renders nothing for an old replay without series", async () => {
    const value = await session();
    delete value.historicalReplay!.series;
    await act(() => root.render(<ReplayChart session={value} />));
    expect(host.childElementCount).toBe(0);
    expect(mock.createChart).not.toHaveBeenCalled();
  });

  it("provides the aria summary, caption and a hidden table of all 22 rows", async () => {
    await act(async () =>
      root.render(<ReplayChart session={await session()} />),
    );
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "SBIN daily prices, 16 Nov–15 Dec 2022. Signal close 625.50 above resistance 619.80. Entry at 625.55.",
    );
    const table = host.querySelector("table")!;
    expect(table.closest(".sr-only")).not.toBeNull();
    expect(table.tBodies[0].rows).toHaveLength(22);
    expect(
      [...table.tHead!.rows[0].cells].map((cell) => cell.textContent),
    ).toEqual(["Date", "O", "H", "L", "C", "Volume"]);
    expect(host.querySelector("figcaption")?.textContent).toContain(
      "Daily prices from Dhan · 20-session lookback 16 Nov–13 Dec · chart by",
    );
    expect(
      host.querySelector('a[href="https://www.tradingview.com/"]'),
    ).not.toBeNull();
  });

  it("uses a bottom overlay for optional volume including zero", async () => {
    await act(async () =>
      root.render(<ReplayChart session={await session(true)} />),
    );
    expect(mock.chart.addSeries).toHaveBeenCalledWith(
      "volume",
      expect.objectContaining({ priceScaleId: "volume" }),
    );
    expect(mock.volume.setData.mock.calls[0][0][0].value).toBe(0);
    expect(mock.scale.applyOptions).toHaveBeenCalledWith({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
  });

  it("omits volume and absent stop/target lines", async () => {
    await act(async () =>
      root.render(<ReplayChart session={await session()} />),
    );
    expect(mock.chart.addSeries).toHaveBeenCalledTimes(1);
    expect(mock.candles.createPriceLine).toHaveBeenCalledTimes(1);
    expect(mock.volume.setData).not.toHaveBeenCalled();
  });

  it("keeps mobile markers readable by putting level names in the legend", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await act(async () =>
      root.render(<ReplayChart session={await session()} />),
    );
    expect(mock.candles.createPriceLine.mock.calls[0][0]).toMatchObject({
      title: "Resistance ₹619.80",
      axisLabelVisible: false,
    });
    expect(
      host.querySelector('[aria-label="Chart price levels"]')?.textContent,
    ).toContain("Resistance ₹619.80");
  });
});
