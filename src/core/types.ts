export type FindingStatus = "followed" | "deviated" | "insufficient_evidence";
export type RuleId =
  | "daily-limit"
  | "entry-cutoff"
  | "stop-before-entry"
  | "planned-risk"
  | "reward-risk";
export interface PlanChecks {
  stopBeforeEntry: boolean;
  maxRisk: number | null;
  minRewardRisk: number | null;
}
export interface PlanLevel {
  id: string;
  price: number;
  recordedAt: string | null;
}
export interface ConfirmedRules {
  checks?: PlanChecks;
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
  name?: string;
  direction?: "long" | "short";
  allEntriesCovered?: boolean;
  executionsComplete?: boolean;
  stop?: PlanLevel | null;
  target?: PlanLevel | null;
  id: string;
  instrument: string;
  firstEntryCovered: boolean;
  executions: Execution[];
}
export type ExampleMode = "full" | "daily-gap" | "plan-gap";
export interface Session {
  exampleMode?: ExampleMode;
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
export type Focus = "entry-check" | "daily-limit" | "risk-plan" | "later";
export interface SavedReview {
  selectedPositionId?: string;
  version: 1;
  savedAt: string;
  focus: Focus;
  review: Review;
}
