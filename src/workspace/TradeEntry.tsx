import { useEffect, useRef, useState } from "react";
import { ArrowRight, Plus, Trash2, FlaskConical } from "lucide-react";
import {
  defaultTrade,
  tradesToSession,
  type TradeDraft,
  TradeInputError,
} from "../core/workspace";
import type { Session } from "../core/types";
import { studyWorkspace } from "../study/client";
export function tradeDraftKey() {
  const workspace = studyWorkspace();
  return workspace
    ? workspace.key + ".manual-trades"
    : "trading-copilot.trade-draft.v1";
}
function readDraft(): { trades: TradeDraft[]; complete: boolean } {
  const empty = () => ({ trades: [{ ...defaultTrade }], complete: false });
  try {
    const data: unknown = JSON.parse(
      sessionStorage.getItem(tradeDraftKey()) ?? "null",
    );
    if (!data || typeof data !== "object") return empty();
    const value = data as { trades?: unknown; complete?: unknown };
    if (
      typeof value.complete !== "boolean" ||
      !Array.isArray(value.trades) ||
      value.trades.length < 1 ||
      value.trades.length > 30
    )
      return empty();
    if (
      !value.trades.every(
        (trade) =>
          trade &&
          typeof trade === "object" &&
          Object.keys(defaultTrade).every(
            (key) =>
              (["stopDeclaration", "planTimeUnknown"].includes(key) &&
                trade[key] === undefined) ||
              (typeof trade[key] === "string" && trade[key].length <= 200),
          ) &&
          ["long", "short"].includes(trade.direction),
      )
    )
      return empty();
    return {
      trades: value.trades.map(
        (trade) =>
          Object.fromEntries(
            Object.keys(defaultTrade).map((key) => [key, trade[key] ?? ""]),
          ) as unknown as TradeDraft,
      ),
      complete: value.complete,
    };
  } catch {
    return empty();
  }
}
export function TradeEntry({
  onSession,
  onSample,
}: {
  onSession: (s: Session) => void;
  onSample: () => void;
}) {
  const formRef = useRef<HTMLElement>(null);
  const [initial] = useState(readDraft);
  const [trades, setTrades] = useState<TradeDraft[]>(initial.trades);
  const [complete, setComplete] = useState(initial.complete);
  const [draftWarning, setDraftWarning] = useState("");
  useEffect(() => {
    try {
      sessionStorage.setItem(
        tradeDraftKey(),
        JSON.stringify({ trades, complete }),
      );
      setDraftWarning("");
    } catch {
      setDraftWarning(
        "This browser cannot retain your trade draft. Keep this form open until you finish.",
      );
    }
  }, [trades, complete]);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<TradeInputError | null>(null);
  useEffect(() => {
    if (!fieldError) return;
    const field = formRef.current?.querySelector<
      HTMLInputElement | HTMLSelectElement
    >('[aria-invalid="true"]');
    field?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    field?.focus({ preventScroll: true });
  }, [fieldError]);
  const edit = (index: number, key: keyof TradeDraft, value: string) => {
    if (fieldError?.tradeIndex === index && fieldError.field === key) {
      setFieldError(null);
      setError("");
    }
    setTrades((items) =>
      items.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    );
  };
  const fields: [keyof TradeDraft, string, string][] = [
    ["instrument", "Instrument", "text"],
    ["quantity", "Quantity", "number"],
    ["entryPrice", "Entry price (₹)", "number"],
    ["enteredAt", "First entry (IST)", "datetime-local"],
    ["stopPrice", "Initial planned stop (₹)", "number"],
    ["targetPrice", "Initial planned target (₹) · optional", "number"],
    ["planRecordedAt", "Plan recorded (IST)", "datetime-local"],
    ["exitPrice", "Full exit price (₹) · optional", "number"],
    ["exitedAt", "Full exit time (IST) · optional", "datetime-local"],
  ];
  return (
    <section className="panel" ref={formRef}>
      <div className="section-title">
        <div>
          <h2>Add the trades you want to review.</h2>
          <p className="muted">Your trade records stay in this browser.</p>
        </div>
        <button className="secondary" onClick={onSample}>
          <FlaskConical size={16} />
          Try fictional sample
        </button>
      </div>
      <p className="field-note">
        One complete entry per position, with an optional full exit. For partial
        fills, scale-ins or partial exits, use the sample for now. All times are
        entered in IST. Plan timestamps are your supplied records, not
        independently verified.
      </p>
      {draftWarning && (
        <p className="notice" role="status">
          {draftWarning}
        </p>
      )}
      <p className="field-note">
        Unfinished entries stay in this browser tab until you clear them or
        close the tab.
      </p>
      {trades.map((trade, index) => (
        <fieldset className="trade-form" key={index}>
          <legend>Trade {index + 1}</legend>
          <label>
            Stop plan for this trade
            <select
              value={trade.stopDeclaration}
              onChange={(e) => {
                edit(index, "stopDeclaration", e.target.value);
                if (e.target.value !== "had-stop") edit(index, "stopPrice", "");
              }}
              aria-invalid={
                fieldError?.tradeIndex === index &&
                fieldError.field === "stopDeclaration"
              }
            >
              <option value="">Choose a stop status…</option>
              <option value="had-stop">Had a stop</option>
              <option value="no-stop">No stop</option>
              <option value="not-recorded">Not recorded</option>
            </select>
            {fieldError?.tradeIndex === index &&
              fieldError.field === "stopDeclaration" && (
                <small role="alert">{fieldError.message}</small>
              )}
          </label>
          <div className="trade-grid">
            {fields
              .filter(
                ([key]) =>
                  (key !== "stopPrice" ||
                    trade.stopDeclaration === "had-stop") &&
                  (key !== "planRecordedAt" ||
                    trade.stopDeclaration === "had-stop" ||
                    trade.targetPrice.trim()),
              )
              .map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    step={type === "number" ? "any" : undefined}
                    min={type === "number" ? "0.000001" : undefined}
                    maxLength={type === "text" ? 50 : undefined}
                    value={trade[key]}
                    disabled={
                      key === "planRecordedAt" &&
                      trade.planTimeUnknown === "yes"
                    }
                    aria-invalid={
                      fieldError?.tradeIndex === index &&
                      fieldError.field === key
                    }
                    onChange={(e) => edit(index, key, e.target.value)}
                    placeholder={
                      key === "instrument" ? "e.g. RELIANCE" : undefined
                    }
                  />
                  {fieldError?.tradeIndex === index &&
                    fieldError.field === key && (
                      <small role="alert">{fieldError.message}</small>
                    )}
                </label>
              ))}
            <label>
              Direction
              <select
                value={trade.direction}
                onChange={(e) => edit(index, "direction", e.target.value)}
              >
                <option value="long">Long · buy first</option>
                <option value="short">Short · sell first</option>
              </select>
            </label>
          </div>
          {(trade.stopDeclaration === "had-stop" ||
            trade.targetPrice.trim()) && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={trade.planTimeUnknown === "yes"}
                onChange={(e) =>
                  edit(index, "planTimeUnknown", e.target.checked ? "yes" : "")
                }
              />
              I don’t know when this plan was recorded.
            </label>
          )}
          {trades.length > 1 && (
            <button
              className="text-button danger"
              onClick={() =>
                setTrades((items) => items.filter((_, i) => i !== index))
              }
            >
              <Trash2 size={14} />
              Remove trade
            </button>
          )}
        </fieldset>
      ))}
      <div className="trade-footer">
        <button
          className="secondary"
          onClick={() => setTrades((items) => [...items, { ...defaultTrade }])}
          disabled={trades.length >= 30}
        >
          <Plus size={16} />
          Add another trade
        </button>
        <span className="muted">{trades.length} / 30 positions</span>
        <button
          className="text-button danger"
          onClick={() => {
            setTrades([{ ...defaultTrade }]);
            setComplete(false);
            setError("");
          }}
        >
          Clear entered trades
        </button>
      </div>
      <label className="check-label completeness">
        <input
          type="checkbox"
          checked={complete}
          onChange={(e) => setComplete(e.target.checked)}
        />
        <span>
          These include every new position for each IST day shown.{" "}
          <small>
            Leave unchecked for a subset. Daily-limit checks will need more
            evidence.
          </small>
        </span>
      </label>
      <p className="field-note">
        “No stop” is a rule break when your checklist requires one. “Not
        recorded” stays unresolved and is highlighted in the review. Initial
        levels are not later trailing-stop adjustments.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        onClick={() => {
          try {
            setFieldError(null);
            setError("");
            onSession(tradesToSession(trades, complete));
          } catch (e) {
            setError((e as Error).message);
            setFieldError(e instanceof TradeInputError ? e : null);
          }
        }}
      >
        Review these trades <ArrowRight size={17} />
      </button>
    </section>
  );
}
