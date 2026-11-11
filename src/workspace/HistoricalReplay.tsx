import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import {
  createHistoricalReplay,
  LOOKBACK,
  parseDailyBars,
  type DailyBar,
} from "../core/historical-replay";
import type { Session } from "../core/types";

export function HistoricalReplay({
  confirmed,
  onChooseSetup,
  onReview,
}: {
  confirmed: boolean;
  onChooseSetup: () => void;
  onReview: (session: Session) => void;
}) {
  const [source, setSource] = useState<"dhan" | "csv">(
    import.meta.env.DEV ? "dhan" : "csv",
  );
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [bars, setBars] = useState<DailyBar[]>([]);
  const [entryDate, setEntryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = bars.findIndex((bar) => bar.date === entryDate);
  const entry = selected > LOOKBACK ? bars[selected] : null;

  function chooseSource(next: typeof source) {
    if (next === source) return;
    setSource(next);
    setEntryDate("");
    setBars([]);
    setError("");
  }

  async function load(file: File) {
    setBars([]);
    setEntryDate("");
    setError("");
    setLoading(true);
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Use a price CSV smaller than 1 MB.");
      const prices = parseDailyBars(await file.text());
      setBars(prices);
      setEntryDate(prices[prices.length - 1].date);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || request.current) return;
    setError("");
    const fields = new FormData(event.currentTarget);
    const instrument = String(fields.get("instrument") ?? "")
      .trim()
      .toUpperCase();
    const price = (name: string) =>
      fields.get(name) ? Number(fields.get(name)) : null;
    const controller = new AbortController();
    let prices = bars;
    try {
      if (source === "dhan") {
        request.current = controller;
        setLoading(true);
        const query = new URLSearchParams({
          symbol: instrument,
          date: entryDate,
        });
        const response = await fetch(`/local-market/history?${query}`, {
          headers: { "X-Trading-Copilot": "replay" },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Dhan prices are unavailable.");
        prices = data.bars;
      }
      if (!controller.signal.aborted) {
        onReview(
          createHistoricalReplay(
            prices,
            entryDate,
            instrument,
            Number(fields.get("quantity")),
            price("stop"),
            price("target"),
            source === "dhan" ? "dhan" : undefined,
          ),
        );
      }
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }

  return (
    <section className="panel">
      <h3>Replay a 20-session breakout</h3>
      <p className="muted">
        The previous session must close above the highest high of the 20
        sessions before it. Replay a simulated long entry at the selected day’s
        open.
      </p>
      {!confirmed ? (
        <button className="secondary" onClick={onChooseSetup}>
          Set up the breakout strategy <ArrowRight size={15} />
        </button>
      ) : (
        <>
          {import.meta.env.DEV && (
            <div
              className="source-tabs"
              role="group"
              aria-label="Historical price source"
            >
              <button
                aria-pressed={source === "dhan"}
                disabled={loading}
                onClick={() => chooseSource("dhan")}
              >
                Fetch from Dhan
              </button>
              <button
                aria-pressed={source === "csv"}
                disabled={loading}
                onClick={() => chooseSource("csv")}
              >
                Upload CSV
              </button>
            </div>
          )}
          {source === "csv" && (
            <>
              <label className="secondary file-button">
                {loading ? "Reading prices…" : "Upload daily price CSV"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={loading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void load(file);
                  }}
                />
              </label>
              <p className="field-note">
                Use one Indian equity in INR, with at least 22 consecutive
                trading sessions and a consistent price series across corporate
                actions. CSV headers: <code>date,open,high,low,close</code>. Use
                YYYY-MM-DD dates and price data you have permission to use for
                replay.
              </p>
            </>
          )}
          {(source === "dhan" || bars.length > 0) && (
            <form key={source} onSubmit={(event) => void review(event)}>
              {source === "csv" && (
                <p role="status" className="field-note">
                  {bars.length} daily rows loaded. Select an entry date present
                  in the file.
                </p>
              )}
              <fieldset className="trade-form" disabled={loading}>
                <legend>Simulated entry and plan</legend>
                <div className="trade-grid">
                  <label>
                    Equity symbol
                    <input
                      name="instrument"
                      required
                      maxLength={40}
                      placeholder="SBIN"
                    />
                  </label>
                  <label>
                    Entry session
                    <input
                      type="date"
                      required
                      value={entryDate}
                      min={bars[LOOKBACK + 1]?.date}
                      max={bars.at(-1)?.date}
                      onChange={(event) => setEntryDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Shares
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue="1"
                      required
                    />
                  </label>
                  <label>
                    Planned stop (₹, optional)
                    <input name="stop" type="number" min="0.01" step="any" />
                  </label>
                  <label>
                    Planned target (₹, optional)
                    <input name="target" type="number" min="0.01" step="any" />
                  </label>
                </div>
              </fieldset>
              <p className="field-note">
                Stop and target are simulated as recorded at the signal close.
                {entry &&
                  ` The replay uses the ${entry.date} open of ₹${entry.open}.`}
              </p>
              <button
                className="secondary"
                data-run-review
                disabled={loading || (source === "csv" && !entry)}
              >
                {loading ? "Fetching Dhan prices…" : "Review historical replay"}{" "}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
    </section>
  );
}
