import type {
  ConfirmedRules,
  Finding,
  FindingStatus,
  Position,
  Review,
  Session,
  PlanChecks,
} from "./types";

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
export function reviewSession(rules: ConfirmedRules, input: Session): Review {
  if (
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
      });
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
        const available = entry && stopTime && validPrice(position.stop?.price);
        const status = !available
          ? "insufficient_evidence"
          : stopTime.epoch < entry.epoch
            ? "followed"
            : "deviated";
        make(
          "stop-before-entry",
          status,
          available
            ? `Stop recorded ${stopTime.clock} · entry ${entry.clock} IST`
            : "Pre-entry stop: evidence missing",
          !available
            ? "A valid stop plan and its recording time, plus the first entry time, are needed."
            : status === "deviated"
              ? "The available stop plan was recorded at or after the first entry. It cannot establish an original pre-entry stop."
              : "The stop plan was recorded before the first entry. This does not prove a protective order was placed or honoured.",
          available
            ? `${stopTime.clock} IST ${status === "followed" ? "<" : "≥"} ${entry.clock} IST (comparison includes seconds)`
            : "Pre-entry stop recording cannot be verified",
          stopSources,
        );
      }
      const metrics = planMetrics(position);
      if (checks.maxRisk !== null) {
        const status =
          metrics.risk === null
            ? "insufficient_evidence"
            : metrics.risk <= checks.maxRisk
              ? "followed"
              : "deviated";
        make(
          "planned-risk",
          status,
          metrics.risk === null
            ? "Planned risk: evidence missing"
            : `${rupees(metrics.risk)} risk · maximum ${rupees(checks.maxRisk)}`,
          metrics.risk === null
            ? metrics.riskReason
            : "Initial filled quantity × distance from weighted entry to the pre-entry planned stop. This is a planned price risk, excluding fees, slippage and gaps.",
          metrics.risk === null
            ? "Original planned risk cannot be verified"
            : `${metrics.quantity} × ${rupees(metrics.stopDistance!)} = ${rupees(metrics.risk)}; maximum ${rupees(checks.maxRisk)}`,
          stopSources,
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
        make(
          "reward-risk",
          status,
          metrics.rewardRisk === null
            ? "Planned reward-to-risk: evidence missing"
            : `${metrics.rewardRisk.toFixed(2)}R · minimum ${checks.minRewardRisk}R`,
          metrics.rewardRisk === null
            ? metrics.rewardReason
            : "The original planned target distance divided by the original planned stop distance. It does not predict the realised result.",
          metrics.rewardRisk === null
            ? "Original planned reward-to-risk cannot be verified"
            : `${rupees(metrics.targetDistance!)} ÷ ${rupees(metrics.stopDistance!)} = ${metrics.rewardRisk.toFixed(2)}R; minimum ${checks.minRewardRisk}R`,
          [...stopSources, ...(position.target ? [position.target.id] : [])],
        );
      }
    }
  }
  return { rules: structuredClone(rules), session, findings };
}
export function positionStatus(
  review: Review,
  positionId: string,
): FindingStatus {
  const findings = review.findings.filter((f) => f.positionId === positionId);
  return findings.some((f) => f.status === "deviated")
    ? "deviated"
    : findings.some((f) => f.status === "insufficient_evidence")
      ? "insufficient_evidence"
      : "followed";
}
export function reviewSummary(review: Review) {
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
export function entryMetrics(position: Position) {
  const entries = position.executions.filter((e) => e.side === "entry");
  if (
    !position.allEntriesCovered ||
    !entryInfo(position) ||
    !entries.length ||
    entries.some((e) => !validPrice(e.price) || !validPrice(e.quantity))
  )
    return null;
  const quantity = entries.reduce((n, e) => n + e.quantity, 0);
  return {
    quantity,
    price: entries.reduce((n, e) => n + e.price * e.quantity, 0) / quantity,
  };
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
  result.stopDistance = stopDistance;
  result.risk = Math.round(filled.quantity * stopDistance * 100) / 100;
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
  result.targetDistance = targetDistance;
  result.rewardRisk = targetDistance / stopDistance;
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
