import { Minus, Plus } from "lucide-react";
import { Arrow, Progress } from "./Chrome";
export interface Draft {
  maxPositions: string;
  cutoff: string;
}
export function Rules({
  draft,
  onChange,
  onConfirm,
  onBack,
  error,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onConfirm: () => void;
  onBack: () => void;
  error: string;
}) {
  const defaults = draft.maxPositions === "3" && draft.cutoff === "11:00";
  const changeCount = (delta: number) =>
    onChange({
      ...draft,
      maxPositions: String(
        Math.min(50, Math.max(1, (Number(draft.maxPositions) || 0) + delta)),
      ),
    });
  return (
    <main id="content" className="rules page-enter">
      <Progress current={1} />
      <div className="screen-heading">
        <p className="context">A fictional session. A simple place to start.</p>
        <h1 tabIndex={-1}>Start with two simple rules.</h1>
        <p>What would you like to check? Make the limits yours.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <div className="rule-controls">
          <div className="rule-card peach">
            <label htmlFor="max-positions">Maximum new positions per day</label>
            <div className="number-control">
              <button
                type="button"
                onClick={() => changeCount(-1)}
                aria-label="Decrease daily position limit"
                disabled={Number(draft.maxPositions) <= 1}
              >
                <Minus />
              </button>
              <input
                id="max-positions"
                type="number"
                min="1"
                max="50"
                step="1"
                value={draft.maxPositions}
                onChange={(e) =>
                  onChange({ ...draft, maxPositions: e.target.value })
                }
                required
              />
              <button
                type="button"
                onClick={() => changeCount(1)}
                aria-label="Increase daily position limit"
                disabled={Number(draft.maxPositions) >= 50}
              >
                <Plus />
              </button>
            </div>
            <p>Partial fills belong to the same position. They count once.</p>
          </div>
          <div className="rule-card lavender">
            <label htmlFor="cutoff">Enter new positions before</label>
            <div className="time-control">
              <input
                id="cutoff"
                type="time"
                step="60"
                value={draft.cutoff}
                onInput={(e) =>
                  onChange({ ...draft, cutoff: e.currentTarget.value })
                }
                onChange={(e) => onChange({ ...draft, cutoff: e.target.value })}
                required
              />
              <span>IST</span>
            </div>
            <p>
              “Before” is strict: an entry exactly at this time is too late.
            </p>
          </div>
        </div>
        <p className="comparison-note">
          {defaults
            ? "These are the original rules for our fictional sample session."
            : "Changing the rules compares your choices against sample history. It does not change the original trading plan."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="center-actions">
          <button className="primary" type="submit">
            Confirm my rules <Arrow />
          </button>
          <button type="button" className="back" onClick={onBack}>
            Back to welcome
          </button>
        </div>
      </form>
    </main>
  );
}
