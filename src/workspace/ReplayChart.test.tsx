// @vitest-environment jsdom
// Original synthetic DEMO-style prices; no real instrument data.
// Extra decimal places exercise unrounded evidence vs two-decimal display.
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
    timeScale: vi.fn(() => ({
      fitContent,
      applyOptions: vi.fn(),
      setVisibleLogicalRange: vi.fn(),
    })),
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
    new Date(Date.UTC(2025, 1, 3 + i)).toISOString().slice(0, 10),
  )
    .filter((date) => ![0, 6].includes(new Date(date).getUTCDay()))
    .slice(0, 22);
  const bars: DailyBar[] = dates.map((date, i) => ({
    date,
    open: 140,
    high: 149.123456,
    low: 130,
    close: 142,
    ...(withVolume ? { volume: i * 1000 } : {}),
  }));
  bars[20] = { ...bars[20], high: 165, close: 160.5 };
  bars[21] = { ...bars[21], open: 160.654321, high: 170 };
  return createHistoricalReplay(bars, dates[21], "DEMO-TEST", 10, null, null, {
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
    value.positions[0].stop = { id: "stop", price: 140, recordedAt: null };
    value.positions[0].target = { id: "target", price: 200, recordedAt: null };
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
          title: "",
          price: 149.123456,
          lineStyle: 2,
        }),
        expect.objectContaining({
          title: "",
          price: 140,
          lineStyle: 2,
        }),
        expect.objectContaining({
          title: "",
          price: 200,
          lineStyle: 2,
        }),
      ]),
    );
    expect(
      mock.candles.createPriceLine.mock.calls.every(
        ([line]) => line.title === "" && line.axisLabelVisible === true,
      ),
    ).toBe(true);
    expect(mock.createSeriesMarkers.mock.calls[0][1]).toHaveLength(3);
    expect(
      mock.createSeriesMarkers.mock.calls[0][1].find(
        (marker: { shape: string }) => marker.shape === "arrowUp",
      ),
    ).toMatchObject({ position: "belowBar", time: "2025-03-04" });
    expect(mock.createSeriesMarkers.mock.calls[0][2]).toEqual({
      autoScale: false,
    });
    const options = mock.chart.addSeries.mock.calls[0][1] as {
      autoscaleInfoProvider: AutoscaleInfoProvider;
    };
    expect(
      options.autoscaleInfoProvider!(() => ({
        priceRange: { minValue: 130, maxValue: 170 },
      }))?.priceRange,
    ).toEqual({ minValue: 130, maxValue: 200 });
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
      "DEMO-TEST daily prices, 3 Feb–4 Mar 2025. Signal close 160.50 above resistance 149.12. Entry at 160.65.",
    );
    const table = host.querySelector("table")!;
    expect(table.closest(".sr-only")).not.toBeNull();
    expect(table.tBodies[0].rows).toHaveLength(22);
    expect(
      [...table.tHead!.rows[0].cells].map((cell) => cell.textContent),
    ).toEqual(["Date", "O", "H", "L", "C", "Volume"]);
    expect(host.querySelector("figcaption")?.textContent).toContain(
      "Daily prices from Dhan · 20-session lookback 3 Feb–28 Feb · chart by",
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
      scaleMargins: { top: 0.85, bottom: 0 },
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
      title: "",
      axisLabelVisible: true,
    });
    expect(
      host.querySelector('[aria-label="Chart price levels"]')?.textContent,
    ).toContain("Resistance ₹149.12");
  });
});
