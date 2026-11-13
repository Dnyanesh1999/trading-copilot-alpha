// Original fictional prices only. No market/provider input. Stable seed + UTC dates.
import { mkdirSync, writeFileSync } from "node:fs";
export function demoCsv(outcome) {
  let seed = 20261113;
  const next = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const tick = (value) => Number((Math.round(value * 20) / 20).toFixed(2));
  const dates = [];
  for (let day = 3; dates.length < 22; day++) {
    const d = new Date(Date.UTC(2025, 1, day));
    if (![0, 6].includes(d.getUTCDay()))
      dates.push(d.toISOString().slice(0, 10));
  }
  const rows = [];
  let previous = 100;
  for (let i = 0; i < 20; i++) {
    const open = tick(previous + (next() - 0.5) * 1.2);
    const close = tick(open + (next() - 0.45) * 2.4);
    const high = tick(Math.max(open, close) + 0.3 + next() * 1.5);
    const low = tick(Math.min(open, close) - 0.3 - next() * 1.5);
    rows.push([
      dates[i],
      open,
      high,
      low,
      close,
      Math.round(1500 + next() * 5000),
    ]);
    previous = close;
  }
  const resistance = Math.max(...rows.map((row) => row[2]));
  const signalOpen = tick(previous + 0.5);
  const signalClose = tick(resistance + (outcome === "followed" ? 5 : -5));
  rows.push([
    dates[20],
    signalOpen,
    tick(Math.max(signalOpen, signalClose) + 1.25),
    tick(Math.min(signalOpen, signalClose) - 0.8),
    signalClose,
    Math.round(6500 + next() * 2500),
  ]);
  const entryOpen = tick(signalClose + 0.75);
  const entryClose = tick(entryOpen + (next() - 0.4) * 2);
  rows.push([
    dates[21],
    entryOpen,
    tick(Math.max(entryOpen, entryClose) + 1.1),
    tick(Math.min(entryOpen, entryClose) - 0.9),
    entryClose,
    Math.round(2500 + next() * 4500),
  ]);
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
