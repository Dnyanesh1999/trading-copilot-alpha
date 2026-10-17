import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Download, Save } from "lucide-react";
import type { ReviewEntry } from "./persistence";
import { downloadJson } from "./persistence";
import { workspaceJourney } from "./InternalJourney";
import {
  grossResult,
  positionStatus,
  reviewSummary,
  rupees,
  RULE_LABELS,
} from "../core/review";
const statusText = {
  followed: "Followed",
  deviated: "Revisit",
  insufficient_evidence: "Evidence missing",
};
export function ReviewView({
  entry,
  onSave,
  onBack,
  saved,
}: {
  entry: ReviewEntry;
  onSave: (focus: string) => void;
  onBack: () => void;
  saved: boolean;
}) {
  const [selected, setSelected] = useState(
    entry.review.session.positions[0]?.id ?? "",
  );
  const [focus, setFocus] = useState(entry.focus);
  const review = entry.review;
  const position = review.session.positions.find((p) => p.id === selected);
  const summary = reviewSummary(review);
  const findings = review.findings.filter((f) => f.positionId === selected);
  return (
    <>
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to trades
      </button>
      <section className="review-heading">
        <div>
          <p className="muted">
            {entry.source === "sample"
              ? "Fictional sample · hypothetical comparison"
              : "Your entered trades · user-supplied evidence"}
          </p>
          <h2>{summary.title}</h2>
          <p className="muted">{summary.description}</p>
        </div>
        <button
          className="secondary"
          onClick={() => downloadJson("trade-review.json", entry)}
        >
          <Download size={16} />
          Export review
        </button>
      </section>
      <div className="applied-checklist">
        <strong>{entry.strategyName} · confirmed checklist</strong>
        <p>
          {(
            review.rules.enabledRules ?? [
              "daily-limit",
              "entry-cutoff",
              ...(review.rules.checks
                ? ["stop-before-entry", "planned-risk", "reward-risk"]
                : []),
            ]
          )
            .map((id) =>
              id === "planned-risk"
                ? `Risk ≤ ${rupees(review.rules.checks?.maxRisk ?? 0)}`
                : id === "reward-risk"
                  ? `Reward-to-risk ≥ ${review.rules.checks?.minRewardRisk}R`
                  : id === "daily-limit"
                    ? `≤ ${review.rules.maxPositions} new positions / IST day`
                    : id === "entry-cutoff"
                      ? `Entry before ${review.rules.cutoff} IST`
                      : "Stop recorded before entry",
            )
            .join(" · ")}
        </p>
        <small>
          Saved with this review. Later strategy edits do not change it.
        </small>
      </div>
      <div className="review-layout">
        <aside className="panel position-list">
          <h3>Your positions</h3>
          {review.session.positions.map((p) => (
            <button
              key={p.id}
              className={selected === p.id ? "selected" : ""}
              onClick={() => {
                workspaceJourney.action("position_selected");
                setSelected(p.id);
              }}
            >
              <span>
                <strong>{p.instrument}</strong>
                <small>
                  {p.direction === "short" ? "Short" : "Long"} ·{" "}
                  {p.executions
                    .filter((e) => e.side === "entry")
                    .reduce((n, e) => n + e.quantity, 0)}{" "}
                  units
                </small>
              </span>
              <span className={`status ${positionStatus(review, p.id)}`}>
                {statusText[positionStatus(review, p.id)]}
              </span>
            </button>
          ))}
        </aside>
        <section className="panel findings-panel">
          <div className="section-title">
            <div>
              <h2>{position?.instrument}</h2>
              <p className="muted">Each finding links back to your records.</p>
            </div>
            <div className="result-number">
              <small>Gross result</small>
              <strong>
                {position && grossResult(position) !== null
                  ? rupees(grossResult(position)!)
                  : "Not available"}
              </strong>
            </div>
          </div>
          <p className="field-note">
            Profit or loss is separate from rule adherence. Gross result
            excludes fees, slippage and taxes.
          </p>
          {findings.map((f) => (
            <details
              className="finding"
              key={f.ruleId}
              onToggle={(e) => {
                if (e.currentTarget.open)
                  workspaceJourney.action("evidence_opened");
              }}
            >
              <summary>
                <span className={`finding-dot ${f.status}`} />
                <span>
                  <strong>{RULE_LABELS[f.ruleId]}</strong>
                  <small>{f.label}</small>
                </span>
                <span className={`status ${f.status}`}>
                  {statusText[f.status]}
                </span>
                <ChevronDown size={15} />
              </summary>
              <div className="finding-detail">
                <p>{f.explanation}</p>
                <code>{f.calculation}</code>
                <h4>Supporting records</h4>
                <ul>
                  {f.sourceIds.map((id) => {
                    const execution = review.session.positions
                      .flatMap((p) => p.executions)
                      .find((e) => e.id === id);
                    const plan =
                      position?.stop?.id === id
                        ? position.stop
                        : position?.target?.id === id
                          ? position.target
                          : null;
                    return (
                      <li key={id}>
                        {execution
                          ? `${execution.side === "entry" ? "Entry" : "Exit"}: ${execution.quantity} × ${rupees(execution.price)} · ${execution.timestamp ?? "time missing"}`
                          : plan
                            ? `Plan: ${rupees(plan.price)} · ${plan.recordedAt ?? "recording time missing"}`
                            : `Record ${id}`}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          ))}
        </section>
      </div>
      <section className="panel focus-panel">
        <div>
          <h2>One useful next step.</h2>
          <p className="muted">Choose what to check before your next entry.</p>
        </div>
        <label className="sr-only" htmlFor="focus">
          Your next focus
        </label>
        <select
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
        >
          <option value="">Choose a focus…</option>
          <option>Record my stop and target before entry</option>
          <option>Check planned risk before sizing a position</option>
          <option>Check planned reward-to-risk</option>
          <option>Review my entry boundaries</option>
          <option>Keep following my confirmed checklist</option>
          <option>Decide after another review</option>
        </select>
        <button
          className="primary"
          disabled={!focus}
          onClick={() => onSave(focus)}
        >
          {saved ? <Check size={16} /> : <Save size={16} />}{" "}
          {saved ? "Saved · update focus" : "Save review"}
        </button>
      </section>
    </>
  );
}
