/* global process */

import assert from "node:assert/strict";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const root = resolve(".");
const moduleDirectory = join(root, "native", "ytk-memory");
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const version = process.env.YTK_MEMORY_VERSION ?? packageJson.version;
const targetOS = process.env.YTK_MEMORY_TARGET_OS ?? hostOS();
const targetArch = process.env.YTK_MEMORY_TARGET_ARCH ?? "amd64";
const executableName = targetOS === "windows" ? "ytk-memory.exe" : "ytk-memory";
const platformName = `${targetOS}_${targetArch}`;
const artifactName =
  targetOS === "windows"
    ? `ytk-memory_${version}_${platformName}.zip`
    : `ytk-memory_${version}_${platformName}.tar.gz`;
const outputDirectory = resolve(
  process.env.YTK_MEMORY_RELEASE_DIR ?? "artifacts/native",
);
const temporary = mkdtempSync(join(tmpdir(), "ytk-memory-go-release-"));
const staging = join(temporary, "ytk-memory");
const executable = join(staging, executableName);
mkdirSync(staging, { recursive: true });

try {
  run(
    goCommand(),
    [
      "build",
      "-trimpath",
      "-buildvcs=false",
      "-ldflags",
      `-X main.version=${version}`,
      "-o",
      executable,
      "./cmd/ytk-memory",
    ],
    moduleDirectory,
    {
      ...process.env,
      CGO_ENABLED: "0",
      GOOS: targetOS === "windows" ? "windows" : "linux",
      GOARCH: targetArch === "amd64" ? "amd64" : targetArch,
      GOCACHE: join(tmpdir(), "ytk-memory-go-release-cache"),
    },
  );

  const manifest = {
    name: "ytk-memory",
    version,
    platform: targetOS,
    architecture: targetArch,
    executable: executableName,
    schema: "current",
    protocol: "agent-memory-mcp-v1",
  };
  writeFileSync(
    join(staging, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  runArchive(staging, join(outputDirectory, artifactName));
  const artifact = join(outputDirectory, artifactName);
  const digest = sha256(artifact);
  const checksums = join(
    outputDirectory,
    `ytk-memory_${version}_checksums.txt`,
  );
  writeFileSync(checksums, `${digest}  ${artifactName}\n`);

  const signature = signChecksums(checksums, outputDirectory, version);
  const releaseManifest = {
    ...manifest,
    artifact: artifactName,
    sha256: digest,
    checksums: `ytk-memory_${version}_checksums.txt`,
    signature: signature.file,
    signatureKey: signature.publicKeyFile,
    signatureMode: signature.mode,
  };
  writeFileSync(
    join(
      outputDirectory,
      `ytk-memory_${version}_${platformName}.manifest.json`,
    ),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
  );

  await validateCleanInstall(executable, targetOS);
  process.stdout.write(
    `${JSON.stringify(
      {
        version,
        platform: targetOS,
        architecture: targetArch,
        artifact,
        sha256: digest,
        signature: signature.mode,
        cleanInstall: true,
        status: "passed",
      },
      null,
      2,
    )}\n`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

function hostOS() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  throw new Error(`Unsupported host platform: ${process.platform}`);
}

function goCommand() {
  if (process.env.GO) return process.env.GO;
  const windowsGo = "C:\\Program Files\\Go\\bin\\go.exe";
  return process.platform === "win32" && existsSync(windowsGo)
    ? windowsGo
    : "go";
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr}`,
    );
  }
  return result.stdout;
}

function runArchive(source, destination) {
  const outputDirectoryForArchive = dirname(destination);
  mkdirSync(outputDirectoryForArchive, { recursive: true });
  if (targetOS === "windows") {
    run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Compress-Archive -Path ${quotePowerShell(join(source, "*"))} -DestinationPath ${quotePowerShell(destination)} -Force`,
      ],
      root,
    );
  } else {
    run("tar", ["-czf", destination, "-C", source, "."], root);
  }
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function signChecksums(checksums, directory, releaseVersion) {
  let privateKey;
  let publicKey;
  let mode = "ephemeral";
  const configured = process.env.YTK_MEMORY_SIGNING_PRIVATE_KEY;
  if (configured) {
    const pem = existsSync(configured)
      ? readFileSync(configured, "utf8")
      : configured;
    privateKey = createPrivateKey(pem);
    publicKey = createPublicKey(privateKey);
    mode = "configured";
  } else {
    const pair = generateKeyPairSync("ed25519");
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  }
  const signatureName = `ytk-memory_${releaseVersion}_checksums.txt.sig`;
  const publicKeyName = `ytk-memory_${releaseVersion}_checksums.pub.pem`;
  const checksumContents = readFileSync(checksums);
  const signatureContents = sign(null, checksumContents, privateKey);
  assert.equal(
    verify(null, checksumContents, publicKey, signatureContents),
    true,
  );
  writeFileSync(join(directory, signatureName), signatureContents);
  writeFileSync(
    join(directory, publicKeyName),
    publicKey.export({ type: "spki", format: "pem" }),
  );
  return { file: signatureName, publicKeyFile: publicKeyName, mode };
}

async function validateCleanInstall(binary, platform) {
  assert.equal(platform === hostOS(), true, "clean install must run natively");
  const clean = mkdtempSync(join(tmpdir(), "ytk-memory-go-clean-"));
  const database = join(clean, ".ytk-memory", "ytk-memory.sqlite");
  try {
    assert.equal(cliText(binary, clean, ["--version"]).trim(), version);
    cli(binary, clean, [
      "setup",
      "codex",
      "--instructions",
      "local",
      "--portable",
    ]);
    const doctor = cli(binary, clean, ["doctor"]);
    assert.equal(doctor.healthy, true);
    const backup = join(clean, ".ytk-memory", "backup.sqlite");
    assert.equal(
      cli(binary, clean, ["backup", "--to", backup]).operation,
      "backup",
    );
    assert.equal(
      cli(binary, clean, [
        "upgrade",
        "--backup-to",
        join(clean, ".ytk-memory", "upgrade.sqlite"),
      ]).schema,
      "current",
    );
    assert.equal(existsSync(database), true);
    const transport = new StdioClientTransport({
      command: binary,
      args: ["mcp", "--project", "release-check", "--database", database],
      cwd: clean,
    });
    const client = new Client({
      name: "ytk-memory-release-check",
      version: "1",
    });
    await client.connect(transport);
    const tools = (await client.listTools()).tools
      .map((tool) => tool.name)
      .sort();
    assert.deepEqual(tools, [
      "memory_get",
      "memory_save",
      "memory_search",
      "memory_session_finish",
      "memory_session_start",
    ]);
    await client.close();
    await transport.close();
    rmSync(clean, { recursive: true, force: true });
  } catch (error) {
    rmSync(clean, { recursive: true, force: true });
    throw error;
  }
}

function cli(binary, cwd, args) {
  return JSON.parse(cliText(binary, cwd, [...args, "--json"]));
}

function cliText(binary, cwd, args) {
  const result = spawnSync(binary, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}
