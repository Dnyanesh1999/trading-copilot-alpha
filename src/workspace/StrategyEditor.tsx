import { useState } from "react";
import { ArrowRight, Check, Sparkles, AlertCircle } from "lucide-react";
import type { StrategyDraft } from "../core/workspace";
import type { RuleId } from "../core/types";
import { RULE_LABELS } from "../core/review";
import { analyzeStrategy, type StrategyAnalysis } from "../core/strategy-ai";
export function StrategyEditor({
  draft,
  onChange,
  onConfirm,
  confirmed,
}: {
  draft: StrategyDraft;
  onChange: (d: StrategyDraft) => void;
  onConfirm: () => void;
  confirmed: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState("");
  const [pending, setPending] = useState<RuleId[]>([]);
  const [model, setModel] = useState("");
  const update = (part: Partial<StrategyDraft>) => {
    setAnalysis(null);
    setPending([]);
    setAnswers("");
    onChange({ ...draft, ...part });
  };
  const toggle = (id: RuleId) =>
    update({
      enabledRules: draft.enabledRules.includes(id)
        ? draft.enabledRules.filter((r) => r !== id)
        : [...draft.enabledRules, id],
    });
  async function ask() {
    const snapshot = draft.description;
    setBusy(true);
    setError("");
    setAnalysis(null);
    try {
      const result = await analyzeStrategy(snapshot, answers);
      setAnalysis(result);
      setModel(result.model);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "AI is unavailable. You can still set your rules below.",
      );
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    if (!analysis) return;
    const next = { ...draft, enabledRules: [] as RuleId[] };
    const unresolved: RuleId[] = [];
    for (const rule of analysis.rules) {
      if (rule.value === null) {
        unresolved.push(rule.ruleId);
        continue;
      }
      if (rule.ruleId === "stop-before-entry" && rule.value === false) continue;
      next.enabledRules.push(rule.ruleId);
      if (rule.ruleId === "daily-limit") next.maxPositions = Number(rule.value);
      if (rule.ruleId === "entry-cutoff") next.cutoff = String(rule.value);
      if (rule.ruleId === "stop-before-entry") next.stopBeforeEntry = true;
      if (rule.ruleId === "planned-risk") next.maxRisk = Number(rule.value);
      if (rule.ruleId === "reward-risk")
        next.minRewardRisk = Number(rule.value);
    }
    setPending(unresolved);
    onChange(next);
    setAnalysis(null);
  }
  return (
    <div className="strategy-layout">
      <section className="panel editor-panel">
        <div className="section-title">
          <h2>Put your strategy into words.</h2>
          <Sparkles size={20} />
        </div>
        <p className="muted">
          Start with the rules you actually use. You stay in control of every
          check.
        </p>
        <label>
          Strategy name
          <input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={busy}
            maxLength={80}
          />
        </label>
        <label>
          Trading style
          <select
            value={draft.style}
            disabled={busy}
            onChange={(e) =>
              update({ style: e.target.value as StrategyDraft["style"] })
            }
          >
            <option value="swing">Swing trading</option>
            <option value="intraday">Intraday trading</option>
          </select>
        </label>
        <label>
          Your strategy
          <textarea
            rows={6}
            maxLength={6000}
            disabled={busy}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="For example: I swing trade equities. I record my stop before entering, risk no more than ₹500 per position, and aim for at least twice that risk."
          />
        </label>
        <p className="field-note">
          AI sends this text to Google. Use fictional, non-sensitive examples in
          this local build. Keep names and account details out.
        </p>
        <button
          className="primary"
          onClick={ask}
          disabled={busy || !draft.description.trim()}
        >
          <Sparkles size={16} />
          {busy ? "Clarifying your strategy…" : "Clarify with AI"}
        </button>
        {error && (
          <div className="notice" role="alert">
            <AlertCircle size={18} />
            <span>{error} Your rules below remain editable.</span>
          </div>
        )}
        {analysis && (
          <div className="ai-result">
            <h3>Proposed checks</h3>
            {analysis.rules.length ? (
              analysis.rules.map((r) => (
                <p key={r.ruleId}>
                  <strong>{RULE_LABELS[r.ruleId]}</strong> ·{" "}
                  {r.value === null ? "Needs clarification" : String(r.value)}
                </p>
              ))
            ) : (
              <p>No supported checks identified yet.</p>
            )}
            {analysis.questions.length > 0 && (
              <>
                <h3>A little more detail</h3>
                <ul>
                  {analysis.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <label>
                  Your answers
                  <textarea
                    value={answers}
                    onChange={(e) => setAnswers(e.target.value)}
                    rows={3}
                  />
                </label>
                <button className="secondary" onClick={ask} disabled={busy}>
                  Clarify again
                </button>
              </>
            )}
            {analysis.unsupported.length > 0 && (
              <div className="notice">
                Outside the current checks: {analysis.unsupported.join(" · ")}
              </div>
            )}
            <button
              className="primary"
              onClick={apply}
              disabled={!analysis.rules.some((r) => r.value !== null)}
            >
              Use these proposals <ArrowRight size={16} />
            </button>
            <small>
              Review the values before confirming. Model: {analysis.model}
            </small>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Your review checklist</h2>
        <p className="muted">
          Set these manually or start with AI proposals. Only selected checks
          run.
        </p>
        {(Object.keys(RULE_LABELS) as RuleId[]).map((id) => (
          <div
            className={`rule-row ${draft.enabledRules.includes(id) ? "enabled" : ""}`}
            key={id}
          >
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.enabledRules.includes(id)}
                disabled={busy}
                onChange={() => toggle(id)}
              />
              <span>{RULE_LABELS[id]}</span>
            </label>
            {draft.enabledRules.includes(id) && (
              <div className="rule-value">
                {id === "daily-limit" && (
                  <>
                    <input
                      disabled={busy}
                      aria-label="Maximum new positions per IST day"
                      type="number"
                      min="1"
                      max="50"
                      value={draft.maxPositions}
                      onChange={(e) =>
                        update({ maxPositions: Number(e.target.value) })
                      }
                    />
                    <span>new positions / IST day</span>
                  </>
                )}
                {id === "entry-cutoff" && (
                  <>
                    <input
                      disabled={busy}
                      aria-label="Entry cutoff in IST"
                      type="time"
                      value={draft.cutoff}
                      onChange={(e) => update({ cutoff: e.target.value })}
                    />
                    <span>IST · strictly before</span>
                  </>
                )}
                {id === "stop-before-entry" && (
                  <p>A timestamped stop plan before the first entry.</p>
                )}
                {id === "planned-risk" && (
                  <>
                    <span>₹</span>
                    <input
                      disabled={busy}
                      aria-label="Maximum planned risk in rupees"
                      type="number"
                      min="0.01"
                      step="any"
                      value={draft.maxRisk}
                      onChange={(e) =>
                        update({ maxRisk: Number(e.target.value) })
                      }
                    />
                    <span>maximum / position</span>
                  </>
                )}
                {id === "reward-risk" && (
                  <>
                    <input
                      disabled={busy}
                      aria-label="Minimum planned reward to risk"
                      type="number"
                      min="0.01"
                      step="any"
                      value={draft.minRewardRisk}
                      onChange={(e) =>
                        update({ minRewardRisk: Number(e.target.value) })
                      }
                    />
                    <span>R minimum · reward ÷ risk</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {pending.length > 0 && (
          <p className="notice">
            Unresolved proposals were left off:{" "}
            {pending.map((id) => RULE_LABELS[id]).join(", ")}.
          </p>
        )}
        <p className="field-note">
          These five checks cover documented entry and risk plans. Indicator
          signals, emotions and percentage-of-capital risk are outside this
          version.
        </p>
        {model && (
          <p className="field-note">
            Last AI model: {model}. Confirmed checks always run in code.
          </p>
        )}
        <button
          className="primary full"
          disabled={busy || draft.enabledRules.length === 0}
          onClick={onConfirm}
        >
          {confirmed ? <Check size={18} /> : <ArrowRight size={18} />}{" "}
          {confirmed
            ? "Rules confirmed · continue"
            : "Confirm rules & add trades"}
        </button>
      </section>
    </div>
  );
}
