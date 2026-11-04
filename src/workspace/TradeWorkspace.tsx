import { useMemo, useRef, useState } from "react";
import { ArrowRight, Download, FileUp, Check, ShieldCheck } from "lucide-react";
import type { ConfirmedRules, Session, SetupKind } from "../core/types";
import { createPresetSession, strategyPresets } from "../core/strategy-library";
import { parseTradeCsv, sessionToCsv, CSV_COLUMNS } from "../core/trade-csv";
import { rupees } from "../core/review";
import { PresetPicker, presetDraft } from "./PresetPicker";
import type { StrategyDraft } from "../core/workspace";
import { TradeEntry } from "./TradeEntry";
import { useToast } from "./Toasts";
function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TradeWorkspace({
  rules,
  onPreset,
  onReview,
}: {
  rules: ConfirmedRules | null;
  onPreset: (draft: StrategyDraft) => void;
  onReview: (session: Session, source: "sample" | "manual" | "csv") => void;
}) {
  const notify = useToast();
  function download(name: string, content: string, template = false) {
    downloadCsv(name, content);
    notify({
      title: template ? "Blank template ready" : "Filled sample CSV ready",
      description: template
        ? "Add trade rows before uploading this file."
        : "Upload this fictional sample to try a review.",
      tone: "info",
    });
  }
  const [mode, setMode] = useState<"sample" | "upload" | "manual">("sample");
  const [kind, setKind] = useState<SetupKind>(rules?.setup?.kind ?? "breakout");
  const sample = useMemo(() => createPresetSession(kind), [kind]);
  const preset = strategyPresets.find((p) => p.kind === kind)!;
  const [selected, setSelected] = useState<string[] | null>(null);
  const [uploaded, setUploaded] = useState<Session | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const session = mode === "upload" ? uploaded : sample;
  const ids = selected ?? session?.positions.map((p) => p.id) ?? [];
  const matching = rules?.setup?.kind === kind;
  function changeMode(next: typeof mode) {
    setMode(next);
    setSelected(null);
    setError("");
  }
  async function readFile(file?: File) {
    if (!file) return;
    setError("");
    setUploaded(null);
    setSelected(null);
    setComplete(false);
    setLoading(true);
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Use a CSV smaller than 1 MB.");
      const result = parseTradeCsv(await file.text());
      setUploaded(result.session);
      setWarnings(result.warnings);
      notify({
        title: "CSV ready to review",
        description: `${result.session.positions.length} positions loaded. Preview and select them before reviewing.`,
      });
    } catch (e) {
      const message = (e as Error).message.includes(
        "header and at least one trade row",
      )
        ? "This is a blank template. Add trade rows first, or download the filled sample CSV."
        : (e as Error).message;
      setError(message);
      notify({
        title: "CSV could not be imported",
        description: message,
        tone: "error",
      });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div className="trade-workspace">
      <div className="flow-heading">
        <div>
          <h2>Choose what to review.</h2>
          <p className="muted">
            Start with a practice session, upload a review CSV, or enter your
            trades.
          </p>
        </div>
        <span className="local-note">
          <ShieldCheck size={15} />
          Trade data stays here
        </span>
      </div>
      <div className="source-tabs" role="group" aria-label="Trade source">
        {[
          ["sample", "Sample library"],
          ["upload", "Upload CSV"],
          ["manual", "Enter manually"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => changeMode(value as typeof mode)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode !== "sample" && rules && (
        <p className="setup-scope">
          <strong>Using {rules.setup?.label ?? "your custom checklist"}</strong>{" "}
          · Change the confirmed rules in My strategy before reviewing a
          different approach.
          {mode === "manual" && rules.setup
            ? " Add signal context through the CSV template to check the entry setup; this manual form records execution and risk evidence."
            : ""}
        </p>
      )}
      {mode === "manual" ? (
        <TradeEntry
          onSession={(s) => onReview(s, "manual")}
          onSample={() => changeMode("sample")}
        />
      ) : (
        <>
          {mode === "sample" && (
            <>
              <div className="section-title">
                <h3>Start with a setup you recognise.</h3>
                <span className="muted small">Long equity examples</span>
              </div>
              <PresetPicker
                selected={kind}
                onSelect={(p) => {
                  setKind(p.kind);
                  setSelected(null);
                }}
              />
              <div className="setup-definition">
                <div>
                  <strong>{preset.title}</strong>
                  <p>{preset.explanation}</p>
                </div>
                {!matching ? (
                  <button
                    className="primary"
                    onClick={() => onPreset(presetDraft(preset))}
                  >
                    Use this setup
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <span className="confirmed-label">
                    <Check size={15} />
                    Your confirmed setup
                  </span>
                )}
              </div>
            </>
          )}
          {mode === "upload" && (
            <section className="panel csv-upload">
              <div className="upload-icon">
                <FileUp size={25} />
              </div>
              <h3>Bring your records into the review.</h3>
              <p className="muted">
                Try a filled fictional sample first, then upload it to explore
                the review. Your file is checked here in your browser.
              </p>
              <div className="upload-buttons">
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      `${kind}-fictional-sample.csv`,
                      sessionToCsv(sample, "fictional"),
                    )
                  }
                >
                  <Download size={15} />
                  Download filled sample CSV
                </button>
                <label
                  className={`${uploaded ? "secondary" : "primary"} file-button`}
                >
                  {loading ? "Reading CSV…" : "Upload CSV file"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={loading}
                    onChange={(e) => void readFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    download(
                      "trade-review-blank-template.csv",
                      CSV_COLUMNS.join(",") + "\n",
                      true,
                    )
                  }
                >
                  Get blank template
                </button>
              </div>
              <p className="field-note">
                The blank template has column headings only; add your records
                before uploading. One complete entry and optional full exit per
                row. Timestamps include an offset, for example
                2026-10-15T09:40:00+05:30. Stop/target and signal evidence are
                optional; missing fields remain unknown. Use
                stop_declaration=no-stop only when you explicitly know there was
                no initial stop. A blank stop in an older file stays unresolved.
              </p>
              <details className="csv-help">
                <summary>What about my broker tradebook?</summary>
                <p>
                  Broker exports provide executions but may omit your initial
                  plan and signal. Convert them to this template and add only
                  documented context. Raw Zerodha or other broker schemas are
                  not supported directly. Remove account IDs, names and contact
                  details.
                </p>
                <code>{CSV_COLUMNS.join(", ")}</code>
              </details>
            </section>
          )}
          {error && (
            <div className="notice error-notice" role="alert">
              {error}
            </div>
          )}
          {session && (
            <section className="panel preview-panel">
              <div className="section-title">
                <div>
                  <h3>
                    {mode === "sample"
                      ? "Preview the practice session"
                      : "Preview your imported trades"}
                  </h3>
                  <p className="field-note">
                    {mode === "sample" || session.dataSource === "fictional"
                      ? "Generated fictional records · no real market prices or trader results"
                      : "User-supplied records · not independently verified"}
                  </p>
                </div>
                {mode === "sample" && (
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        `${kind}-fictional-sample.csv`,
                        sessionToCsv(sample, "fictional"),
                      )
                    }
                  >
                    <Download size={15} />
                    Sample CSV
                  </button>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <span className="sr-only">Select</span>
                      </th>
                      <th>Position</th>
                      <th>Entry</th>
                      <th>Stop</th>
                      <th>Target</th>
                      <th>Signal context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.positions.map((p) => (
                      <tr
                        key={p.id}
                        className={ids.includes(p.id) ? "preview-selected" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Include ${p.instrument}`}
                            checked={ids.includes(p.id)}
                            onChange={() =>
                              setSelected(
                                ids.includes(p.id)
                                  ? ids.filter((id) => id !== p.id)
                                  : [...ids, p.id],
                              )
                            }
                          />
                        </td>
                        <td>
                          <strong>{p.instrument}</strong>
                          <small>
                            {p.name ??
                              `${p.direction === "short" ? "Short" : "Long"} · ${p.executions[0].quantity} units`}
                          </small>
                        </td>
                        <td>{rupees(p.executions[0].price)}</td>
                        <td>
                          {p.stop ? rupees(p.stop.price) : "Not recorded"}
                        </td>
                        <td>
                          {p.target ? rupees(p.target.price) : "Not recorded"}
                        </td>
                        <td>{p.signal?.at ? "Provided" : "Missing"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mode === "upload" && (
                <>
                  <div className="import-summary" role="status">
                    <Check size={16} />
                    {session.positions.length} positions read. Nothing has been
                    reviewed yet.
                  </div>
                  <label className="check-label completeness">
                    <input
                      type="checkbox"
                      checked={complete}
                      onChange={(e) => setComplete(e.target.checked)}
                    />
                    <span>
                      This file covers all new positions for every IST day
                      shown.
                    </span>
                  </label>
                  {warnings.length > 0 && (
                    <p className="field-note">{warnings.join(" ")}</p>
                  )}
                </>
              )}
              <div className="preview-footer">
                <p>
                  <strong>{ids.length}</strong> of {session.positions.length}{" "}
                  positions selected
                  <span>Selection happens before the review.</span>
                </p>
                <button
                  className={
                    mode === "sample" && !matching ? "secondary" : "primary"
                  }
                  disabled={
                    ids.length === 0 || (mode === "sample" && !matching)
                  }
                  onClick={() =>
                    onReview(
                      {
                        ...session,
                        id: crypto.randomUUID(),
                        recordsComplete:
                          ids.length === session.positions.length &&
                          (mode === "sample"
                            ? session.recordsComplete
                            : complete),
                        positions: session.positions.filter((p) =>
                          ids.includes(p.id),
                        ),
                      },
                      mode === "sample" ? "sample" : "csv",
                    )
                  }
                >
                  Review selected trades
                  <ArrowRight size={16} />
                </button>
              </div>
              {mode === "sample" && !matching && (
                <p className="field-note">
                  Choose “Use this setup”, review its rules and confirm them
                  before running this example.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
