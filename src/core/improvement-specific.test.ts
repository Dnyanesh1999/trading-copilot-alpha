import { expect, it } from "vitest";
import { improvementsFor } from "./improvement";
import { reviewSession } from "./review";
import { createRules } from "./fixtures";
import type { Position, Session } from "./types";
const at = (t: string) => `2026-11-02T${t}:00+05:30`;
function position(direction: "long" | "short" = "long"): Position {
  return {
    id: "INFY",
    instrument: "INFY",
    direction,
    firstEntryCovered: true,
    allEntriesCovered: true,
    executions: [
      {
        id: "e",
        side: "entry",
        timestamp: at("14:45"),
        price: 1500,
        quantity: 30,
      },
    ],
    stop: {
      id: "s",
      price: direction === "long" ? 1470 : 1530,
      recordedAt: at("14:30"),
    },
    target: {
      id: "t",
      price: direction === "long" ? 1530 : 1470,
      recordedAt: at("14:30"),
    },
  };
}
function review(p = position(), other: Position[] = []) {
  const session: Session = {
    id: "s",
    date: "2026-11-02",
    recordsComplete: true,
    positions: [...other, p],
  };
  return reviewSession(
    createRules(3, "14:30", {
      stopBeforeEntry: true,
      maxRisk: 600,
      minRewardRisk: 2,
    }),
    session,
  );
}
it.each(["long", "short"] as const)(
  "uses %s risk/ratio geometry",
  (direction) => {
    const plans = improvementsFor(review(position(direction)));
    expect(plans.find((p) => p.id === "planned-risk")?.steps[0]).toContain(
      "20 whole units",
    );
    const rr = plans.find((p) => p.id === "reward-risk")!;
    expect(rr.reason).toContain("₹30.00 reward for ₹30.00 risk = 1.0R");
    expect(rr.steps[0]).toContain(
      direction === "long" ? "₹1,560.00 or more" : "₹1,440.00 or less",
    );
    expect(rr.steps[0]).toContain(
      direction === "long" ? "₹1,485.00" : "₹1,515.00",
    );
  },
);
it.each(["long", "short"] as const)(
  "shows %s stop/entry gap and keeps late numbers reported",
  (direction) => {
    const p = position(direction);
    p.stop!.recordedAt = at("14:50");
    const plans = improvementsFor(review(p));
    expect(plans.find((p) => p.id === "stop-before-entry")?.reason).toContain(
      "14:50 IST, entry at 14:45 IST — 5 minutes after entry",
    );
    expect(plans.find((p) => p.kind === "reported")?.reason).toContain(
      "₹900.00 reported risk",
    );
    expect(plans.some((p) => p.id === "reward-risk")).toBe(false);
  },
);
it.each(["long", "short"] as const)(
  "names %s missing records instead of fabricating a plan",
  (direction) => {
    const p = position(direction);
    p.stop = null;
    const plans = improvementsFor(review(p));
    expect(plans.find((p) => p.kind === "evidence")?.reason).toContain("INFY");
    expect(plans.find((p) => p.kind === "evidence")?.reason).toContain("stop");
    expect(plans.some((p) => p.id === "planned-risk")).toBe(false);
  },
);
it.each(["long", "short"] as const)(
  "calculates %s daily ordinal, previous allowed trade and cutoff gap",
  (direction) => {
    const earlier = ["TCS", "HDFC", "SBIN"].map((name, i) => {
      const p = position();
      p.id = name;
      p.instrument = name;
      p.executions[0].id = name;
      p.executions[0].timestamp = at(["09:30", "10:30", "11:15"][i]);
      return p;
    });
    const plans = improvementsFor(review(position(direction), earlier));
    expect(plans.find((p) => p.id === "daily-limit")?.reason).toContain(
      "4th new trade on 2 Nov; your limit is 3. The 3rd recorded entry was SBIN at 11:15 IST",
    );
    expect(plans.find((p) => p.id === "entry-cutoff")?.reason).toContain(
      "15 minutes after your 14:30 cutoff",
    );
    expect(plans.length).toBeGreaterThan(3);
  },
);
it("keeps setup deviations grounded in the supplied signal", () => {
  const r = review();
  r.rules.setup = { kind: "breakout", label: "Resistance breakout" };
  r.session.positions[0].signal = {
    at: at("14:00"),
    close: 90,
    reference: 100,
    previousClose: null,
    previousReference: null,
    rangeEnd: null,
  };
  const plan = improvementsFor(reviewSession(r.rules, r.session)).find(
    (p) => p.id === "setup-entry",
  );
  expect(plan?.reason).toContain("90 ≤ 100");
  expect(plan?.steps[0]).toContain("Resistance breakout");
});

it("keeps a short setup unavailable rather than inventing long-only signal advice", () => {
  const r = review(position("short"));
  r.rules.setup = { kind: "breakout", label: "Resistance breakout" };
  const plans = improvementsFor(reviewSession(r.rules, r.session));
  expect(plans.some((p) => p.id === "setup-entry")).toBe(false);
  expect(plans.find((p) => p.kind === "evidence")?.reason).toContain(
    "long position",
  );
});
it("preserves every finding while generating action text", () => {
  const r = review();
  const before = structuredClone(r);
  improvementsFor(r);
  expect(r).toEqual(before);
});
it("keeps reported within-limit plans out of confirmed deviations", () => {
  const p = position();
  p.executions[0].quantity = 1;
  p.target!.price = 1560;
  p.stop!.recordedAt = at("14:50");
  const plans = improvementsFor(review(p));
  const reported = plans.find((p) => p.kind === "reported")!;
  expect(reported.findings.every((f) => !f.reportedComparison?.breached)).toBe(
    true,
  );
  expect(
    plans
      .filter((p) => p.kind === "deviation")
      .flatMap((p) => p.findings)
      .some((f) => f.ruleId === "planned-risk" || f.ruleId === "reward-risk"),
  ).toBe(false);
});
