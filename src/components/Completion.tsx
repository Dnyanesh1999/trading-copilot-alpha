import { Bookmark } from "lucide-react";
import type { SavedReview } from "../core/types";
import { FOCUS_LABELS } from "../core/fixtures";
import { reviewSummary } from "../core/review";
import { Arrow } from "./Chrome";
export function Completion({
  saved,
  freshSave,
  onExplore,
  onBack,
}: {
  saved: SavedReview;
  freshSave: boolean;
  onExplore: () => void;
  onBack: () => void;
}) {
  const guidance = {
    "entry-check":
      "Before opening a position, pause to check the time and the positions already opened today.",
    "daily-limit":
      "Keep your daily allowance visible. Partial fills belong to the same position.",
    "risk-plan":
      "Before entry, record a stop and target. Check the planned price risk and reward-to-risk against your confirmed limits.",
    later:
      "You can come back to this review when you are ready to choose a focus.",
  };
  return (
    <main
      id="content"
      className={`completion ${freshSave ? "completion-fresh" : "completion-restored"} ${saved.focus === "later" ? "completion-deferred" : ""}`}
    >
      <div className="completion-check">
        {saved.focus === "later" ? (
          <Bookmark size={32} aria-hidden="true" />
        ) : (
          <svg
            className="save-check"
            viewBox="0 0 24 24"
            width="38"
            height="38"
            fill="none"
            aria-hidden="true"
          >
            <path d="m6 12 4 4 8-8" pathLength="1" />
          </svg>
        )}
      </div>
      <h1 tabIndex={-1}>
        {freshSave
          ? saved.focus === "later"
            ? "Your review is saved. Your focus can wait."
            : "One small step, saved for next time."
          : saved.focus === "later"
            ? "Your saved review."
            : "Your saved next step."}
      </h1>
      <p>Your review and rule snapshot are saved in this browser.</p>
      <section className="saved-focus">
        <span>
          {saved.focus === "later"
            ? "Your review, ready to revisit"
            : "Your next step"}
        </span>
        <h2>{FOCUS_LABELS[saved.focus]}</h2>
        <p>{guidance[saved.focus]}</p>
        <div className="saved-boundaries" aria-label="Saved rule snapshot">
          <span>{saved.review.rules.maxPositions} positions/day</span>
          <span>Before {saved.review.rules.cutoff} IST</span>
        </div>
      </section>
      <details className="saved-details">
        <summary>See my saved review</summary>
        <p>{reviewSummary(saved.review).title}</p>
        <p>
          {saved.review.rules.maxPositions} positions per day · before{" "}
          {saved.review.rules.cutoff} IST ·{" "}
          {saved.review.session.exampleMode === "plan-gap"
            ? "Missing risk plan"
            : saved.review.session.recordsComplete
              ? "Full execution record"
              : "Missing daily records"}
        </p>
        {saved.review.rules.checks && (
          <p>
            Stop recorded before entry · maximum planned risk ₹
            {saved.review.rules.checks.maxRisk} · minimum planned reward-to-risk{" "}
            {saved.review.rules.checks.minRewardRisk}R
          </p>
        )}
        <p>
          {saved.review.rules.comparison === "hypothetical"
            ? "Comparison against sample history."
            : "Original sample plan."}{" "}
          Saved{" "}
          {new Date(saved.savedAt).toLocaleString("en-GB", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST.
        </p>
      </details>
      <div className="center-actions">
        <button className="primary" onClick={onExplore}>
          Explore another review <Arrow />
        </button>
        <button className="back" onClick={onBack}>
          Back to this session
        </button>
      </div>
      <p className="page-footnote">
        Local to this browser. No account, upload or live trading.
      </p>
    </main>
  );
}
