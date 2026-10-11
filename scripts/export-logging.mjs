import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
const { EXPORT_TOKEN } = parseEnv(
  readFileSync(new URL("../worker/.dev.vars", import.meta.url), "utf8"),
);
if (!EXPORT_TOKEN || EXPORT_TOKEN.length < 32)
  throw new Error("Run logging:setup first");
let after = 0,
  until,
  nextCursor;
const records = [];
do {
  const url = new URL("http://127.0.0.1:8787/export");
  url.searchParams.set("after", String(after));
  if (until !== undefined) url.searchParams.set("until", String(until));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${EXPORT_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
  const page = await response.json();
  until = page.until;
  nextCursor = page.nextCursor;
  records.push(...page.records);
  if (
    nextCursor !== null &&
    (!Number.isSafeInteger(nextCursor) || nextCursor <= after)
  )
    throw new Error("Invalid export cursor");
  after = nextCursor;
} while (nextCursor !== null);
const directory = new URL("../private/logging/", import.meta.url);
mkdirSync(directory, { recursive: true });
const filename = `internal-export-${new Date().toISOString().replaceAll(":", "-")}.json`;
writeFileSync(
  new URL(filename, directory),
  JSON.stringify(
    {
      schemaVersion: 1,
      mode: "internal",
      exportedAt: new Date().toISOString(),
      until,
      records,
    },
    null,
    2,
  ),
  { mode: 0o600, flag: "wx" },
);
console.log(
  `Exported ${records.length} internal records to private/logging/${filename}`,
);
