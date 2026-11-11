import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";
import type { Position, ReplaySeries, Session } from "../core/types";
import type { AutoscaleInfo } from "lightweight-charts";
import {
  REPLAY_CHART_COLORS as colors,
  replayChartData,
  replayChartRange,
} from "../core/replay-chart-data";
import "./replay-chart.css";

export default function ReplayChart({ session }: { session: Session }) {
  const series = session.historicalReplay?.series;
  if (!series) return null;
  return <PriceChart series={series} position={session.positions[0]} />;
}

function PriceChart({
  series,
  position,
}: {
  series: ReplaySeries;
  position: Position;
}) {
  const container = useRef<HTMLDivElement>(null);
  const stop = position.stop?.price;
  const target = position.target?.price;
  const model = useMemo(
    () => replayChartData(series.bars, { stop, target }),
    [series.bars, stop, target],
  );
  useEffect(() => {
    if (!container.current) return;
    const mobile = window.matchMedia?.("(max-width: 600px)");
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        attributionLogo: true,
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: colors.ink,
        fontFamily:
          '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#f4f2f8" },
        horzLines: { color: "#f0f0f5" },
      },
      rightPriceScale: {
        borderColor: "#e7e8ef",
        scaleMargins: { top: 0.08, bottom: 0.2 },
        alignLabels: true,
      },
      timeScale: { borderColor: "#e7e8ef", rightOffset: 2, timeVisible: false },
      localization: { locale: "en-GB" },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange) return info;
        const levels = model.lines.map((line) => line.price);
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, ...levels),
            maxValue: Math.max(info.priceRange.maxValue, ...levels),
          },
        };
      },
    });
    candles.setData(model.candles);
    const priceLines = model.lines.map((line) =>
      candles.createPriceLine({
        ...line,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: !mobile?.matches,
      }),
    );
    // Narrow charts use the legend so pinned level labels cannot cover markers.
    const updateLabels = () =>
      priceLines.forEach((line) =>
        line.applyOptions({ axisLabelVisible: !mobile?.matches }),
      );
    mobile?.addEventListener("change", updateLabels);
    if (model.volume.length) {
      const volume = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volume.setData(model.volume);
      volume
        .priceScale()
        .applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    }
    // The scale margins already reserve marker/volume space; don't add it twice.
    const markers = createSeriesMarkers(
      candles,
      model.markers.map(({ text: _text, ...marker }) => ({
        ...marker,
        size: 0.5,
      })),
      {
        autoScale: false,
      },
    );
    chart.timeScale().fitContent();
    const frameBars = () => {
      const scale = chart.timeScale();
      // Keep the fixed bottom-left attribution clear of volume, also on phones.
      scale.setVisibleLogicalRange({
        from: mobile?.matches ? -4 : -1,
        to: model.candles.length + 1,
      });
      scale.applyOptions({ rightOffset: 2, fixRightEdge: true });
    };
    frameBars();
    mobile?.addEventListener("change", frameBars);
    return () => {
      mobile?.removeEventListener("change", frameBars);
      mobile?.removeEventListener("change", updateLabels);
      markers.detach();
      chart.remove();
    };
  }, [model]);
  const bars = series.bars;
  const relation =
    model.signal.close > model.resistance
      ? "above"
      : model.signal.close === model.resistance
        ? "equal to"
        : "below";
  const label = `${position.instrument} daily prices, ${replayChartRange(bars[0].date, model.entry.date, true)}. Signal close ${model.signal.close.toFixed(2)} ${relation} resistance ${model.resistance.toFixed(2)}. Entry at ${model.entry.open.toFixed(2)}.`;
  return (
    <figure className="replay-chart">
      <ul className="replay-chart-marker-key" aria-label="Chart markers">
        {model.markers.map((marker) => (
          <li key={marker.text}>
            <span aria-hidden="true" style={{ color: marker.color }}>
              {marker.shape === "arrowUp" ? "↑" : "●"}
            </span>
            {marker.text}
          </li>
        ))}
      </ul>
      <ul className="replay-chart-levels" aria-label="Chart price levels">
        {model.lines.map((line) => (
          <li key={line.title}>
            <span aria-hidden="true" style={{ borderColor: line.color }} />
            {line.title}
          </li>
        ))}
      </ul>
      <div role="img" aria-label={label}>
        <div ref={container} className="replay-chart-plot" />
      </div>
      <figcaption>
        Daily prices from {series.source === "dhan" ? "Dhan" : "CSV"} ·
        20-session lookback {replayChartRange(bars[0].date, bars[19].date)} ·
        chart by{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts
        </a>
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>
            {position.instrument} daily prices used in this replay
          </caption>
          <thead>
            <tr>
              {["Date", "O", "H", "L", "C", "Volume"].map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.date}>
                <th scope="row">{bar.date}</th>
                <td>{bar.open.toFixed(2)}</td>
                <td>{bar.high.toFixed(2)}</td>
                <td>{bar.low.toFixed(2)}</td>
                <td>{bar.close.toFixed(2)}</td>
                <td>{bar.volume ?? "Not supplied"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
