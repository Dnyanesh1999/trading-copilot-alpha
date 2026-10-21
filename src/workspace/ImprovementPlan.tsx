import { study } from "../study/client";
import { useState } from "react";
import { ArrowRight, Check, Save, Target, CircleCheck } from "lucide-react";
import type { Finding, Review } from "../core/types";
import { improvementsFor } from "../core/improvement";
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
  const [chosen, setChosen] = useState(!!initialFocus);
  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  return (
    <section
      className="panel improvement-panel"
      onFocusCapture={() => study.start("action")}
    >
      <div className="section-title">
        <div>
          <div className="improvement-title">
            <Target size={21} />
            <h2>Make the next review count.</h2>
          </div>
          <p className="muted">
            Start with one documented process gap. Choose the action you want to
            practise.
          </p>
        </div>
      </div>
      <div
        className="action-options"
        role="radiogroup"
        aria-label="Next review action"
      >
        {plans.map((p, i) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={selected === p.id}
            tabIndex={selected === p.id ? 0 : -1}
            onKeyDown={(e) => {
              if (
                ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(
                  e.key,
                )
              ) {
                e.preventDefault();
                const next =
                  (i +
                    (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) +
                    plans.length) %
                  plans.length;
                setSelected(plans[next].id);
                setChosen(true);
                e.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
                  [next]?.focus();
              }
            }}
            className={`action-card ${selected === p.id ? "selected" : ""}`}
            onClick={() => {
              setSelected(p.id);
              setChosen(true);
            }}
          >
            <div className="action-top">
              <span className="radio-dot">
                {selected === p.id && <Check size={12} />}
              </span>
              {i === 0 && (
                <span className="recommend-pill">Recommended first</span>
              )}
              <small>
                {p.kind === "deviation"
                  ? "Confirmed deviation"
                  : p.kind === "reported"
                    ? "Needs review"
                    : p.kind === "evidence"
                      ? "Evidence gap"
                      : "Keep practising"}
              </small>
            </div>
            <strong>{p.title}</strong>
            <p>{p.reason}</p>
          </button>
        ))}
      </div>
      <div className="action-detail" key={plan.id}>
        <div>
          <h3>
            {plan.kind === "evidence"
              ? "For your next review"
              : "Before your next entry"}
          </h3>
          <ol>
            {plan.steps.map((step) => (
              <li key={step}>
                <CircleCheck size={16} />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="action-detail-side">
          {plan.findings[0] && (
            <button
              className="text-button"
              onClick={() => onEvidence(plan.findings[0])}
            >
              See why this was suggested
              <ArrowRight size={15} />
            </button>
          )}
          <p>
            {chosen
              ? "Your selection is ready to save."
              : "Suggested from this review. Confirm the focus that makes sense to you."}
          </p>
          <button
            className="primary"
            onClick={() => {
              setChosen(true);
              onSave(plan.title);
            }}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}{" "}
            {saved ? "Update saved review" : "Save review & action plan"}
          </button>
        </div>
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
