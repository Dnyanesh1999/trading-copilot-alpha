import type { Position, Session } from "./types";
import {
  initialLevelErrors,
  stopDeclaration,
  stopDeclarations,
} from "./stop-record";

/** App template: one complete initial entry and optional full exit per row, not a broker export. */
export const CSV_COLUMNS = [
  "instrument",
  "direction",
  "quantity",
  "entry_price",
  "entry_at",
  "exit_price",
  "exit_at",
  "stop_price",
  "target_price",
  "plan_recorded_at",
  "signal_at",
  "signal_close",
  "reference_level",
  "previous_close",
  "previous_reference",
  "range_end",
  "data_source",
  "stop_declaration",
] as const;
export type CsvProvenance = "fictional" | "user-supplied";
type Column = (typeof CSV_COLUMNS)[number];
interface CsvSignal {
  at: string | null;
  close: number | null;
  reference: number | null;
  previousClose: number | null;
  previousReference: number | null;
  rangeEnd: string | null;
}
type CsvPosition = Position & { signal?: CsvSignal };
const REQUIRED: Column[] = [
  "instrument",
  "direction",
  "quantity",
  "entry_price",
  "entry_at",
];
const MAX_BYTES = 1024 * 1024;
const error = (row: number, message: string): never => {
  throw new Error(`CSV row ${row}: ${message}`);
};

export function readRows(text: string, maxDataRows = 200, rowKind = "trade"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const finishField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (field || closed)
        error(rows.length + 1, "a quote must start a field.");
      quoted = true;
    } else if (c === ",") finishField();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else {
      if (closed)
        error(rows.length + 1, "unexpected text after a closing quote.");
      field += c;
    }
    if (rows.length > maxDataRows + 1)
      error(rows.length, `maximum ${maxDataRows} ${rowKind} rows supported.`);
  }
  if (quoted) error(rows.length + 1, "unclosed quoted field.");
  if (field || row.length || closed) finishRow();
  return rows;
}

function timestamp(raw: string, row: number, column: Column): string | null {
  if (!raw) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      raw,
    );
  if (!match || !Number.isFinite(Date.parse(raw)))
    error(
      row,
      `${column} needs an ISO timestamp with seconds and an explicit offset (for example 2026-10-16T09:15:00+05:30).`,
    );
  const [, y, month, day, hour, minute, second] = match!;
  const monthNumber = Number(month),
    dayNumber = Number(day);
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > new Date(Date.UTC(Number(y), monthNumber, 0)).getUTCDate() ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    error(row, `${column} has an invalid calendar date or time.`);
  }
  return raw;
}

function positive(raw: string, row: number, column: Column): number | null {
  if (!raw) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))
    error(
      row,
      `${column} must be a positive decimal number without currency symbols or separators.`,
    );
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER)
    error(row, `${column} must be a finite positive number.`);
  return value;
}

function instrumentValue(raw: string, row: number): string {
  if (
    !raw ||
    raw.length > 80 ||
    /^[=+\-@]/.test(raw) ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    error(
      row,
      "instrument must be 1–80 characters, without control characters or a leading =, +, - or @.",
    );
  }
  return raw;
}

function istDate(at: string): string {
  return new Date(Date.parse(at) + 330 * 60000).toISOString().slice(0, 10);
}

export function parseTradeCsv(text: string): {
  session: Session;
  warnings: string[];
  provenance: CsvProvenance;
} {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error("CSV file exceeds the 1 MB limit.");
  const rows = readRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2)
    throw new Error("CSV needs a header and at least one trade row.");
  if (rows.length > 201)
    throw new Error("CSV supports at most 200 trade rows.");
  const headers = rows[0].map((value) => value.trim());
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV contains duplicate column headers.");
  if (
    headers.some(
      (header) => !(CSV_COLUMNS as readonly string[]).includes(header),
    )
  ) {
    throw new Error(
      "CSV has unknown columns. Use only the app template; remove account numbers and personal identifiers.",
    );
  }
  if (REQUIRED.some((column) => !headers.includes(column)))
    throw new Error(`CSV requires these columns: ${REQUIRED.join(", ")}.`);
  const seen = new Set<string>();
  let provenance: CsvProvenance | undefined;
  const positions: CsvPosition[] = rows.slice(1).map((cells, index) => {
    const row = index + 2;
    if (cells.length !== headers.length)
      error(row, "the number of cells does not match the header.");
    const values = Object.fromEntries(
      headers.map((header, cell) => [header, cells[cell].trim()]),
    ) as Partial<Record<Column, string>>;
    const read = (column: Column) => values[column] ?? "";
    const declaredSource = read("data_source") || "user-supplied";
    if (declaredSource !== "fictional" && declaredSource !== "user-supplied") {
      error(
        row,
        "data_source must be fictional or user-supplied (blank defaults to user-supplied).",
      );
    }
    if (provenance && declaredSource !== provenance) {
      error(
        row,
        "mixed data_source labels are not supported; import fictional and user-supplied records separately.",
      );
    }
    provenance = declaredSource as CsvProvenance;
    const fingerprint = JSON.stringify(CSV_COLUMNS.map(read));
    if (seen.has(fingerprint))
      error(row, "duplicate trade row. Remove it before importing.");
    seen.add(fingerprint);
    for (const required of REQUIRED)
      if (!read(required)) error(row, `${required} is required.`);
    const instrument = instrumentValue(read("instrument"), row);
    const direction = read("direction");
    if (direction !== "long" && direction !== "short")
      error(row, "direction must be long or short.");
    const quantity = positive(read("quantity"), row, "quantity")!;
    const entry = positive(read("entry_price"), row, "entry_price")!;
    const at = timestamp(read("entry_at"), row, "entry_at")!;
    const exit = positive(read("exit_price"), row, "exit_price");
    const exitAt = timestamp(read("exit_at"), row, "exit_at");
    if ((exit === null) !== (exitAt === null))
      error(row, "exit_price and exit_at must be supplied together.");
    if (exitAt && Date.parse(exitAt) <= Date.parse(at))
      error(row, "exit_at must be after entry_at.");
    const stop = positive(read("stop_price"), row, "stop_price");
    const target = positive(read("target_price"), row, "target_price");
    const declaration =
      read("stop_declaration") || (stop === null ? "not-recorded" : "had-stop");
    if (
      !stopDeclarations.includes(
        declaration as NonNullable<Position["stopDeclaration"]>,
      )
    )
      error(row, "stop_declaration must be had-stop, no-stop or not-recorded.");
    if (declaration !== "had-stop" && stop !== null)
      error(
        row,
        "stop_price conflicts with stop_declaration; a price requires had-stop.",
      );
    if (declaration === "had-stop" && stop === null)
      error(row, "stop_price is required when stop_declaration is had-stop.");
    const levelErrors = initialLevelErrors(
      direction as "long" | "short",
      entry,
      stop,
      target,
    );
    if (levelErrors.stop) error(row, `stop_price: ${levelErrors.stop}`);
    if (levelErrors.target) error(row, `target_price: ${levelErrors.target}`);
    const planAt = timestamp(read("plan_recorded_at"), row, "plan_recorded_at");
    if (planAt && stop === null && target === null)
      error(row, "plan_recorded_at needs a stop_price or target_price.");
    const signal: CsvSignal = {
      at: timestamp(read("signal_at"), row, "signal_at"),
      close: positive(read("signal_close"), row, "signal_close"),
      reference: positive(read("reference_level"), row, "reference_level"),
      previousClose: positive(read("previous_close"), row, "previous_close"),
      previousReference: positive(
        read("previous_reference"),
        row,
        "previous_reference",
      ),
      rangeEnd: timestamp(read("range_end"), row, "range_end"),
    };
    const id = `csv-position-${index + 1}`;
    return {
      id,
      instrument,
      direction: direction as "long" | "short",
      stopDeclaration: declaration as NonNullable<Position["stopDeclaration"]>,
      firstEntryCovered: true,
      allEntriesCovered: true,
      executionsComplete: exit !== null,
      executions: [
        {
          id: `${id}-entry`,
          side: "entry",
          timestamp: at,
          quantity,
          price: entry,
        },
        ...(exit !== null && exitAt
          ? [
              {
                id: `${id}-exit`,
                side: "exit" as const,
                timestamp: exitAt,
                quantity,
                price: exit,
              },
            ]
          : []),
      ],
      stop:
        stop === null
          ? null
          : { id: `${id}-stop`, price: stop, recordedAt: planAt },
      target:
        target === null
          ? null
          : { id: `${id}-target`, price: target, recordedAt: planAt },
      ...(Object.values(signal).some((value) => value !== null)
        ? { signal }
        : {}),
    };
  });
  return {
    session: {
      id: crypto.randomUUID(),
      date: istDate(positions[0].executions[0].timestamp!),
      recordsComplete: false,
      ...{ dataSource: provenance ?? "user-supplied" },
      positions,
    },
    provenance: provenance ?? "user-supplied",
    warnings: [
      ...(provenance === "fictional"
        ? [
            "This file is labelled fictional practice data; its trades and prices must not be reported as actual trader records.",
          ]
        : []),
      "Daily entry completeness is unknown. Importing a file does not establish that every position for each day is present.",
      "Signal prices and reference levels are supplied by the file and are not independently verified market data.",
      "This app template represents one complete initial entry and optional full exit per row. It does not import raw broker order books or partial fills.",
    ],
  };
}

/** Refuse shapes this one-row template cannot preserve, rather than silently flatten evidence. */
export function sessionToCsv(
  session: Session,
  provenance: CsvProvenance = (
    session as Session & { dataSource?: CsvProvenance }
  ).dataSource ?? "user-supplied",
): string {
  if (!session.positions.length || session.positions.length > 200)
    throw new Error("Export needs 1–200 positions.");
  const quote = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = session.positions.map((position, index) => {
    const p = position as CsvPosition;
    const entries = p.executions.filter((fill) => fill.side === "entry");
    const exits = p.executions.filter((fill) => fill.side === "exit");
    if (
      entries.length !== 1 ||
      exits.length > 1 ||
      !p.firstEntryCovered ||
      !p.allEntriesCovered ||
      (exits[0] && exits[0].quantity !== entries[0].quantity)
    ) {
      throw new Error(
        `Position ${index + 1} cannot fit this CSV template: one complete initial entry and optional full exit required.`,
      );
    }
    if (p.stop && p.target && p.stop.recordedAt !== p.target.recordedAt) {
      throw new Error(
        `Position ${index + 1} has different stop/target recording times; this template cannot preserve both.`,
      );
    }
    const entry = entries[0],
      exit = exits[0];
    const values = [
      p.instrument,
      p.direction,
      entry.quantity,
      entry.price,
      entry.timestamp,
      exit?.price,
      exit?.timestamp,
      p.stop?.price,
      p.target?.price,
      p.stop?.recordedAt ?? p.target?.recordedAt,
      p.signal?.at,
      p.signal?.close,
      p.signal?.reference,
      p.signal?.previousClose,
      p.signal?.previousReference,
      p.signal?.rangeEnd,
      provenance,
      stopDeclaration(p),
    ];
    return values.map(quote).join(",");
  });
  const csv = [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
  // Validate both export syntax and data, including spreadsheet formula injection.
  parseTradeCsv(csv);
  return csv;
}
