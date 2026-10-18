import { Check, ArrowUpRight } from "lucide-react";
import { strategyPresets, type StrategyPreset } from "../core/strategy-library";
import type { StrategyDraft } from "../core/workspace";
export function presetDraft(preset: StrategyPreset): StrategyDraft {
  return {
    name: preset.title,
    description: preset.description,
    style: preset.style,
    maxPositions: preset.defaultMaxPositions,
    cutoff: preset.defaultCutoff,
    stopBeforeEntry: true,
    maxRisk: preset.defaultMaxRisk,
    minRewardRisk: preset.defaultMinRewardRisk,
    enabledRules: [...preset.defaultEnabledRules],
    setup: { kind: preset.kind, label: preset.title },
  };
}
export function PresetPicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected?: string;
  onSelect: (preset: StrategyPreset) => void;
  disabled?: boolean;
}) {
  return (
    <div className="preset-grid">
      {strategyPresets.map((preset, i) => (
        <button
          key={preset.id}
          disabled={disabled}
          className={`preset-card ${selected === preset.kind ? "is-selected" : ""}`}
          aria-pressed={selected === preset.kind}
          onClick={() => onSelect(preset)}
        >
          <div className="preset-topline">
            <span>
              {preset.style === "swing" ? "Swing · long" : "Intraday · long"}
            </span>
            {i === 0 && <span className="recommend-pill">Start here</span>}
            {selected === preset.kind && <Check size={15} />}
          </div>
          <svg viewBox="0 0 220 60" className="setup-sketch" aria-hidden="true">
            <path
              className="reference-line"
              d={i === 1 ? "M0 43 Q65 25 120 30 T220 18" : "M0 34 H220"}
            />
            <path
              d={
                i === 0
                  ? "M0 49 L30 36 L55 47 L80 38 L110 43 L137 25 L160 28 L190 10 L220 16"
                  : i === 1
                    ? "M0 15 L25 23 L50 38 L80 47 L105 40 L135 26 L165 20 L190 10 L220 14"
                    : "M0 49 L20 25 L45 44 L70 28 L95 40 L122 23 L146 28 L170 11 L195 17 L220 8"
              }
            />
          </svg>
          <h3>{preset.title}</h3>
          <p>
            {i === 0
              ? "Wait for a closed signal above your resistance level."
              : i === 1
                ? "Review a close back above the 20-period SMA."
                : "Review a breakout after the 09:15–09:30 IST range."}
          </p>
          <span className="preset-link">
            {selected === preset.kind ? "Selected setup" : "Explore setup"}
            <ArrowUpRight size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}
