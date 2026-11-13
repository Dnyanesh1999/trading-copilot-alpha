import { Check, X, Clock3, Minus } from "lucide-react";
import type { DisplayStatus } from "../core/action-rows";
const labels = {
  followed: "Followed",
  deviated: "Broke rule",
  "needs-review": "Needs review",
  insufficient_evidence: "Not enough data",
  not_checked: "Not checked",
};
export function StatusPill({ status }: { status: DisplayStatus }) {
  const Icon =
    status === "followed"
      ? Check
      : status === "deviated"
        ? X
        : status === "needs-review"
          ? Clock3
          : Minus;
  return (
    <span className={`finding-status ${status}`}>
      <Icon size={14} aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
