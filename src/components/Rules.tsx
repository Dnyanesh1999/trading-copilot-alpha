import { Minus, Plus } from "lucide-react";
import { Arrow, Progress } from "./Chrome";
export interface Draft {
  maxPositions: string;
  cutoff: string;
  extraChecks: boolean;
  maxRisk: string;
  minRewardRisk: string;
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
  const defaults =
    draft.maxPositions === "3" &&
    draft.cutoff === "11:00" &&
    draft.extraChecks &&
    draft.maxRisk === "500" &&
    draft.minRewardRisk === "2";
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
        <h1 tabIndex={-1}>Your session. Your boundaries.</h1>
        <p>
          Start with two entry rules. Your risk-plan checks are ready below.
        </p>
      </div>
      <form
        noValidate
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
        <details className="risk-settings">
          <summary>
            <span>Risk plan</span>
            <span className="risk-settings-preview">
              {draft.extraChecks
                ? `Pre-entry stop · ₹${draft.maxRisk} cap · ${draft.minRewardRisk}R minimum`
                : "Additional checks off"}
            </span>
          </summary>
          <div className="risk-settings-body">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={draft.extraChecks}
                onChange={(e) =>
                  onChange({ ...draft, extraChecks: e.target.checked })
                }
              />{" "}
              Include risk-plan checks
            </label>
            <p>
              A stop recorded before entry, a risk cap, and a planned
              reward-to-risk minimum. These check the recorded plan, not a
              broker’s protective order.
            </p>
            <div className="risk-inputs">
              <label htmlFor="max-risk">
                Maximum planned risk · ₹
                <input
                  id="max-risk"
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={!draft.extraChecks}
                  required={draft.extraChecks}
                  value={draft.maxRisk}
                  onChange={(e) =>
                    onChange({ ...draft, maxRisk: e.target.value })
                  }
                />
              </label>
              <label htmlFor="min-reward-risk">
                Minimum planned reward-to-risk · R
                <input
                  id="min-reward-risk"
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={!draft.extraChecks}
                  required={draft.extraChecks}
                  value={draft.minRewardRisk}
                  onChange={(e) =>
                    onChange({ ...draft, minRewardRisk: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="fine-print">
              Risk uses initial filled quantity and the distance to the
              pre-entry stop. Fees, slippage and gaps are excluded. A planned
              target is not a promised return.
            </p>
          </div>
        </details>
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
