/* global process */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  loadConformanceFixture,
  runConformanceFixture,
} from "../dist/conformance/agent-memory-conformance.js";

export async function compareConformance({
  externalCommand,
  externalArgs = [],
  fixtureFile = "test/fixtures/agent-memory-conformance.json",
}) {
  const fixturePath = resolve(fixtureFile);
  const fixture = loadConformanceFixture(fixturePath);
  const root = mkdtempSync(join(tmpdir(), "agent-memory-conformance-compare-"));
  const typescriptDatabase = join(root, "typescript.sqlite");
  const externalDatabase = join(root, "external.sqlite");

  try {
    const typescript = runConformanceFixture(fixture, typescriptDatabase);
    const external = await runExternal({
      command: externalCommand,
      args: [
        ...externalArgs,
        "--conformance-fixture",
        fixturePath,
        "--database",
        externalDatabase,
      ],
    });
    assert.deepEqual(stripRuntime(external), stripRuntime(typescript));
    return {
      fixture: fixturePath,
      version: fixture.version,
      operations: fixture.operations.length,
      runtimes: [typescript.runtime, external.runtime],
      status: "passed",
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function runExternal({ command, args }) {
  if (!command) throw new Error("An external conformance command is required.");
  const { stdout, stderr, code } = await new Promise(
    (resolvePromise, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolvePromise({ stdout, stderr, code }));
    },
  );
  if (code !== 0)
    throw new Error(
      `External conformance runner exited with ${code}: ${stderr.trim()}`,
    );
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `External conformance runner did not emit JSON on stdout: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function stripRuntime(report) {
  const withoutRuntime = { ...report };
  delete withoutRuntime.runtime;
  return withoutRuntime;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  const args = parseArgs(process.argv.slice(2));
  const result = await compareConformance({
    externalCommand: args.command,
    externalArgs: args["arg"]
      ? Array.isArray(args["arg"])
        ? args["arg"]
        : [args["arg"]]
      : [],
    ...(args.fixture ? { fixtureFile: args.fixture } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    if (key === "arg") {
      parsed.arg = parsed.arg ? [...parsed.arg, next] : [next];
    } else parsed[key] = next;
    index += 1;
  }
  return parsed;
}
