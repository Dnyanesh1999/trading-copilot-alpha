export type FindingStatus = "followed" | "deviated" | "insufficient_evidence";
export type RuleId = "daily-limit" | "entry-cutoff";
export interface ConfirmedRules {
  id: string;
  maxPositions: number;
  cutoff: string;
  timezone: "Asia/Kolkata";
  confirmedAt: string;
  comparison: "sample-plan" | "hypothetical";
}
export interface Execution {
  id: string;
  side: "entry" | "exit";
  timestamp: string | null;
  quantity: number;
  price: number;
}
export interface Position {
  id: string;
  instrument: string;
  firstEntryCovered: boolean;
  executions: Execution[];
}
export interface Session {
  id: string;
  date: string;
  recordsComplete: boolean;
  positions: Position[];
}
export interface Finding {
  positionId: string;
  ruleId: RuleId;
  rulesId: string;
  status: FindingStatus;
  label: string;
  explanation: string;
  calculation: string;
  sourceIds: string[];
}
export interface Review {
  rules: ConfirmedRules;
  session: Session;
  findings: Finding[];
}
export type Focus = "entry-check" | "daily-limit" | "later";
export interface SavedReview {
  version: 1;
  savedAt: string;
  focus: Focus;
  review: Review;
}
