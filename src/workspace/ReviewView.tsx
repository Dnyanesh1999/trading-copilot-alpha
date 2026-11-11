import { StatusPill } from "./StatusPill";
import { motion, useReducedMotion } from "motion/react";
import { TermChip } from "./TermChip";
import { recordTime, ruleTerm } from "../core/glossary";
import { study } from "../study/client";
import { useToast } from "./Toasts";
import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import type { Position } from "../core/types";
import type { ReviewEntry } from "./persistence";
import { downloadJson } from "./persistence";
import { exportReview } from "../core/saved-review";
import { correctStopRecord } from "../core/workspace";
import { stopDeclaration, type StopDeclaration } from "../core/stop-record";
import { workspaceJourney } from "./InternalJourney";
import { ImprovementPlan } from "./ImprovementPlan";
import { replayBanner, replayCalculation, replayPrice } from "./replay-display";
import {
  grossResult,
  planMetrics,
  positionStatus,
  needsReview,
  initialPositionErrors,
  stopRecordNeedsCorrection,
  reviewSummary,
  rupees,
  RULE_LABELS,
} from "../core/review";
function istLocal(value: string | null | undefined) {
  const epoch = value ? Date.parse(value) : NaN;
  return Number.isFinite(epoch)
    ? new Date(epoch + 330 * 60_000).toISOString().slice(0, 16)
    : "";
}
function StopRecordEditor({
  position,
  onCorrect,
}: {
  position: Position;
  onCorrect: (position: Position) => void;
}) {
  const [declaration, setDeclaration] = useState<StopDeclaration>(
    stopDeclaration(position),
  );
  const [price, setPrice] = useState(
    position.stop ? String(position.stop.price) : "",
  );
  const [recordedAt, setRecordedAt] = useState(
    istLocal(position.stop?.recordedAt),
  );
  const [timeUnknown, setTimeUnknown] = useState(!position.stop?.recordedAt);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(() =>
    stopRecordNeedsCorrection(position),
  );
  if (!expanded)
    return (
      <button
        className="text-button stop-edit-toggle"
        aria-expanded="false"
        onClick={() => setExpanded(true)}
      >
        Edit stop record
      </button>
    );
  return (
    <section className="stop-record-editor" aria-label="Correct stop record">
      <div>
        <strong>Correct this stop record</strong>
        <p className="field-note">
          Use the initial stop you had at entry. Later trailing or breakeven
          levels do not belong here.
        </p>
      </div>
      <div className="stop-record-fields">
        <label>
          Stop information
          <select
            value={declaration}
            onChange={(e) => {
              setDeclaration(e.target.value as StopDeclaration);
              setError("");
            }}
          >
            <option value="had-stop">Had a stop</option>
            <option value="no-stop">No stop</option>
            <option value="not-recorded">Not recorded / unsure</option>
          </select>
        </label>
        {declaration === "had-stop" && (
          <>
            <label>
              Initial stop price
              <input
                type="number"
                min="0.000001"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Recorded at (IST)
              <input
                type="datetime-local"
                value={recordedAt}
                disabled={timeUnknown}
                onChange={(e) => setRecordedAt(e.target.value)}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={timeUnknown}
                onChange={(e) => setTimeUnknown(e.target.checked)}
              />{" "}
              Recording time unknown
            </label>
          </>
        )}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button
        className="secondary"
        onClick={() => {
          try {
            onCorrect(
              correctStopRecord(
                position,
                declaration,
                price,
                recordedAt,
                timeUnknown,
              ),
            );
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Update findings
      </button>
    </section>
  );
}
export function ReviewView({
  entry,
  onSave,
  onBack,
  onCorrect,
  saved,
  onFocusChange,
}: {
  entry: ReviewEntry;
  onSave: (focus: string) => void;
  onBack: () => void;
  onCorrect: (position: Position) => void;
  saved: boolean;
  onFocusChange?: (title: string) => void;
}) {
  const notify = useToast();
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(
    entry.review.session.positions[0]?.id ?? "",
  );
  const [evidenceRule, setEvidenceRule] = useState<string | null>(null);
  const review = entry.review;
  const replay = review.session.historicalReplay;
  const position = review.session.positions.find((p) => p.id === selected);
  const summary = reviewSummary(review);
  const findings = review.findings.filter((f) => f.positionId === selected);
  const invalidLevels = review.session.positions.flatMap((p) => {
    const issue = initialPositionErrors(p);
    return [
      issue.stop && `${p.instrument}: Invalid initial stop — ${issue.stop}`,
      issue.target &&
        `${p.instrument}: Invalid initial target — ${issue.target}`,
    ].filter((item): item is string => !!item);
  });
  return (
    <>
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to trades
      </button>
      <section className="review-heading">
        <div>
          <p className="muted">
            {replay
              ? `${replay.priceSource === "dhan" ? "Dhan daily prices" : "Historical prices"} · simulated entry and plan`
              : entry.source === "sample" ||
            review.session.dataSource === "fictional"
              ? "Fictional sample · hypothetical comparison"
              : entry.source === "csv"
                ? "Imported CSV · user-supplied evidence"
                : "Your entered trades · user-supplied evidence"}
          </p>
          <h2>{summary.title}</h2>
          <p className="muted">{summary.description}</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            downloadJson("trade-review.json", exportReview(entry));
            notify({
              title: "Review export ready",
              description: "Your JSON download has started.",
              tone: "info",
            });
          }}
        >
          <Download size={16} />
          Export review
        </button>
      </section>
      {replay && (
        <p className="review-alert">{replayBanner(review.session)}</p>
      )}
      {replay && replay.priceSource !== "dhan" && replay.weekendDates?.map((date) => (
        <p className="review-alert" key={date}>
          Includes a weekend session on {date}. Check it was a real exchange session.
        </p>
      ))}
      {entry.recomputed && (
        <p className="review-alert" role="status">
          This older review has been recalculated with review logic version 3.
          Your original trade inputs, confirmed rules and saved date have not
          changed. Save explicitly to keep these results.
        </p>
      )}
      {(!saved || (!replay && summary.counts.noStopRecord > 0)) && <section className="review-alert combined-notice" role="status">
        {!saved && <p>Not saved yet</p>}
        {!replay && summary.counts.noStopRecord > 0 && <><strong>{summary.counts.noStopRecord} of {summary.counts.trades} trades have no stop record.</strong><p>{summary.counts.noStop} explicitly marked No stop · {summary.counts.unresolvedStopRecords} not recorded or unresolved. Open a position below to correct its record.</p></>}
      </section>}
      {invalidLevels.map((message, i) => (
        <p className="review-alert" role="alert" key={`${i}-${message}`}>
          {message}
        </p>
      ))}
      <div className="applied-checklist">
        <strong>{entry.strategyName} · confirmed checklist</strong>
        {review.rules.setup && (
          <p>
            <strong>{review.rules.setup.label}</strong> · documented signal
            check · long entries
          </p>
        )}
        <p>
          {(
            review.rules.enabledRules ?? [
              "daily-limit",
              "entry-cutoff",
              ...(review.rules.checks
                ? ["stop-before-entry", "planned-risk", "reward-risk"]
                : []),
            ]
          ).map((id) => (
            <span className="checklist-term" key={id}>
              {ruleTerm(id as import("../core/types").RuleId) ? (
                <TermChip
                  term={ruleTerm(id as import("../core/types").RuleId)!}
                  position={position}
                />
              ) : (
                "Documented setup"
              )}
              {id === "planned-risk"
                ? ` ≤ ${rupees(review.rules.checks?.maxRisk ?? 0)}`
                : id === "reward-risk"
                  ? ` ≥ ${review.rules.checks?.minRewardRisk}R`
                  : id === "daily-limit"
                    ? `: ${review.rules.maxPositions}`
                    : id === "entry-cutoff"
                      ? `: ${review.rules.cutoff} IST`
                      : ""}
            </span>
          ))}
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
              <StatusPill
                status={
                  positionStatus(review, p.id) === "insufficient_evidence" &&
                  review.findings.some(
                    (f) => f.positionId === p.id && needsReview(f),
                  )
                    ? "needs-review"
                    : positionStatus(review, p.id)
                }
              />
            </button>
          ))}
        </aside>
        <section
          className="panel findings-panel"
          id="review-evidence"
          tabIndex={-1}
        >
          <div className="section-title">
            <div>
              <h2>{position?.instrument}</h2>
              <p className="muted">Each finding links back to your records.</p>
              {position && (
                <p>
                  <TermChip term="average-entry" />:{" "}
                  {planMetrics(position).entryPrice !== null
                    ? rupees(planMetrics(position).entryPrice!)
                    : "Not available"}
                </p>
              )}
            </div>
            <div className="result-number">
              <small>
                <TermChip term="gross-result" />
              </small>
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
          {replay && position && (!position.stop || !position.target) && (
            <p className="field-note">
              Simulated plan: add a stop and target in the replay form to check risk and reward.
            </p>
          )}
          {!replay && position && (
            <StopRecordEditor
              key={`${position.id}-${position.stopDeclaration}-${position.stop?.price}-${position.stop?.recordedAt}`}
              position={position}
              onCorrect={onCorrect}
            />
          )}
          {findings.map((f, index) => (
            <motion.details
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.08,
                delay: reducedMotion ? 0 : Math.min(index * 0.06, 0.3),
              }}
              className="finding"
              open={evidenceRule === f.ruleId ? true : undefined}
              key={`${selected}-${f.ruleId}`}
              onToggle={(e) => {
                if (e.currentTarget.open) {
                  study.evidence();
                  workspaceJourney.action("evidence_opened");
                }
              }}
            >
              <summary>
                <span>
                  <strong>
                    {ruleTerm(f.ruleId) ? (
                      <TermChip
                        term={ruleTerm(f.ruleId)!}
                        position={position}
                      />
                    ) : (
                      RULE_LABELS[f.ruleId]
                    )}
                  </strong>
                  <small>{f.label}</small>
                </span>
                <StatusPill
                  status={needsReview(f) ? "needs-review" : f.status}
                />

                <button
                  className="secondary proof-button"
                  aria-label={`Show proof for ${RULE_LABELS[f.ruleId]}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const details = e.currentTarget.closest("details")!;
                    details.open = !details.open;
                    if (!details.open) setEvidenceRule(null);
                  }}
                >
                  <span className="show-proof">Show proof</span>
                  <span className="hide-proof">Hide proof</span>
                </button>
              </summary>
              <div className="finding-detail">
                <p>{f.explanation}</p>
                <code>{replay && position ? replayCalculation(f, position) : f.calculation}</code>
                {f.ruleId === "setup-entry" && replay?.series && (
                  <p className="field-note">
                    Source: {replay.series.source === "dhan" ? "Dhan" : "CSV"}
                    {replay.series.fileName && ` (${replay.series.fileName})`}
                    {" · "}Fetched: {replay.series.fetchedAt}
                    {" · "}SHA-256: {replay.series.sha256.slice(0, 12)}
                  </p>
                )}
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
                          ? `${execution.side === "entry" ? "Entry" : "Exit"}: ${execution.quantity} × ${rupees(execution.price)} · ${recordTime(execution.timestamp)}`
                          : id === `${position?.id}-signal` && position?.signal
                            ? `Signal close: ${replay ? replayPrice(position.signal.close) : position.signal.close ?? "missing"}; reference: ${replay ? replayPrice(position.signal.reference) : position.signal.reference ?? "missing"}; time: ${recordTime(position.signal.at)}${review.rules.setup?.kind === "ma-reclaim" ? `; previous close/reference: ${position.signal.previousClose ?? "missing"}/${position.signal.previousReference ?? "missing"}` : ""}${position.signal.rangeEnd ? `; range end: ${recordTime(position.signal.rangeEnd)}` : ""}`
                            : plan
                              ? `Plan: ${rupees(plan.price)} · ${recordTime(plan.recordedAt)}`
                              : `Record ${id}`}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </motion.details>
          ))}
        </section>
      </div>
      <ImprovementPlan
        onFocusChange={onFocusChange}
        review={review}
        initialFocus={entry.focus}
        onSave={onSave}
        saved={saved}
        onEvidence={(finding) => {
          setSelected(finding.positionId);
          setEvidenceRule(finding.ruleId);
          requestAnimationFrame(() => {
            document.getElementById("review-evidence")?.scrollIntoView({
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
              block: "start",
            });
            document
              .getElementById("review-evidence")
              ?.focus({ preventScroll: true });
          });
        }}
      />
    </>
  );
}
