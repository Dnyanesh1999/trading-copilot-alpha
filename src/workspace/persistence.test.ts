import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkspace, writeWorkspace, type Workspace } from "./persistence";
import {
  confirmStrategy,
  defaultStrategy,
  defaultTrade,
  tradesToSession,
} from "../core/workspace";
import { reviewSession } from "../core/review";
import { saveReview, STORAGE_KEY } from "../core/storage";
const KEY = "trading-copilot.workspace.v2";
let store: Map<string, string>;
function fixture(): Workspace {
  const rules = confirmStrategy(defaultStrategy);
  const review = reviewSession(
    rules,
    tradesToSession(
      [
        {
          ...defaultTrade,
          instrument: "TEST",
          quantity: "1",
          entryPrice: "100",
          enteredAt: "2026-10-16T10:00",
        },
      ],
      false,
    ),
  );
  return {
    strategy: structuredClone(defaultStrategy),
    confirmed: rules,
    history: [
      {
        id: "review",
        name: "Review",
        source: "manual",
        strategyName: "Strategy",
        savedAt: new Date().toISOString(),
        focus: "Next step",
        review,
      },
    ],
  };
}
beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("workspace persistence", () => {
  it("restores confirmed rules and recomputes findings", () => {
    const data = fixture();
    data.history[0].review.findings = [];
    writeWorkspace(data);
    const restored = readWorkspace();
    expect(restored?.confirmed?.id).toBe(data.confirmed?.id);
    expect(restored?.history[0].review.findings).toHaveLength(3);
  });
  it("keeps an incomplete draft but revokes mismatched confirmation", () => {
    const data = fixture();
    data.strategy.name = "";
    data.strategy.maxPositions = 0;
    writeWorkspace(data);
    expect(readWorkspace()?.strategy.name).toBe("");
    expect(readWorkspace()?.confirmed).toBeNull();
    data.strategy = { ...defaultStrategy, maxRisk: 700 };
    writeWorkspace(data);
    expect(readWorkspace()?.confirmed).toBeNull();
  });
  it("rejects corrupt draft scalar fields and rule identifiers", () => {
    for (const patch of [
      { name: {} },
      { style: "other" },
      { cutoff: "hello" },
      { maxRisk: "500" },
      { enabledRules: ["unknown"] },
    ]) {
      store.set(
        KEY,
        JSON.stringify({
          ...fixture(),
          strategy: { ...defaultStrategy, ...patch },
        }),
      );
      expect(readWorkspace()).toBeNull();
    }
  });
  it("drops malformed history independently of valid records", () => {
    const data = fixture();
    store.set(
      KEY,
      JSON.stringify({
        ...data,
        history: [
          { ...data.history[0], source: "other" },
          data.history[0],
          { ...data.history[0], focus: {} },
        ],
      }),
    );
    expect(readWorkspace()?.history).toHaveLength(1);
  });
  it("migrates legacy once without deleting the original", () => {
    const data = fixture();
    saveReview(localStorage, data.history[0].review, "risk-plan");
    const migrated = readWorkspace();
    expect(migrated?.history[0].name).toBe("Legacy saved review");
    expect(migrated?.history[0].focus).toBe("Review my risk plan");
    expect(store.has(STORAGE_KEY)).toBe(true);
    expect(store.has(KEY)).toBe(true);
    expect(readWorkspace()?.history).toHaveLength(1);
  });
  it("handles inaccessible storage and malformed JSON safely", () => {
    store.set(KEY, "{");
    expect(readWorkspace()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(readWorkspace()).toBeNull();
  });
});

describe("preset and CSV history snapshots", () => {
  it("restores the setup and invalidates confirmation if the draft setup changes", () => {
    const data = fixture();
    data.strategy.setup = { kind: "breakout", label: "Resistance breakout" };
    data.confirmed = confirmStrategy(data.strategy);
    writeWorkspace(data);
    expect(readWorkspace()?.confirmed?.setup?.kind).toBe("breakout");
    data.strategy.setup = { kind: "ma-reclaim", label: "20-period MA reclaim" };
    writeWorkspace(data);
    expect(readWorkspace()?.confirmed).toBeNull();
  });
  it("preserves CSV source and rejects malformed signal values in saved history", () => {
    const data = fixture();
    data.history[0].source = "csv";
    writeWorkspace(data);
    expect(readWorkspace()?.history[0].source).toBe("csv");
    const bad = JSON.parse(JSON.stringify(data));
    bad.history[0].review.session.positions[0].signal = {
      at: null,
      close: "invented",
      reference: null,
      previousClose: null,
      previousReference: null,
      rangeEnd: null,
    };
    store.set(KEY, JSON.stringify(bad));
    expect(readWorkspace()?.history).toHaveLength(0);
  });
});

it("restores the full CSV capacity and fictional provenance", () => {
  const workspace = fixture();
  const session = workspace.history[0].review.session;
  const original = session.positions[0];
  session.dataSource = "fictional";
  session.positions = Array.from({ length: 200 }, (_, i) => ({
    ...structuredClone(original),
    id: `csv-${i}`,
  }));
  workspace.history[0].source = "csv";
  writeWorkspace(workspace);
  const restored = readWorkspace();
  expect(restored?.history[0].review.session.positions).toHaveLength(200);
  expect(restored?.history[0].review.session.dataSource).toBe("fictional");
});
