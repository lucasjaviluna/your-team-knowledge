/* global console */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const failures = [];

if (packageJson.name !== "@corporate-knowledge/platform") {
  failures.push("package.name must remain @corporate-knowledge/platform");
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  failures.push(
    `package.version is not a valid release version: ${packageJson.version}`,
  );
}
for (const requiredFile of ["dist", "package.json", "README.md", "LICENSE"]) {
  if (!packageJson.files?.includes(requiredFile)) {
    failures.push(`package.files must include ${requiredFile}`);
  }
}
for (const exportKey of [".", "./memory", "./mcp"]) {
  const entry = packageJson.exports?.[exportKey];
  if (!entry?.types || !entry.import) {
    failures.push(`exports.${exportKey} must define types and import entries`);
  }
}
if (packageJson.bin?.["ytk-memory-mcp"] !== "./dist/mcp-server.js") {
  failures.push("package.bin must expose ytk-memory-mcp");
}
for (const binary of ["ytk-memory-init", "ytk-memory-admin"]) {
  if (typeof packageJson.bin?.[binary] !== "string")
    failures.push(`package.bin must expose ${binary}`);
}
for (const optionalPeer of ["pg", "@huggingface/transformers"]) {
  if (packageJson.peerDependenciesMeta?.[optionalPeer]?.optional !== true) {
    failures.push(`peer dependency ${optionalPeer} must remain optional`);
  }
}

if (failures.length > 0) {
  throw new Error(JSON.stringify({ packageContract: "failed", failures }));
}

console.log(
  JSON.stringify({
    packageContract: "passed",
    name: packageJson.name,
    version: packageJson.version,
    private: packageJson.private === true,
    exports: Object.keys(packageJson.exports ?? {}),
  }),
);
