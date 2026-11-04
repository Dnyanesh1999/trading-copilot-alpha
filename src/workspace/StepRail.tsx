import { Check, ArrowRight } from "lucide-react";
const steps = ["Rules", "Trades", "Review", "Next focus"];
const actions = [
  "Review rules",
  "Add trades",
  "Choose next focus",
  "Go to next focus",
];
export function StepRail({
  current,
  complete = false,
  onContinue,
  primary = false,
}: {
  current: number;
  complete?: boolean;
  onContinue: () => void;
  primary?: boolean;
}) {
  return (
    <section className="step-rail" aria-label="Review progress">
      <ol>
        {steps.map((step, i) => (
          <li
            key={step}
            className={
              i < current || complete
                ? "done"
                : i === current
                  ? "current"
                  : "next"
            }
            aria-current={!complete && i === current ? "step" : undefined}
          >
            <span>{i < current || complete ? <Check size={13} /> : i + 1}</span>
            {step}
            <small>
              {i < current || complete
                ? "Done"
                : i === current
                  ? "Current"
                  : "Next"}
            </small>
          </li>
        ))}
      </ol>
      <p className="mobile-step">
        {complete
          ? "Review saved"
          : `Step ${current + 1} of ${steps.length} — ${current === 0 ? "Confirm rules" : current === 1 ? "Add trades" : steps[current]}`}
      </p>
      <div
        className="step-track"
        role="progressbar"
        aria-label="Review steps completed"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={complete ? steps.length : current}
      >
        <span
          style={{ width: `${(complete ? 1 : current / steps.length) * 100}%` }}
        />
      </div>
      <button
        className={primary ? "primary" : "secondary"}
        onClick={onContinue}
      >
        {complete ? "Review saved focus" : actions[current]}
        <ArrowRight size={14} />
      </button>
    </section>
  );
}
