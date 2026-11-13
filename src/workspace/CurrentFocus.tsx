import type { ReviewEntry } from "./persistence";
import { focusRowFor } from "../core/action-rows";
import { CopyAction } from "./CopyAction";
export function CurrentFocus({ entry }: { entry: ReviewEntry }) {
  const row = focusRowFor(entry.review, entry.focus);
  const replay = !!entry.review.session.historicalReplay;
  const lines = [...new Set(row?.details.map((d) => d.before) ?? [])];
  if (!lines.length)
    lines.push(
      replay
        ? "In this replay, keep the simulated plan with the historical signal and entry."
        : row?.id === "maintain"
          ? "Keep recording the original plan before your next trade."
          : "Review your saved focus alongside its original trade records.",
    );
  return (
    <section className="panel current-focus">
      <h2>Your current focus</h2>
      <h3>{row?.title ?? entry.focus}</h3>
      <h4>{replay ? "In this replay" : "Before your next trade"}</h4>
      <div className="before-focus">
        <div>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <CopyAction
          text={lines.join("\n")}
          label={replay ? "Copy replay check" : undefined}
        />
      </div>
    </section>
  );
}
