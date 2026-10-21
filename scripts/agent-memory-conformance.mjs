/* global process */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadConformanceFixture,
  runConformanceFixture,
} from "../dist/conformance/agent-memory-conformance.js";

const directory = mkdtempSync(join(tmpdir(), "agent-memory-conformance-"));
const database = join(directory, "agent-memory.sqlite");
const fixture = loadConformanceFixture(
  "test/fixtures/agent-memory-conformance.json",
);

try {
  const report = runConformanceFixture(fixture, database);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
