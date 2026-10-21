import type {
  ConfirmedRules,
  Finding,
  FindingStatus,
  Position,
  Review,
  Session,
  PlanChecks,
} from "./types";
import { initialLevelErrors, stopDeclaration } from "./stop-record";

export const REVIEW_LOGIC_VERSION = 3;

export function validRules(maxPositions: number, cutoff: string): boolean {
  return (
    Number.isInteger(maxPositions) &&
    maxPositions >= 1 &&
    maxPositions <= 50 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)
  );
}
export function validChecks(checks?: PlanChecks): boolean {
  if (checks === undefined) return true;
  return (
    checks !== null &&
    typeof checks.stopBeforeEntry === "boolean" &&
    (checks.maxRisk === null ||
      (Number.isFinite(checks.maxRisk) && checks.maxRisk > 0)) &&
    (checks.minRewardRisk === null ||
      (Number.isFinite(checks.minRewardRisk) && checks.minRewardRisk > 0))
  );
}
export const RULE_LABELS = {
  "setup-entry": "Documented entry setup",
  "daily-limit": "Daily position limit",
  "entry-cutoff": "Entry cutoff",
  "stop-before-entry": "Stop recorded before entry",
  "planned-risk": "Planned risk per position",
  "reward-risk": "Planned reward-to-risk",
} as const;
export const rupees = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
// Only explicit-offset execution timestamps are accepted. A bare clock cannot establish an IST day.
export function timestampInfo(
  value: string | null,
): { epoch: number; day: string; seconds: number; clock: string } | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  )!;
  const [, ys, ms, ds, hs, mins, ss] = parts;
  const [y, m, d, h, min, s] = [ys, ms, ds, hs, mins, ss].map(Number);
  if (
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
    h > 23 ||
    min > 59 ||
    s > 59
  )
    return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  const ist = new Date(epoch + 330 * 60 * 1000).toISOString();
  const clock = ist.slice(11, 16);
  return {
    epoch,
    day: ist.slice(0, 10),
    clock,
    seconds:
      Number(ist.slice(11, 13)) * 3600 +
      Number(ist.slice(14, 16)) * 60 +
      Number(ist.slice(17, 19)) +
      new Date(epoch).getUTCMilliseconds() / 1000,
  };
}
export function entryInfo(position: Position) {
  const entries = position.executions.filter((e) => e.side === "entry");
  if (!position.firstEntryCovered || !entries.length) return null;
  const parsed = entries.map((e) => timestampInfo(e.timestamp));
  if (parsed.some((t) => !t)) return null;
  return parsed.filter((t) => t !== null).sort((a, b) => a.epoch - b.epoch)[0];
}
function groupPositions(positions: Position[]): Position[] {
  const grouped = new Map<string, Position>();
  for (const position of positions) {
    const prev = grouped.get(position.id);
    if (!prev) grouped.set(position.id, structuredClone(position));
    else {
      prev.firstEntryCovered =
        prev.firstEntryCovered && position.firstEntryCovered;
      const ids = new Set(prev.executions.map((e) => e.id));
      prev.executions.push(
        ...position.executions.filter((e) => !ids.has(e.id)),
      );
    }
  }
  return [...grouped.values()];
}
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
export function reviewSession(
  rules: ConfirmedRules,
  input: Session,
  source?: "sample" | "manual" | "csv",
): Review {
  if (
    (rules.setup !== undefined &&
      (!rules.setup ||
        !["breakout", "ma-reclaim", "opening-range"].includes(
          rules.setup.kind,
        ) ||
        typeof rules.setup.label !== "string" ||
        !rules.setup.label.trim())) ||
    (rules.enabledRules?.includes("setup-entry") && !rules.setup) ||
    (rules.enabledRules !== undefined &&
      (!Array.isArray(rules.enabledRules) ||
        !rules.enabledRules.length ||
        new Set(rules.enabledRules).size !== rules.enabledRules.length ||
        rules.enabledRules.some((id) => !Object.hasOwn(RULE_LABELS, id)) ||
        (rules.enabledRules.includes("stop-before-entry") &&
          !rules.checks?.stopBeforeEntry) ||
        (rules.enabledRules.includes("planned-risk") &&
          rules.checks?.maxRisk == null) ||
        (rules.enabledRules.includes("reward-risk") &&
          rules.checks?.minRewardRisk == null))) ||
    !validRules(rules.maxPositions, rules.cutoff) ||
    !validChecks(rules.checks) ||
    rules.timezone !== "Asia/Kolkata" ||
    !rules.confirmedAt ||
    !rules.id
  )
    throw new Error("Confirm valid rules before reviewing a session.");
  const session = {
    ...structuredClone(input),
    positions: groupPositions(input.positions),
  };
  const known = session.positions.map((position) => ({
    position,
    entry: entryInfo(position),
  }));
  const countCovered =
    session.recordsComplete && known.every((item) => item.entry !== null);
  const cutoffSeconds =
    Number(rules.cutoff.slice(0, 2)) * 3600 +
    Number(rules.cutoff.slice(3)) * 60;
  const findings: Finding[] = [];
  for (const { position, entry } of known) {
    const make = (
      ruleId: Finding["ruleId"],
      status: FindingStatus,
      label: string,
      explanation: string,
      calculation: string,
      sourceIds: string[],
      extra: Partial<
        Pick<Finding, "comparisonBasis" | "reportedComparison">
      > = {},
    ) =>
      findings.push({
        positionId: position.id,
        rulesId: rules.id,
        ruleId,
        status,
        label,
        explanation,
        calculation,
        sourceIds,
        ...extra,
      });
    if (rules.setup) {
      if (source === "manual") {
        make(
          "setup-entry",
          "not_checked",
          "Not checked (manual entry has no signal data)",
          "This manual form records trades and risk plans, but has no signal fields. The documented entry setup was not assessed.",
          "No signal comparison was run",
          [],
        );
      } else {
        const signal = position.signal;
        const signalTime = timestampInfo(signal?.at ?? null);
        const rangeEnd = timestampInfo(signal?.rangeEnd ?? null);
        const priced =
          signal &&
          validPrice(signal.close ?? undefined) &&
          validPrice(signal.reference ?? undefined);
        const prior =
          signal &&
          validPrice(signal.previousClose ?? undefined) &&
          validPrice(signal.previousReference ?? undefined);
        const rangeValid =
          rules.setup.kind !== "opening-range" ||
          (signalTime &&
            rangeEnd &&
            rangeEnd.day === signalTime.day &&
            entry &&
            entry.day === signalTime.day &&
            rangeEnd.seconds === 9 * 3600 + 30 * 60 &&
            signalTime.epoch >= rangeEnd.epoch);
        const available =
          position.direction === "long" &&
          entry &&
          signalTime &&
          signalTime.epoch < entry.epoch &&
          priced &&
          (rules.setup.kind !== "ma-reclaim" || prior) &&
          rangeValid;
        const matched =
          available &&
          signal!.close! > signal!.reference! &&
          (rules.setup.kind !== "ma-reclaim" ||
            signal!.previousClose! <= signal!.previousReference!);
        make(
          "setup-entry",
          !available
            ? "insufficient_evidence"
            : matched
              ? "followed"
              : "deviated",
          !available
            ? "Setup: evidence missing or timing unclear"
            : matched
              ? "Documented signal matches the setup"
              : "Documented signal did not match the setup",
          !available
            ? "A long position, valid documented signal before entry, and the setup's required reference values are needed. Opening-range examples require a same-day 09:30 IST range end. Late signals cannot establish the entry setup."
            : "Compared only with the supplied signal and reference values. Market prices and indicator calculations have not been independently verified.",
          !available
            ? "Entry setup cannot be verified from the supplied records"
            : `${signal!.close} ${signal!.close! > signal!.reference! ? ">" : "≤"} ${signal!.reference}` +
                (rules.setup.kind === "ma-reclaim"
                  ? `; prior close ${signal!.previousClose} ${signal!.previousClose! <= signal!.previousReference! ? "≤" : ">"} prior reference ${signal!.previousReference}`
                  : "") +
                (rules.setup.kind === "opening-range"
                  ? "; documented 09:15–09:30 IST range"
                  : "") +
                "; signal precedes entry",
          [
            ...(signal ? [`${position.id}-signal`] : []),
            ...position.executions
              .filter((e) => e.side === "entry")
              .map((e) => e.id),
          ],
        );
      }
    }
    const entries = position.executions.filter((e) => e.side === "entry");
    if (!countCovered || !entry) {
      make(
        "daily-limit",
        "insufficient_evidence",
        "Daily limit: not enough information",
        "The full daily entry record and first entry times are needed to establish position order. Missing records do not count as following your rule.",
        "Position order unavailable",
        entries.map((e) => e.id),
      );
    } else {
      const dayEntries = known.filter((k) => k.entry!.day === entry.day);
      const earlier = dayEntries.filter(
        (k) => k.entry!.epoch < entry.epoch,
      ).length;
      const tied = dayEntries.filter(
        (k) => k.entry!.epoch === entry.epoch,
      ).length;
      const sources = dayEntries.flatMap((k) =>
        k.position.executions
          .filter((e) => e.side === "entry")
          .map((e) => e.id),
      );
      if (earlier < rules.maxPositions && earlier + tied > rules.maxPositions) {
        make(
          "daily-limit",
          "insufficient_evidence",
          "Daily limit: entry order unclear",
          "Entries have the same timestamp at the daily-limit boundary. Their order cannot be established from these records.",
          `${tied} entries share one timestamp`,
          sources,
        );
      } else {
        const status = earlier >= rules.maxPositions ? "deviated" : "followed";
        const order = earlier + 1;
        make(
          "daily-limit",
          status,
          `${ordinal(order)} position · limit: ${rules.maxPositions}`,
          status === "deviated"
            ? "This new position was opened after the daily position allowance was used."
            : "This new position was within the daily position allowance.",
          `${order} new positions by this entry on ${entry.day} IST; allowed ${rules.maxPositions}. Partial fills count once.`,
          sources,
        );
      }
    }
    if (!entry)
      make(
        "entry-cutoff",
        "insufficient_evidence",
        "Entry time: not enough information",
        "A verified first entry timestamp with a timezone is needed. Later fills cannot establish a missing first entry.",
        "First entry time unavailable",
        entries.map((e) => e.id),
      );
    else {
      const status = entry.seconds < cutoffSeconds ? "followed" : "deviated";
      make(
        "entry-cutoff",
        status,
        `${entry.clock} IST · entry before: ${rules.cutoff} IST`,
        status === "deviated"
          ? "This position opened at or after your entry cutoff."
          : "This position opened before your entry cutoff.",
        `${entry.clock} IST ${status === "followed" ? "<" : "≥"} ${rules.cutoff} IST (comparison includes seconds)`,
        entries.map((e) => e.id),
      );
    }
    if (rules.checks) {
      const { checks } = rules;
      const stopTime = timestampInfo(position.stop?.recordedAt ?? null);
      const stopSources = [
        ...entries.map((e) => e.id),
        ...(position.stop ? [position.stop.id] : []),
      ];
      if (checks.stopBeforeEntry) {
        const invalidStop = initialPositionErrors(position).stop;
        const noStop = stopDeclaration(position) === "no-stop";
        const available =
          entry &&
          stopTime &&
          validPrice(position.stop?.price) &&
          validDirection(position.direction) &&
          !!priceMetrics(position) &&
          !invalidStop;
        const status = noStop
          ? "deviated"
          : !available
            ? "insufficient_evidence"
            : stopTime.epoch < entry.epoch
              ? "followed"
              : "deviated";
        make(
          "stop-before-entry",
          status,
          noStop
            ? "You reported entering without a stop plan"
            : invalidStop
              ? "Invalid initial stop"
              : available
                ? `Stop recorded ${stopTime.clock} · entry ${entry.clock} IST`
                : "Pre-entry stop: evidence missing",
          noStop
            ? "Your confirmed rule requires a stop before entry. You explicitly reported no stop; this is a rule break, not missing data."
            : invalidStop
              ? invalidStop
              : !available
                ? "A valid stop plan and its recording time, plus the first entry time, are needed."
                : status === "deviated"
                  ? "The available stop plan was recorded at or after the first entry. It cannot establish an original pre-entry stop."
                  : "The stop plan was recorded before the first entry. This does not prove a protective order was placed or honoured.",
          noStop
            ? "No stop plan declared"
            : available
              ? `${stopTime.clock} IST ${status === "followed" ? "<" : "≥"} ${entry.clock} IST (comparison includes seconds)`
              : "Pre-entry stop recording cannot be verified",
          stopSources,
          {
            comparisonBasis: noStop
              ? "user-declared"
              : invalidStop
                ? "invalid-record"
                : available
                  ? status === "followed"
                    ? "pre-entry"
                    : "late-plan"
                  : "timing-unknown",
          },
        );
      }
      const metrics = planMetrics(position);
      const reported = reportedPlanMetrics(position);
      if (checks.maxRisk !== null) {
        const status =
          metrics.risk === null
            ? "insufficient_evidence"
            : metrics.risk <= checks.maxRisk
              ? "followed"
              : "deviated";
        const comparison =
          reported.risk === null
            ? undefined
            : {
                value: reported.risk,
                limit: checks.maxRisk,
                unit: "INR" as const,
                breached: reported.risk > checks.maxRisk,
              };
        make(
          "planned-risk",
          status,
          metrics.risk === null
            ? reported.risk === null
              ? "Planned risk: not enough data"
              : `${rupees(reported.risk)} reported risk · maximum ${rupees(checks.maxRisk)}${comparison?.breached ? ` · ${(reported.risk / checks.maxRisk).toFixed(2).replace(/0$/, "")}× limit` : ""}`
            : `${rupees(metrics.risk)} risk · maximum ${rupees(checks.maxRisk)}`,
          metrics.risk === null
            ? reported.risk === null
              ? metrics.riskReason
              : `${reported.basisText} ${reported.quantity} units × ${rupees(reported.stopDistance!)} = ${rupees(reported.risk)}. This does not verify the original pre-entry risk.`
            : "Initial filled quantity × distance from weighted entry to the pre-entry planned stop. This is a planned price risk, excluding fees, slippage and gaps.",
          metrics.risk === null
            ? reported.risk === null
              ? "Original planned risk cannot be verified"
              : `${reported.quantity} × ${rupees(reported.stopDistance!)} = ${rupees(reported.risk)}; maximum ${rupees(checks.maxRisk)}`
            : `${metrics.quantity} × ${rupees(metrics.stopDistance!)} = ${rupees(metrics.risk)}; maximum ${rupees(checks.maxRisk)}`,
          stopSources,
          {
            comparisonBasis:
              metrics.risk !== null ? "pre-entry" : reported.basis,
            reportedComparison: comparison,
          },
        );
      }
      if (checks.minRewardRisk !== null) {
        const status =
          metrics.rewardRisk === null
            ? "insufficient_evidence"
            : metrics.rewardRisk + 1e-10 * Math.max(1, checks.minRewardRisk) >=
                checks.minRewardRisk
              ? "followed"
              : "deviated";
        const comparison =
          reported.rewardRisk === null
            ? undefined
            : {
                value: reported.rewardRisk,
                limit: checks.minRewardRisk,
                unit: "R" as const,
                breached:
                  reported.rewardRisk +
                    1e-10 * Math.max(1, checks.minRewardRisk) <
                  checks.minRewardRisk,
              };
        make(
          "reward-risk",
          status,
          metrics.rewardRisk === null
            ? reported.rewardRisk === null
              ? "Planned reward-to-risk: not enough data"
              : `${reported.rewardRisk.toFixed(2)}R reported · minimum ${checks.minRewardRisk}R`
            : `${metrics.rewardRisk.toFixed(2)}R · minimum ${checks.minRewardRisk}R`,
          metrics.rewardRisk === null
            ? reported.rewardRisk === null
              ? metrics.rewardReason
              : `${reported.rewardBasisText} Reported reward-to-risk is ${reported.rewardRisk.toFixed(2)}R. This does not verify the original pre-entry reward-to-risk.`
            : "The original planned target distance divided by the original planned stop distance. It does not predict the realised result.",
          metrics.rewardRisk === null
            ? reported.rewardRisk === null
              ? "Original planned reward-to-risk cannot be verified"
              : `${rupees(reported.targetDistance!)} ÷ ${rupees(reported.stopDistance!)} = ${reported.rewardRisk.toFixed(2)}R; minimum ${checks.minRewardRisk}R`
            : `${rupees(metrics.targetDistance!)} ÷ ${rupees(metrics.stopDistance!)} = ${metrics.rewardRisk.toFixed(2)}R; minimum ${checks.minRewardRisk}R`,
          [...stopSources, ...(position.target ? [position.target.id] : [])],
          {
            comparisonBasis:
              metrics.rewardRisk !== null ? "pre-entry" : reported.rewardBasis,
            reportedComparison: comparison,
          },
        );
      }
    }
  }
  return {
    rules: structuredClone(rules),
    session,
    findings: rules.enabledRules
      ? findings.filter(
          (finding) =>
            rules.enabledRules!.includes(finding.ruleId) ||
            (finding.ruleId === "setup-entry" && !!rules.setup),
        )
      : findings,
  };
}
export function positionStatus(
  review: Review,
  positionId: string,
): FindingStatus {
  const findings = review.findings.filter(
    (f) => f.positionId === positionId && f.status !== "not_checked",
  );
  if (!findings.length) return "insufficient_evidence";
  return findings.some((f) => f.status === "deviated")
    ? "deviated"
    : findings.some((f) => f.status === "insufficient_evidence")
      ? "insufficient_evidence"
      : "followed";
}
function legacySummary(review: Review) {
  const deviations = review.findings.filter((f) => f.status === "deviated");
  const unknown = review.findings.filter(
    (f) => f.status === "insufficient_evidence",
  );
  const count = deviations.filter((f) => f.ruleId === "daily-limit").length;
  const time = deviations.filter((f) => f.ruleId === "entry-cutoff").length;
  const positions = new Set(deviations.map((f) => f.positionId));
  const followed = review.session.positions.filter(
    (p) => positionStatus(review, p.id) === "followed",
  ).length;
  if (review.rules.checks)
    return {
      title: positions.size
        ? `${positions.size === 1 ? "One position" : `${positions.size} positions`} to revisit.`
        : unknown.length
          ? "Some checks need more information."
          : "Every checked rule was followed.",
      description: `${deviations.length} confirmed ${deviations.length === 1 ? "deviation" : "deviations"} · ${unknown.length} ${unknown.length === 1 ? "check needs" : "checks need"} more evidence. Select a position to connect its outcome with its plan.`,
    };
  if (unknown.length)
    return {
      title: time
        ? "A late entry. Some checks need more information."
        : deviations.length
          ? "A limit crossed. Some checks need more information."
          : "Some checks need more information.",
      description: `${deviations.length} confirmed rule ${deviations.length === 1 ? "deviation" : "deviations"}; ${unknown.length} ${unknown.length === 1 ? "check is" : "checks are"} unresolved. Missing evidence is never treated as following a rule.`,
    };
  if (
    count === 1 &&
    time === 1 &&
    positions.size === 1 &&
    review.session.positions.length === 4 &&
    followed === 3
  )
    return {
      title: "One extra entry. Two rules to revisit.",
      description:
        "Your first three positions followed your entry rules. The fourth crossed both limits.",
    };
  if (!deviations.length)
    return {
      title: "These entries stayed within your two rules.",
      description: `All ${review.session.positions.length} sample positions followed the daily limit and entry cutoff. This does not establish adherence to other strategy rules.`,
    };
  return {
    title: `${deviations.length} rule ${deviations.length === 1 ? "deviation" : "deviations"} to explore.`,
    description: `${positions.size} ${positions.size === 1 ? "position crossed" : "positions crossed"} a confirmed limit. Open a position to see the evidence.`,
  };
}

const validDirection = (direction: unknown) =>
  direction === "long" || direction === "short";
const validPrice = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
export function initialPositionErrors(position: Position) {
  const filled = priceMetrics(position);
  return filled && validDirection(position.direction)
    ? initialLevelErrors(
        position.direction!,
        filled.price,
        position.stop?.price,
        position.target?.price,
      )
    : {};
}
export function stopRecordNeedsCorrection(position: Position) {
  return (
    stopDeclaration(position) !== "had-stop" ||
    !position.stop ||
    !timestampInfo(position.stop.recordedAt) ||
    !!initialPositionErrors(position).stop
  );
}
export function needsReview(finding: Finding) {
  return (
    finding.status === "insufficient_evidence" &&
    finding.reportedComparison?.breached === true
  );
}
export function reviewCounts(review: Review) {
  const brokenRules = review.findings.filter(
    (f) => f.status === "deviated",
  ).length;
  const reportedWarnings = review.findings.filter(needsReview).length;
  const notEnoughData = review.findings.filter(
    (f) => f.status === "insufficient_evidence" && !needsReview(f),
  ).length;
  const attention = new Set(
    review.findings
      .filter((f) => f.status !== "followed" && f.status !== "not_checked")
      .map((f) => f.positionId),
  );
  const noStop = review.session.positions.filter(
    (p) => stopDeclaration(p) === "no-stop",
  ).length;
  const unresolvedStopRecords = review.session.positions.filter(
    (p) => stopDeclaration(p) !== "no-stop" && !p.stop,
  ).length;
  return {
    trades: review.session.positions.length,
    tradesNeedingAttention: attention.size,
    brokenRules,
    reportedWarnings,
    notEnoughData,
    noStop,
    unresolvedStopRecords,
    noStopRecord: noStop + unresolvedStopRecords,
  };
}
export function reviewSummary(review: Review) {
  const legacy = legacySummary(review);
  const counts = reviewCounts(review);
  const title = review.rules.checks
    ? counts.tradesNeedingAttention
      ? `${counts.tradesNeedingAttention} of ${counts.trades} ${counts.trades === 1 ? "trade needs" : "trades need"} attention.`
      : counts.trades === 1
        ? "This trade followed the checked rules."
        : `All ${counts.trades} trades followed the checked rules.`
    : legacy.title;
  return {
    ...legacy,
    title,
    counts,
    description: review.rules.checks
      ? `${counts.brokenRules} ${counts.brokenRules === 1 ? "broken rule" : "broken rules"} · ${counts.reportedWarnings} ${counts.reportedWarnings === 1 ? "reported-plan warning" : "reported-plan warnings"} · ${counts.notEnoughData} ${counts.notEnoughData === 1 ? "check" : "checks"} with not enough data.`
      : legacy.description,
  };
}
/** Report available price arithmetic separately from verified pre-entry metrics. */
export function reportedPlanMetrics(position: Position) {
  const filled = priceMetrics(position);
  const entry = entryInfo(position);
  const stopAt = timestampInfo(position.stop?.recordedAt ?? null);
  const targetAt = timestampInfo(position.target?.recordedAt ?? null);
  const basis =
    entry && stopAt
      ? stopAt.epoch < entry.epoch
        ? "pre-entry"
        : "late-plan"
      : "timing-unknown";
  const rewardBasis =
    basis === "late-plan" ||
    (entry && targetAt && targetAt.epoch >= entry.epoch)
      ? "late-plan"
      : basis === "pre-entry" && targetAt
        ? "pre-entry"
        : "timing-unknown";
  const basisText =
    basis === "late-plan"
      ? "Based on a plan added at or after entry; original entry-time plan is unverified."
      : basis === "timing-unknown"
        ? "Plan recording time is unknown; original entry-time plan is unverified."
        : "Based on the supplied pre-entry plan.";
  const rewardBasisText =
    rewardBasis === "late-plan"
      ? "Based on a plan added at or after entry; original entry-time plan is unverified."
      : rewardBasis === "timing-unknown"
        ? "Plan recording time is unknown; original entry-time plan is unverified."
        : "Based on the supplied pre-entry plan.";
  const result = {
    quantity: filled?.quantity ?? null,
    stopDistance: null as number | null,
    targetDistance: null as number | null,
    risk: null as number | null,
    rewardRisk: null as number | null,
    basis,
    rewardBasis,
    basisText,
    rewardBasisText,
  } as {
    quantity: number | null;
    stopDistance: number | null;
    targetDistance: number | null;
    risk: number | null;
    rewardRisk: number | null;
    basis: NonNullable<Finding["comparisonBasis"]>;
    rewardBasis: NonNullable<Finding["comparisonBasis"]>;
    basisText: string;
    rewardBasisText: string;
  };
  if (
    !filled ||
    !validDirection(position.direction) ||
    !position.stop ||
    stopDeclaration(position) !== "had-stop" ||
    initialPositionErrors(position).stop
  )
    return result;
  const sign = position.direction === "long" ? 1 : -1;
  const distance = sign * (filled.price - position.stop.price);
  const risk = Math.round(filled.quantity * distance * 100) / 100;
  if (!Number.isFinite(risk) || distance <= 0) return result;
  result.stopDistance = distance;
  result.risk = risk;
  if (!position.target || initialPositionErrors(position).target) return result;
  const targetDistance = sign * (position.target.price - filled.price);
  const ratio = targetDistance / distance;
  if (Number.isFinite(ratio)) {
    result.targetDistance = targetDistance;
    result.rewardRisk = ratio;
  }
  return result;
}
/** Price arithmetic does not require a recorded entry clock. */
export function priceMetrics(position: Position) {
  const entries = position.executions.filter((e) => e.side === "entry");
  if (
    !position.allEntriesCovered ||
    !entries.length ||
    entries.some((e) => !validPrice(e.price) || !validPrice(e.quantity))
  )
    return null;
  const quantity = entries.reduce((n, e) => n + e.quantity, 0);
  const price =
    entries.reduce((n, e) => n + e.price * e.quantity, 0) / quantity;
  if (!Number.isFinite(quantity) || !Number.isFinite(price)) return null;
  return { quantity, price };
}
export function entryMetrics(position: Position) {
  return entryInfo(position) ? priceMetrics(position) : null;
}
export function planMetrics(position: Position) {
  const filled = entryMetrics(position);
  const entry = entryInfo(position);
  const stopTime = timestampInfo(position.stop?.recordedAt ?? null);
  const targetTime = timestampInfo(position.target?.recordedAt ?? null);
  const result = {
    quantity: filled?.quantity ?? null,
    entryPrice: filled?.price ?? null,
    stopDistance: null as number | null,
    targetDistance: null as number | null,
    risk: null as number | null,
    rewardRisk: null as number | null,
    riskReason:
      "Complete initial fills, direction and a valid stop recorded before entry are required.",
    rewardReason:
      "Both a valid pre-entry stop and target, plus complete initial fills and direction, are required.",
  };
  if (
    !filled ||
    stopDeclaration(position) !== "had-stop" ||
    !entry ||
    !validDirection(position.direction) ||
    !stopTime ||
    stopTime.epoch >= entry.epoch ||
    !validPrice(position.stop?.price)
  )
    return result;
  const sign = position.direction === "long" ? 1 : -1;
  const stopDistance = sign * (filled.price - position.stop.price);
  if (stopDistance <= 0) {
    result.riskReason =
      "The recorded stop is not on the loss side of the weighted entry for this direction.";
    return result;
  }
  const risk = Math.round(filled.quantity * stopDistance * 100) / 100;
  if (!Number.isFinite(stopDistance) || !Number.isFinite(risk)) {
    result.riskReason =
      "The supplied values exceed the supported calculation range.";
    result.rewardReason = result.riskReason;
    return result;
  }
  result.stopDistance = stopDistance;
  result.risk = risk;
  if (
    !targetTime ||
    targetTime.epoch >= entry.epoch ||
    !validPrice(position.target?.price)
  )
    return result;
  const targetDistance = sign * (position.target.price - filled.price);
  if (targetDistance <= 0) {
    result.rewardReason =
      "The recorded target is not on the reward side of the weighted entry for this direction.";
    return result;
  }
  const ratio = targetDistance / stopDistance;
  if (!Number.isFinite(targetDistance) || !Number.isFinite(ratio)) {
    result.rewardReason =
      "The supplied values exceed the supported calculation range.";
    return result;
  }
  result.targetDistance = targetDistance;
  result.rewardRisk = ratio;
  return result;
}
export function grossResult(position: Position): number | null {
  const entry = entryMetrics(position);
  const exits = position.executions.filter((e) => e.side === "exit");
  const lastEntry = Math.max(
    ...position.executions
      .filter((e) => e.side === "entry")
      .map((e) => timestampInfo(e.timestamp)?.epoch ?? Infinity),
  );
  if (
    !entry ||
    !position.executionsComplete ||
    !validDirection(position.direction) ||
    !exits.length ||
    exits.some(
      (e) =>
        !validPrice(e.price) ||
        !validPrice(e.quantity) ||
        !timestampInfo(e.timestamp) ||
        timestampInfo(e.timestamp)!.epoch < lastEntry,
    )
  )
    return null;
  if (exits.reduce((n, e) => n + e.quantity, 0) !== entry.quantity) return null;
  const sign = position.direction === "long" ? 1 : -1;
  return (
    Math.round(
      sign *
        exits.reduce((n, e) => n + (e.price - entry.price) * e.quantity, 0) *
        100,
    ) / 100
  );
}
