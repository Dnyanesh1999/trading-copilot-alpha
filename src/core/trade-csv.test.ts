import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, parseTradeCsv, sessionToCsv } from "./trade-csv";
import type { Session } from "./types";

const required = "instrument,direction,quantity,entry_price,entry_at";
const minimal = "FICTIONAL-ALPHA,long,10,100,2026-10-16T09:15:00+05:30";
const csv = (row = minimal, header = required) => `${header}\n${row}\n`;

describe("browser-only app trade CSV", () => {
  it("imports a complete initial entry without inventing exit, plans, signal or daily coverage", () => {
    const { session, warnings } = parseTradeCsv(csv());
    expect(session.recordsComplete).toBe(false);
    expect(session.date).toBe("2026-10-16");
    expect(session.positions[0]).toMatchObject({
      direction: "long",
      firstEntryCovered: true,
      allEntriesCovered: true,
      executionsComplete: false,
      stop: null,
      target: null,
    });
    expect(session.positions[0].executions).toHaveLength(1);
    expect(session.positions[0]).not.toHaveProperty("signal");
    expect(warnings.join(" ")).toContain("not independently verified");
  });
  it("supports BOM, reordered columns, CRLF, quoted commas and escaped quotes", () => {
    const value =
      '\uFEFFentry_at,entry_price,quantity,direction,instrument\r\n2026-10-16T09:15:00Z,100,10,short,"FICTIONAL, ""Alpha"""\r\n';
    expect(parseTradeCsv(value).session.positions[0].instrument).toBe(
      'FICTIONAL, "Alpha"',
    );
  });
  it("roundtrips full fictional evidence and explicit-offset times", () => {
    const row = [
      "SAMPLE-ONLY",
      "short",
      "4",
      "150",
      "2026-10-16T09:30:00+05:30",
      "145",
      "2026-10-17T10:00:00+05:30",
      "155",
      "140",
      "2026-10-16T09:20:00+05:30",
      "2026-10-16T09:25:00+05:30",
      "149",
      "150",
      "151",
      "150",
      "2026-10-16T09:15:00+05:30",
      "fictional",
    ].join(",");
    const original = parseTradeCsv(csv(row, CSV_COLUMNS.join(","))).session;
    const output = sessionToCsv(original);
    const restored = parseTradeCsv(output).session;
    expect(restored.positions).toEqual(original.positions);
    expect(restored.recordsComplete).toBe(false);
    expect(output).toContain("2026-10-16T09:30:00+05:30");
  });
  it("preserves a provided stop with unknown recording time", () => {
    const { session } = parseTradeCsv(
      csv(`${minimal},95`, `${required},stop_price`),
    );
    expect(session.positions[0].stop).toMatchObject({
      price: 95,
      recordedAt: null,
    });
    expect(
      parseTradeCsv(sessionToCsv(session)).session.positions[0].stop
        ?.recordedAt,
    ).toBeNull();
  });
  it("retains fictional provenance through sample export/import and subsequent export", () => {
    const session = parseTradeCsv(csv()).session;
    const imported = parseTradeCsv(sessionToCsv(session, "fictional"));
    expect(imported.provenance).toBe("fictional");
    expect(imported.session).toHaveProperty("dataSource", "fictional");
    expect(imported.warnings.join(" ")).toContain("fictional practice data");
    expect(parseTradeCsv(sessionToCsv(imported.session)).provenance).toBe(
      "fictional",
    );
  });
  it("defaults missing or blank provenance to user-supplied without claiming actual data", () => {
    expect(parseTradeCsv(csv()).provenance).toBe("user-supplied");
    expect(
      parseTradeCsv(csv(`${minimal},`, `${required},data_source`)).provenance,
    ).toBe("user-supplied");
  });
  it("rejects invalid and mixed provenance rather than relabelling fictional rows", () => {
    expect(() =>
      parseTradeCsv(csv(`${minimal},actual`, `${required},data_source`)),
    ).toThrow("data_source must");
    const other = minimal.replace("ALPHA", "BETA");
    expect(() =>
      parseTradeCsv(
        `${required},data_source\n${minimal},fictional\n${other},user-supplied`,
      ),
    ).toThrow("mixed data_source");
    expect(() =>
      parseTradeCsv(`${required},data_source\n${minimal},fictional\n${other},`),
    ).toThrow("mixed data_source");
  });
  it("uses the entry's IST calendar date rather than its text prefix", () => {
    expect(
      parseTradeCsv(
        csv(
          minimal.replace("2026-10-16T09:15:00+05:30", "2026-10-15T23:00:00Z"),
        ),
      ).session.date,
    ).toBe("2026-10-16");
  });
  it.each(["=SUM(A1)", "+cmd", "-2", "@data"])(
    "rejects formula-like instrument %s",
    (instrument) => {
      expect(() =>
        parseTradeCsv(csv(minimal.replace("FICTIONAL-ALPHA", instrument))),
      ).toThrow("instrument");
    },
  );
  it.each([
    "2026-10-16T09:15:00",
    "2026-02-30T09:15:00+05:30",
    "2026-10-16T24:15:00Z",
    "yesterday",
    "2026-10-16",
  ])("rejects invalid/offset-free date %s", (at) => {
    expect(() =>
      parseTradeCsv(csv(minimal.replace("2026-10-16T09:15:00+05:30", at))),
    ).toThrow("entry_at");
  });
  it.each(["0", "-1", "NaN", "Infinity", "1e5", "₹100", "1,000"])(
    "rejects invalid numeric input %s",
    (value) => {
      expect(() =>
        parseTradeCsv(csv(minimal.replace(",100,", `,"${value}",`))),
      ).toThrow("entry_price");
    },
  );
  it("rejects unknown/private and duplicate headers", () => {
    expect(() =>
      parseTradeCsv(csv(`${minimal},123`, `${required},account_number`)),
    ).toThrow("unknown columns");
    expect(() =>
      parseTradeCsv(csv(`${minimal},100`, `${required},entry_price`)),
    ).toThrow("duplicate column");
    expect(() => parseTradeCsv("instrument,direction\nFICTIONAL,long")).toThrow(
      "requires",
    );
  });
  it("rejects malformed quotes, cell mismatch, and duplicate rows", () => {
    expect(() =>
      parseTradeCsv(csv('"unclosed,long,1,100,2026-10-16T09:15:00Z')),
    ).toThrow("unclosed");
    expect(() =>
      parseTradeCsv(csv('"closed"wrong,long,1,100,2026-10-16T09:15:00Z')),
    ).toThrow("closing quote");
    expect(() => parseTradeCsv(csv(`${minimal},extra`))).toThrow(
      "number of cells",
    );
    expect(() => parseTradeCsv(`${required}\n${minimal}\n${minimal}`)).toThrow(
      "CSV row 3: duplicate",
    );
  });
  it("requires paired exits strictly after entry and does not infer plan prices", () => {
    expect(() =>
      parseTradeCsv(csv(`${minimal},105`, `${required},exit_price`)),
    ).toThrow("supplied together");
    expect(() =>
      parseTradeCsv(
        csv(
          `${minimal},105,2026-10-16T09:15:00+05:30`,
          `${required},exit_price,exit_at`,
        ),
      ),
    ).toThrow("after entry");
    expect(() =>
      parseTradeCsv(
        csv(
          `${minimal},2026-10-16T09:00:00+05:30`,
          `${required},plan_recorded_at`,
        ),
      ),
    ).toThrow("needs a stop_price");
  });
  it("allows partial signal evidence, preserving other fields as null", () => {
    const { session } = parseTradeCsv(
      csv(`${minimal},101`, `${required},signal_close`),
    );
    expect(session.positions[0]).toHaveProperty("signal", {
      at: null,
      close: 101,
      reference: null,
      previousClose: null,
      previousReference: null,
      rangeEnd: null,
    });
  });
  it.each([
    ["signal_at", "2026-10-16T09:15:00"],
    ["range_end", "not-a-date"],
    ["signal_close", "NaN"],
    ["reference_level", "-1"],
    ["previous_close", "Infinity"],
    ["previous_reference", "0"],
  ])("rejects malformed optional signal field %s", (field, value) => {
    expect(() =>
      parseTradeCsv(csv(`${minimal},${value}`, `${required},${field}`)),
    ).toThrow(field);
  });
  it("enforces size and row limits, including empty input", () => {
    expect(() => parseTradeCsv("a".repeat(1024 * 1024 + 1))).toThrow("1 MB");
    expect(() =>
      parseTradeCsv(
        `${required}\n${Array.from({ length: 201 }, (_, i) => minimal.replace("ALPHA", `ALPHA${i}`)).join("\n")}`,
      ),
    ).toThrow("200");
    expect(() => parseTradeCsv(required)).toThrow("at least one");
  });
  it("does not silently flatten multiple fills or lose different plan timestamps on export", () => {
    const session: Session = parseTradeCsv(
      csv(
        `${minimal},95,110,2026-10-16T09:00:00Z`,
        `${required},stop_price,target_price,plan_recorded_at`,
      ),
    ).session;
    session.positions[0].executions.push({
      ...session.positions[0].executions[0],
      id: "extra",
    });
    expect(() => sessionToCsv(session)).toThrow("one complete initial entry");
    session.positions[0].executions.pop();
    session.positions[0].target!.recordedAt = "2026-10-16T09:01:00Z";
    expect(() => sessionToCsv(session)).toThrow("different stop/target");
  });
});
