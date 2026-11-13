// Original fictional prices only. No market/provider input. Stable seed + UTC dates.
import { mkdirSync, writeFileSync } from "node:fs";
export function demoCsv(outcome) {
  let seed = 20261113;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % 5;
  const dates = [];
  for (let day = 3; dates.length < 22; day++) {
    const d = new Date(Date.UTC(2025, 1, day));
    if (![0, 6].includes(d.getUTCDay()))
      dates.push(d.toISOString().slice(0, 10));
  }
  const rows = dates.map((date, i) => {
    if (i === 20)
      return [date, 115, 130, 110, outcome === "followed" ? 125 : 115, 2000];
    if (i === 21) return [date, 130, 140, 125, 135, 2500];
    const open = 100 + next() * 5;
    return [date, open, 120, 95, open, 1000 + next() * 100];
  });
  return (
    "date,open,high,low,close,volume\n" +
    rows.map((r) => r.join(",")).join("\n") +
    "\n"
  );
}
if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const dir = new URL("../public/demo/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const outcome of ["followed", "deviated"])
    writeFileSync(
      new URL(`DEMO-fictional-${outcome}.csv`, dir),
      demoCsv(outcome),
    );
}
