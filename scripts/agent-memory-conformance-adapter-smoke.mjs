/* global process */

import { resolve } from "node:path";

import { compareConformance } from "./agent-memory-conformance-compare.mjs";

const result = await compareConformance({
  externalCommand: process.execPath,
  externalArgs: [
    resolve("scripts/agent-memory-conformance-runner.mjs"),
    "--runtime",
    "typescript",
  ],
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
