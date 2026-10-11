import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
const file = new URL("../worker/.dev.vars", import.meta.url);
if (existsSync(file))
  console.log("Local token file already exists; left unchanged.");
else {
  writeFileSync(
    file,
    `INGEST_TOKEN=${randomBytes(32).toString("hex")}\nEXPORT_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Generated local-only tokens in ignored worker/.dev.vars. No cloud account used.",
  );
}
