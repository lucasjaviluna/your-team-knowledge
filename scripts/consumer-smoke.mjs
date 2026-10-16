/* global console, process */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const workspace = await mkdtemp(
  join(tmpdir(), "your-team-knowledge-consumer-"),
);
const packageDir = join(workspace, "package");
const consumerDir = join(workspace, "consumer");

function run(command, args, cwd, shell = false) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    shell,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

try {
  await mkdir(packageDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  const packed = JSON.parse(
    run(
      npmCommand,
      ["pack", "--json", "--pack-destination", packageDir],
      root,
      true,
    ),
  );
  const tarball = resolve(packageDir, packed[0].filename);

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify(
      { name: "agent-memory-consumer-smoke", private: true },
      null,
      2,
    ),
  );
  run(
    npmCommand,
    [
      "install",
      "--no-save",
      "--package-lock=false",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    consumerDir,
    true,
  );

  await writeFile(
    join(consumerDir, "consumer-smoke.mjs"),
    `import { join } from "node:path";
import { AgentMemoryProtocol, MemoryService, SqliteAgentMemoryProvider, SqliteAgentMemoryRepository } from "@corporate-knowledge/platform/memory";
import { createAgentMemoryMcpServer } from "@corporate-knowledge/platform/mcp";

const database = join(process.cwd(), "agent-memory.sqlite");
const repository = new SqliteAgentMemoryRepository(database);
const memory = new MemoryService(repository);
const provider = new SqliteAgentMemoryProvider(memory);
const protocol = new AgentMemoryProtocol(provider);
const context = { projectId: "consumer-workspace-a", area: "backend" };
const stored = await protocol.remember(context, {
  topicKey: "consumer-smoke-memory",
  type: "discovery",
  title: "Consumer smoke memory",
  content: "Agent Memory works from the installed package.",
});
const hits = await provider.search({ query: "installed package", limit: 5, maxChars: 200 }, context);
const isolated = await provider.search({
  query: "installed package",
  limit: 5,
  maxChars: 200,
}, { projectId: "consumer-workspace-b", area: "backend" });
const mcp = createAgentMemoryMcpServer(provider, context);
await mcp.close();
repository.close();
if (!stored.stored || hits.entries.length !== 1 || isolated.entries.length !== 0) {
  throw new Error(JSON.stringify({ stored: stored.stored, hitCount: hits.entries.length, isolatedCount: isolated.entries.length }));
}
console.log(JSON.stringify({ stored: stored.stored, hitCount: hits.entries.length, isolatedCount: isolated.entries.length }));
`,
  );
  const smokeOutput = run(
    process.execPath,
    ["consumer-smoke.mjs"],
    consumerDir,
  ).trim();
  console.log(
    JSON.stringify({ package: packed[0].filename, ...JSON.parse(smokeOutput) }),
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
