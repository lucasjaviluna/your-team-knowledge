/* global process */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const moduleDirectory = join(root, "native", "ytk-memory");
const outputDirectory = mkdtempSync(join(tmpdir(), "ytk-memory-go-"));
const executable = join(
  outputDirectory,
  process.platform === "win32" ? "ytk-memory.exe" : "ytk-memory",
);

try {
  run(
    goCommand(),
    ["build", "-o", executable, "./cmd/ytk-memory"],
    moduleDirectory,
    { ...process.env, GOCACHE: join(tmpdir(), "ytk-memory-go-build-cache") },
  );
  run(
    process.execPath,
    [
      "scripts/agent-memory-conformance-compare.mjs",
      "--command",
      executable,
      "--arg",
      "conformance",
    ],
    root,
  );
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}

function goCommand() {
  if (process.env.GO) return process.env.GO;
  const windowsGo = "C:\\Program Files\\Go\\bin\\go.exe";
  return process.platform === "win32" && existsSync(windowsGo)
    ? windowsGo
    : "go";
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    ...(env ? { env } : {}),
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
