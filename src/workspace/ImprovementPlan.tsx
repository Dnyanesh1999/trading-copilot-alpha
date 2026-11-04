import { needsReview } from "../core/review";
import { study } from "../study/client";
import { useState } from "react";
import { ArrowRight, Check, Save, Target, Copy } from "lucide-react";
import type { Finding, Review } from "../core/types";
import { improvementsFor } from "../core/improvement";
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      /* Keep manual fallback visible. */
    }
    field.remove();
    previous?.focus();
    return copied;
  }
}
export function ImprovementPlan({
  review,
  initialFocus,
  onSave,
  onEvidence,
  saved,
}: {
  review: Review;
  initialFocus: string;
  onSave: (focus: string) => void;
  onEvidence: (finding: Finding) => void;
  saved: boolean;
}) {
  const plans = improvementsFor(review);
  const [selected, setSelected] = useState(
    () => plans.find((p) => p.title === initialFocus)?.id ?? plans[0].id,
  );
  const [expanded, setExpanded] = useState(false);
  const [copy, setCopy] = useState<{ id: string; ok: boolean } | null>(null);
  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const visible = expanded ? plans : plans.slice(0, 3);
  return (
    <section
      id="next-focus"
      tabIndex={-1}
      className="panel improvement-panel"
      onFocusCapture={() => study.start("action")}
    >
      <div className="improvement-title">
        <Target size={21} />
        <h2>Make the next review count.</h2>
      </div>
      <p className="muted">
        Choose one action to practise. These calculations describe your
        checklist, not a recommendation to place a trade.
      </p>
      <div
        className="action-options"
        role="group"
        aria-label="Next review action"
      >
        {visible.map((p, i) => (
          <article
            key={p.id}
            className={`action-card ${selected === p.id ? "selected" : ""}`}
          >
            <div className="action-top">
              <small>
                {p.kind === "deviation"
                  ? "Broke rule"
                  : p.kind === "reported"
                    ? p.findings.some(needsReview)
                      ? "Needs review"
                      : "Reported plan"
                    : p.kind === "evidence"
                      ? "Not enough data"
                      : "Keep practising"}
              </small>
              {i === 0 && (
                <span className="recommend-pill">Recommended first</span>
              )}
            </div>
            <h3>{p.title}</h3>
            <p>{p.reason}</p>
            <h4>Before your next trade</h4>
            <p>{p.steps[0]}</p>
            <button
              className="text-button"
              onClick={async () =>
                setCopy({ id: p.id, ok: await copyText(p.steps[0]) })
              }
            >
              <Copy size={14} />
              Copy
            </button>
            {copy?.id === p.id && (
              <div role="status">
                {copy.ok
                  ? "Copied"
                  : "Copy unavailable. Select and copy the text below."}
                {!copy.ok && (
                  <textarea
                    aria-label="Text to copy"
                    readOnly
                    value={p.steps[0]}
                    onFocus={(e) => e.target.select()}
                  />
                )}
              </div>
            )}
            <h4>In your next review</h4>
            <p>{p.steps[1]}</p>
            <div className="action-card-controls">
              <button
                className="secondary"
                aria-pressed={selected === p.id}
                onClick={() => setSelected(p.id)}
              >
                {selected === p.id && <Check size={14} />}{" "}
                {selected === p.id ? "Selected focus" : "Choose this focus"}
              </button>
              {p.findings[0] && (
                <button
                  className="text-button"
                  onClick={() => onEvidence(p.findings[0])}
                >
                  Show proof
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {plans.length > 3 && (
        <button
          className="secondary"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `+${plans.length - 3} more`}
        </button>
      )}
      <div className="action-detail">
        <p>
          Selected focus: <strong>{plan.title}</strong>
        </p>
        <button className="primary" onClick={() => onSave(plan.title)}>
          {saved ? <Check size={16} /> : <Save size={16} />}{" "}
          {saved ? "Update saved review" : "Save review & action plan"}
        </button>
      </div>
      {initialFocus && !plans.some((p) => p.title === initialFocus) && (
        <p className="field-note">
          Previously saved focus: {initialFocus}. Choose a current action to
          update it.
        </p>
      )}
    </section>
  );
}
