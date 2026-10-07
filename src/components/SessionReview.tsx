import { useState } from "react";
import {
  Check,
  CircleHelp,
  AlertCircle,
  ClipboardCheck,
  BarChart3,
  Clock3,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import type {
  Review,
  Focus,
  FindingStatus,
  Position,
  ExampleMode,
} from "../core/types";
import {
  entryInfo,
  positionStatus,
  reviewSummary,
  timestampInfo,
  RULE_LABELS,
  entryMetrics,
  planMetrics,
  grossResult,
  rupees,
} from "../core/review";
import { FOCUS_LABELS } from "../core/fixtures";
import { Arrow, Modal, Progress } from "./Chrome";
const statusLabel = {
  followed: "Followed",
  deviated: "Deviated",
  insufficient_evidence: "Insufficient evidence",
};
const examples: { id: ExampleMode; label: string }[] = [
  { id: "full", label: "Full execution record" },
  { id: "daily-gap", label: "Missing daily records" },
  { id: "plan-gap", label: "Missing risk plan" },
];
function Status({ status }: { status: FindingStatus }) {
  const Icon =
    status === "deviated"
      ? AlertCircle
      : status === "followed"
        ? Check
        : CircleHelp;
  return (
    <span className={`status ${status}`}>
      <Icon size={18} aria-hidden="true" />
      {statusLabel[status]}
    </span>
  );
}
function Evidence({
  review,
  position,
  onClose,
}: {
  review: Review;
  position: Position;
  onClose: () => void;
}) {
  const findings = review.findings.filter((f) => f.positionId === position.id);
  const executions = review.session.positions.flatMap((p) => p.executions);
  const sourceIds = new Set(findings.flatMap((f) => f.sourceIds));
  const levels = [position.stop, position.target].filter(
    (level) => level != null,
  );
  return (
    <Modal title={`Position ${position.id}: the evidence`} onClose={onClose}>
      <p className="muted">
        {position.instrument} · fictional equity position ·{" "}
        {position.direction ?? "direction unavailable"}
      </p>
      <p>
        Confirmed rules: at most {review.rules.maxPositions} new positions per
        IST day, entry before {review.rules.cutoff} IST.
        {review.rules.comparison === "hypothetical"
          ? " This is a comparison against sample history."
          : ""}
      </p>
      {findings.map((f) => (
        <section className="evidence-finding" key={f.ruleId}>
          <h3>
            {RULE_LABELS[f.ruleId]} <Status status={f.status} />
          </h3>
          <p>{f.explanation}</p>
          <p className="calculation">{f.calculation}</p>
          <p className="source-ids">
            Supporting records:{" "}
            {f.sourceIds.length
              ? f.sourceIds.map((id, index) => (
                  <span key={id}>
                    {index > 0 ? ", " : ""}
                    <a href={`#record-${id}`}>{id}</a>
                  </span>
                ))
              : "None available"}
          </p>
        </section>
      ))}
      <div className="execution-table">
        <table>
          <caption>Execution records supporting these checks</caption>
          <thead>
            <tr>
              <th>Record</th>
              <th>Time · IST</th>
              <th>Quantity</th>
              <th>Price · ₹</th>
            </tr>
          </thead>
          <tbody>
            {executions
              .filter((e) => sourceIds.has(e.id))
              .map((e) => (
                <tr key={e.id} id={`record-${e.id}`}>
                  <td>
                    <code>{e.id}</code>
                  </td>
                  <td>{timestampInfo(e.timestamp)?.clock ?? "Unavailable"}</td>
                  <td>{e.quantity}</td>
                  <td>{e.price.toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {levels.length > 0 ? (
        <div className="execution-table">
          <table>
            <caption>
              Available plan records · recording time, not order execution
            </caption>
            <thead>
              <tr>
                <th>Record</th>
                <th>Recorded · IST</th>
                <th>Price · ₹</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level.id} id={`record-${level.id}`}>
                  <td>
                    <code>{level.id}</code>
                  </td>
                  <td>
                    {timestampInfo(level.recordedAt)?.clock ?? "Unavailable"}
                  </td>
                  <td>{level.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="fine-print">
        Plan checks cannot prove a protective broker order was placed or
        honoured. Breakout validity, emotions and weekly patterns are not
        assessed. All instruments, prices and executions are invented.
      </p>
    </Modal>
  );
}
function TradeStory({
  position,
  review,
}: {
  position: Position;
  review: Review;
}) {
  const entry = entryMetrics(position);
  const plan = planMetrics(position);
  const result = grossResult(position);
  const findings = review.findings.filter((f) => f.positionId === position.id);
  const deviations = findings.filter((f) => f.status === "deviated").length;
  const unknown = findings.filter(
    (f) => f.status === "insufficient_evidence",
  ).length;
  const reflection =
    result === null
      ? "The available executions cannot establish a closed-position result."
      : deviations
        ? `${result >= 0 ? "A positive" : "A negative"} result, with ${deviations} confirmed ${deviations === 1 ? "deviation" : "deviations"}. Outcome alone does not show whether the rules were followed.`
        : unknown
          ? "The outcome is visible. Some parts of the original plan still cannot be verified."
          : result < 0
            ? "A losing trade that followed every checked rule. A loss alone does not show a failure of discipline."
            : "A positive result, with every checked rule followed. This single position does not establish strategy performance.";
  return (
    <div className="trade-story">
      <div className="trade-heading">
        <div>
          <p className="context">
            Position {position.id} ·{" "}
            {position.direction ? `${position.direction} equity` : "equity"}
          </p>
          <h2>{position.name ?? position.instrument}</h2>
          <p className="instrument-name">
            {position.instrument} · invented instrument
          </p>
        </div>
        <div className="trade-outcome">
          <span>Closed-position result · gross</span>
          <strong>
            {result === null
              ? "Unavailable"
              : `${result > 0 ? "+" : ""}${rupees(result)}`}
          </strong>
          <small>Fictional fills · fees excluded</small>
        </div>
      </div>
      {entry ? (
        <div className="trade-metrics">
          <div>
            <span>Weighted entry</span>
            <strong>{rupees(entry.price)}</strong>
            <small>{entry.quantity} shares · initial fills combined</small>
          </div>
          <div>
            <span>Initial planned risk</span>
            <strong>
              {plan.risk === null ? "Unverified" : rupees(plan.risk)}
            </strong>
            <small>Filled quantity × stop distance</small>
          </div>
          <div>
            <span>Planned reward-to-risk</span>
            <strong>
              {plan.rewardRisk === null
                ? "Unverified"
                : `${plan.rewardRisk.toFixed(2)}R`}
            </strong>
            <small>Target distance ÷ stop distance</small>
          </div>
        </div>
      ) : null}
      <div
        className="position-journey"
        aria-label="Available executions in timestamp order"
      >
        {[...position.executions]
          .sort(
            (a, b) =>
              (timestampInfo(a.timestamp)?.epoch ?? Infinity) -
              (timestampInfo(b.timestamp)?.epoch ?? Infinity),
          )
          .map((e) => (
            <div key={e.id}>
              <span className={`journey-marker ${e.side}`} />
              <small>
                {timestampInfo(e.timestamp)?.clock ?? "Unknown"} IST
              </small>
              <strong>
                {e.side === "entry" ? "Entry" : "Exit"} · {e.quantity} shares
              </strong>
              <span>{rupees(e.price)}</span>
            </div>
          ))}
      </div>
      <div className="plan-records">
        <p>
          <span>Stop plan</span>{" "}
          {position.stop
            ? `${rupees(position.stop.price)} · recorded ${timestampInfo(position.stop.recordedAt)?.clock ?? "time unknown"} IST`
            : "No recorded stop available"}
        </p>
        <p>
          <span>Target plan</span>{" "}
          {position.target
            ? `${rupees(position.target.price)} · recorded ${timestampInfo(position.target.recordedAt)?.clock ?? "time unknown"} IST`
            : "No recorded target available"}
        </p>
      </div>
      <p className="trade-reflection">{reflection}</p>
    </div>
  );
}
export function SessionReview({
  review,
  onExample,
  focus,
  onFocus,
  onSave,
  onBack,
  error,
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  review: Review;
  onExample: (mode: ExampleMode) => void;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
  onSave: () => void;
  onBack: () => void;
  error: string;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const summary = reviewSummary(review);
  const position =
    review.session.positions.find((p) => p.id === selectedId) ??
    review.session.positions[0];
  const findings = review.findings.filter((f) => f.positionId === position.id);
  const icons = {
    "entry-check": ClipboardCheck,
    "daily-limit": BarChart3,
    "risk-plan": ShieldCheck,
    later: Clock3,
  };
  const status = positionStatus(review, position.id);
  const mode =
    review.session.exampleMode ??
    (review.session.recordsComplete ? "full" : "daily-gap");
  return (
    <main id="content" className="review page-enter">
      <Progress current={focus ? 3 : 2} />
      <div className="screen-heading">
        <p className="context">
          Fictional equity session · 23 September 2026
          {review.rules.comparison === "hypothetical"
            ? " · What-if comparison"
            : ""}
        </p>
        <h1 tabIndex={-1} aria-live="polite">
          {summary.title}
        </h1>
        <p aria-live="polite">{summary.description}</p>
      </div>
      <fieldset className="coverage">
        <legend className="sr-only">Sample evidence example</legend>
        {examples.map((example) => (
          <label
            key={example.id}
            className={mode === example.id ? "active" : ""}
          >
            <input
              type="radio"
              name="coverage"
              checked={mode === example.id}
              onChange={() => onExample(example.id)}
            />
            {example.label}
          </label>
        ))}
      </fieldset>
      <p className="coverage-note">
        {mode === "daily-gap"
          ? "Other daily entries may be missing. Daily position order cannot be confirmed; available plan checks still work."
          : mode === "plan-gap"
            ? "Position D has no recorded stop or target. Its entry checks still work; original risk and reward-to-risk cannot be verified."
            : "All sample fills are available. Position B’s stop was recorded after entry, so its original planned risk cannot be verified."}
      </p>
      <ol className="timeline" aria-label="Select a sample position">
        {review.session.positions.map((p) => {
          const s = positionStatus(review, p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                aria-pressed={position.id === p.id}
                aria-label={`Position ${p.id}, ${p.instrument}, ${entryInfo(p)?.clock ?? "time unavailable"} IST, ${statusLabel[s]}`}
              >
                <span className="position-letter">{p.id}</span>
                <span className={`timeline-dot ${s}`} />
                <span className="position-time">
                  {entryInfo(p)?.clock ?? "Unknown"} <small>IST</small>
                </span>
                <span className="timeline-instrument">{p.instrument}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <section
        className="position-review"
        aria-label={`Position ${position.id} results`}
      >
        <TradeStory position={position} review={review} />
        <div className="rule-review">
          <h3>Your rule checks</h3>
          <div className="finding-list">
            {findings.map((f) => (
              <div className="finding-row" key={f.ruleId}>
                <div>
                  <strong>{RULE_LABELS[f.ruleId]}</strong>
                  <span>{f.label}</span>
                </div>
                <Status status={f.status} />
              </div>
            ))}
          </div>
          <button className="outline" onClick={() => setEvidenceOpen(true)}>
            {status === "deviated"
              ? "Why was this flagged?"
              : status === "insufficient_evidence"
                ? "What is missing?"
                : "See supporting evidence"}
            <ChevronDown size={18} />
          </button>
        </div>
      </section>
      <section className="focus-section">
        <h2>What would you like to focus on next?</h2>
        <div
          className="focus-options"
          role="group"
          aria-label="Your next focus"
        >
          {(Object.keys(FOCUS_LABELS) as Focus[])
            .filter((choice) => choice !== "risk-plan" || !!review.rules.checks)
            .map((choice) => {
              const Icon = icons[choice];
              return (
                <button
                  key={choice}
                  aria-pressed={focus === choice}
                  onClick={() => onFocus(choice)}
                >
                  <span className="focus-icon">
                    <Icon size={25} aria-hidden="true" />
                  </span>
                  {FOCUS_LABELS[choice]}
                </button>
              );
            })}
        </div>
        <div className="center-actions">
          <button className="primary" disabled={!focus} onClick={onSave}>
            Save my next step <Arrow />
          </button>
          {!focus ? (
            <p className="save-hint">
              Choose a focus, or choose later, to continue.
            </p>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="back" onClick={onBack}>
            Back to my rules
          </button>
        </div>
      </section>
      <p className="page-footnote">
        {review.rules.comparison === "hypothetical"
          ? "Comparison against sample history"
          : "Original sample plan"}{" "}
        · {review.rules.maxPositions} positions per day · before{" "}
        {review.rules.cutoff} IST
        {review.rules.checks ? ` · ${findings.length} rules checked` : ""}
      </p>
      {evidenceOpen ? (
        <Evidence
          review={review}
          position={position}
          onClose={() => setEvidenceOpen(false)}
        />
      ) : null}
    </main>
  );
}
