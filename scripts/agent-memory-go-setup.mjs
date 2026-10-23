/* global process */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const moduleDirectory = join(root, "native", "ytk-memory");
const temporary = mkdtempSync(join(tmpdir(), "ytk-memory-go-setup-"));
const executable = join(
  temporary,
  process.platform === "win32" ? "ytk-memory.exe" : "ytk-memory",
);
const project = join(temporary, "consumer");
const codexHome = join(temporary, "codex-home");

try {
  mkdirSync(project, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(
    join(codexHome, "config.toml"),
    'model = "gpt-6"\n\n[mcp_servers.other]\nurl = "https://example.org/mcp"\n',
  );
  writeFileSync(
    join(project, "AGENTS.md"),
    "# Team guidance\n\nKeep existing rules.\n",
  );
  run(
    goCommand(),
    ["build", "-o", executable, "./cmd/ytk-memory"],
    moduleDirectory,
    { ...process.env, GOCACHE: join(tmpdir(), "ytk-memory-go-build-cache") },
  );

  const setupEnvironment = { ...process.env, CODEX_HOME: codexHome };
  const args = ["setup", "codex", "--project", "consumer", "--area", "backend"];
  const preview = cli(args.concat("--dry-run"), setupEnvironment);
  assert.equal(preview.dryRun, true);
  assert.equal(existsSync(join(project, ".ytk-memory.json")), false);
  const installed = cli(args, setupEnvironment);
  assert.equal(installed.changes.length, 5);
  const config = readFileSync(join(codexHome, "config.toml"), "utf8");
  assert.match(config, /\[mcp_servers\.other\]/);
  assert.match(config, /\[mcp_servers\.ytk_memory\]/);
  assert.match(config, /"mcp"/);
  assert.match(
    readFileSync(join(project, "AGENTS.md"), "utf8"),
    /Keep existing rules/,
  );
  assert.match(
    readFileSync(
      join(project, ".agents", "skills", "ytk-memory", "SKILL.md"),
      "utf8",
    ),
    /memory_session_finish/,
  );
  const doctor = cli(["doctor", "--project", "consumer"], setupEnvironment);
  assert.equal(
    doctor.checks.find((check) => check.name === "codex_mcp")?.status,
    "ok",
  );
  assert.equal(cli(args, setupEnvironment).changes.length, 0);
  assert.equal(
    cli(["setup", "codex", "--uninstall"], setupEnvironment).uninstall,
    true,
  );
  assert.match(
    readFileSync(join(codexHome, "config.toml"), "utf8"),
    /\[mcp_servers\.ytk_memory\]/,
  );
  assert.equal(
    readFileSync(join(project, "AGENTS.md"), "utf8"),
    "# Team guidance\n\nKeep existing rules.\n",
  );

  const restored = cli(args, setupEnvironment);
  assert.equal(restored.changes.length, 2);
  assert.equal(
    cli(["uninstall", "codex", "--remove-global-mcp"], setupEnvironment)
      .uninstall,
    true,
  );
  const cleanedGlobalConfig = readFileSync(
    join(codexHome, "config.toml"),
    "utf8",
  );
  assert.doesNotMatch(cleanedGlobalConfig, /\[mcp_servers\.ytk_memory\]/);
  assert.match(cleanedGlobalConfig, /\[mcp_servers\.other\]/);
  process.stdout.write(
    `${JSON.stringify({ setup: true, dryRun: true, repeatable: true, uninstall: true, globalMcp: true, status: "passed" }, null, 2)}\n`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function cli(args, env = process.env) {
  const result = spawnSync(executable, [...args, "--json"], {
    cwd: project,
    env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return JSON.parse(result.stdout);
}
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function goCommand() {
  if (process.env.GO) return process.env.GO;
  const windowsGo = "C:\\Program Files\\Go\\bin\\go.exe";
  return process.platform === "win32" && existsSync(windowsGo)
    ? windowsGo
    : "go";
}
