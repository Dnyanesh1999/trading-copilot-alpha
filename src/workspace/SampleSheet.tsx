import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { presetDraft } from "./PresetPicker";
import { strategyPresets } from "../core/strategy-library";
import type { StrategyDraft } from "../core/workspace";
import { TermChip } from "./TermChip";
import { rupees } from "../core/review";
export function SampleSheet({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (draft: StrategyDraft) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const draft = presetDraft(strategyPresets[0]);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sample-sheet panel"
      aria-labelledby="sample-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="section-title">
        <h2 id="sample-title">Try a fictional review</h2>
        <button
          autoFocus
          className="icon-button"
          aria-label="Close sample rules"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <p>{draft.name} · long equity practice</p>
      <ul>
        <li>Enter after a recorded signal close above resistance.</li>
        <li>
          <TermChip term="stop-before-entry" />
        </li>
        <li>
          <TermChip term="planned-risk" />: at most {rupees(draft.maxRisk)} per
          position.
        </li>
        <li>
          <TermChip term="reward-risk" />: at least {draft.minRewardRisk}R.
        </li>
      </ul>
      <p className="field-note">
        These practice rules replace your current checklist after you confirm.
        Existing saved reviews keep their own rules. All sample trades are
        fictional.
      </p>
      <button className="primary" onClick={() => onUse(draft)}>
        Use these rules
      </button>
    </dialog>
  );
}
