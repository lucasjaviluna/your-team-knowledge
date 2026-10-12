/* global console */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
if (
  typeof packageJson.version !== "string" ||
  !versionPattern.test(packageJson.version)
) {
  throw new Error("package.json version must be valid SemVer.");
}

if (packageJson.private !== true) {
  throw new Error(
    "The internal release contract requires package.json private=true.",
  );
}

const versionHeading = new RegExp(
  `^## \\[${packageJson.version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`,
  "m",
);
if (!versionHeading.test(changelog)) {
  throw new Error(
    `CHANGELOG.md must contain a dated heading for version ${packageJson.version}.`,
  );
}

console.log(
  JSON.stringify({
    releaseContract: "passed",
    version: packageJson.version,
    private: packageJson.private,
  }),
);
