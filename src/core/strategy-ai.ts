import { study } from "../study/client";
import type { RuleId } from "./types";

export interface StrategyRuleProposal {
  ruleId: RuleId;
  value: number | string | boolean | null;
}
export interface StrategyAnalysis {
  rules: StrategyRuleProposal[];
  questions: string[];
  unsupported: string[];
  model: string;
}

const ids: RuleId[] = [
  "daily-limit",
  "entry-cutoff",
  "stop-before-entry",
  "planned-risk",
  "reward-risk",
];
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 10 &&
  value.every((v) => typeof v === "string" && v.length > 0 && v.length <= 600);

/** Treat model output as untrusted. Null is unresolved, never an inferred default. */
export function validateStrategyAnalysis(value: unknown): StrategyAnalysis {
  if (
    !record(value) ||
    !Array.isArray(value.rules) ||
    value.rules.length > 5 ||
    !strings(value.questions) ||
    !strings(value.unsupported) ||
    typeof value.model !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(value.model)
  ) {
    throw new Error(
      "AI returned an invalid strategy. Your draft is safe; use manual rules or retry.",
    );
  }
  const seen = new Set<string>();
  const rules: StrategyRuleProposal[] = value.rules.map((proposal) => {
    if (
      !record(proposal) ||
      !ids.includes(proposal.ruleId as RuleId) ||
      seen.has(String(proposal.ruleId))
    ) {
      throw new Error(
        "AI returned unsupported or duplicate rules. Please retry or use manual rules.",
      );
    }
    const id = proposal.ruleId as RuleId;
    const v = proposal.value;
    const valid =
      v === null ||
      (id === "entry-cutoff" &&
        typeof v === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ||
      (id === "stop-before-entry" && typeof v === "boolean") ||
      (id === "daily-limit" &&
        typeof v === "number" &&
        Number.isSafeInteger(v) &&
        v >= 1 &&
        v <= 50) ||
      ((id === "planned-risk" || id === "reward-risk") &&
        typeof v === "number" &&
        Number.isFinite(v) &&
        v > 0 &&
        v <= 100000000);
    if (!valid)
      throw new Error(
        "AI returned an invalid rule value. Please clarify it or use manual rules.",
      );
    seen.add(id);
    return { ruleId: id, value: v as StrategyRuleProposal["value"] };
  });
  return {
    rules,
    questions: value.questions,
    unsupported: value.unsupported,
    model: value.model,
  };
}

export async function analyzeStrategy(
  description: string,
  answers = "",
): Promise<StrategyAnalysis> {
  if (
    !description.trim() ||
    description.length > 6000 ||
    answers.length > 3000
  ) {
    throw new Error(
      "Describe your strategy in 1–6,000 characters; keep clarifications under 3,000 characters.",
    );
  }
  let response: Response;
  try {
    response = await fetch("/strategy-api/strategy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(study.session()
          ? { Authorization: `Bearer ${study.session()!.sessionToken}` }
          : {}),
      },
      body: JSON.stringify({ description, answers }),
      signal: AbortSignal.timeout(35000),
    });
  } catch {
    throw new Error(
      "AI is unavailable. Your draft is safe; retry or continue with manual rules.",
    );
  }
  if (!response.ok) {
    if (response.status === 503)
      throw new Error(
        "AI is temporarily unavailable. Your draft is safe; retry or use manual rules.",
      );
    if (response.status === 429)
      throw new Error(
        "AI is unavailable for this request. Continue with manual rules or try again later.",
      );
    throw new Error(
      "AI could not clarify this strategy. Your draft is safe; retry or use manual rules.",
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "AI returned an unreadable response. Please retry or use manual rules.",
    );
  }
  return validateStrategyAnalysis(result);
}
