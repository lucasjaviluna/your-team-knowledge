/* global process */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  loadConformanceFixture,
  runConformanceFixture,
} from "../dist/conformance/agent-memory-conformance.js";

const args = parseArgs(process.argv.slice(2));
if (args.runtime !== "typescript") {
  throw new Error(
    `Unsupported runtime '${args.runtime ?? ""}'. The TypeScript runner is the reference adapter.`,
  );
}

const fixtureFile = resolve(
  args.fixture ??
    args["conformance-fixture"] ??
    "test/fixtures/agent-memory-conformance.json",
);
const fixture = loadConformanceFixture(fixtureFile);
const temporary = args.database
  ? undefined
  : mkdtempSync(join(tmpdir(), "agent-memory-conformance-"));
const database = resolve(
  args.database ?? join(temporary, "agent-memory.sqlite"),
);

try {
  process.stdout.write(
    `${JSON.stringify(runConformanceFixture(fixture, database), null, 2)}\n`,
  );
} finally {
  if (temporary && existsSync(temporary))
    rmSync(temporary, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--"))
      throw new Error(`Unexpected argument '${value ?? ""}'.`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`Argument '${value}' requires a value.`);
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
