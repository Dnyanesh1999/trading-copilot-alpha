import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import cases from "./__fixtures__/held-out-cases.json";
import {
  createRules,
  DEFAULT_CHECKS,
  realisticSession,
  sampleSession,
} from "./fixtures";
import { createPresetSession, strategyPresets } from "./strategy-library";
import { reviewSession } from "./review";
import type { Session } from "./types";

// Frozen before UI edits. No provider calls; the submitted fictional inputs are copied verbatim.
const verdicts = (review: ReturnType<typeof reviewSession>) =>
  review.findings.map(
    ({ positionId, ruleId, status, comparisonBasis, reportedComparison }) => ({
      positionId,
      ruleId,
      status,
      comparisonBasis,
      reportedComparison,
    }),
  );
describe("UI-only engine regression", () => {
  it("keeps all bundled fixture verdicts identical", () => {
    const sessions = [
      sampleSession(),
      sampleSession(false),
      ...(["full", "daily-gap", "plan-gap"] as const).map(realisticSession),
    ];
    expect(
      sessions.map((s) =>
        verdicts(reviewSession(createRules(3, "11:00", DEFAULT_CHECKS), s)),
      ),
    ).toMatchSnapshot();
    expect(
      strategyPresets.map((p) =>
        verdicts(
          reviewSession(
            {
              ...createRules(p.defaultMaxPositions, p.defaultCutoff, {
                stopBeforeEntry: true,
                maxRisk: p.defaultMaxRisk,
                minRewardRisk: p.defaultMinRewardRisk,
              }),
              enabledRules: p.defaultEnabledRules,
              setup: { kind: p.kind, label: p.title },
            },
            createPresetSession(p.kind),
          ),
        ),
      ),
    ).toMatchSnapshot();
  });
  it.each(cases)("preserves submitted $case_id verdicts", (c) => {
    const t = c.trade_evidence;
    const group = Math.floor((Number(c.case_id.slice(1)) - 1) / 4);
    const rules = {
      ...createRules(3, "16:00", {
        stopBeforeEntry: false,
        maxRisk: [108, 126, 180][group],
        minRewardRisk: [2, 2.5, 3][group],
      }),
      enabledRules: ["planned-risk", "reward-risk"] as const,
    };
    const session: Session = {
      id: c.case_id,
      date: t.date,
      recordsComplete: t.records_complete,
      dataSource: "fictional",
      positions: [
        {
          id: t.position_id,
          instrument: c.case_id,
          direction: "long",
          firstEntryCovered: true,
          allEntriesCovered: true,
          executionsComplete: false,
          executions: t.entries.map((e) => ({
            id: e.id,
            side: "entry",
            timestamp: e.time,
            quantity: e.quantity,
            price: e.price,
          })),
          stop: t.stop
            ? {
                id: t.stop.id,
                price: t.stop.price,
                recordedAt: t.stop.recorded_at,
              }
            : null,
          target: t.target
            ? {
                id: t.target.id,
                price: t.target.price,
                recordedAt: t.target.recorded_at,
              }
            : null,
        },
      ],
    };
    const actual = reviewSession(
      { ...rules, enabledRules: [...rules.enabledRules] },
      session,
    );
    const scenario = (Number(c.case_id.slice(1)) - 1) % 4;
    expect(
      actual.findings
        .filter(
          (f) => f.ruleId === "planned-risk" || f.ruleId === "reward-risk",
        )
        .map((f) => f.status),
    ).toEqual(
      [
        ["followed", "followed"],
        ["deviated", "followed"],
        ["followed", "deviated"],
        ["insufficient_evidence", "insufficient_evidence"],
      ][scenario],
    );
    expect(verdicts(actual)).toMatchSnapshot();
  });
  it("locks the unchanged engine and extraction policy source", () => {
    const hashes = ["src/core/review.ts", "server/strategy-policy.mjs"].map(
      (path) => createHash("sha256").update(readFileSync(path)).digest("hex"),
    );
    expect(hashes).toMatchSnapshot();
  });
});
