/* global console */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationsDirectory = resolve(
  import.meta.dirname,
  "../infrastructure/postgres/migrations",
);
const entries = (await readdir(migrationsDirectory))
  .filter((entry) => entry.endsWith(".sql"))
  .sort();
const failures = [];
const migrationNumbers = [];

for (const entry of entries) {
  const match = /^(\d{3})-[a-z0-9-]+\.sql$/.exec(entry);
  if (!match) {
    failures.push(`invalid migration filename: ${entry}`);
    continue;
  }

  const number = Number(match[1]);
  migrationNumbers.push(number);
  const sql = await readFile(resolve(migrationsDirectory, entry), "utf8");
  if (!sql.trim()) failures.push(`migration is empty: ${entry}`);
}

const expectedNumbers = migrationNumbers.map((_, index) => index + 1);
if (
  migrationNumbers.some((number, index) => number !== expectedNumbers[index])
) {
  failures.push(
    `migration sequence must be contiguous from 001: ${migrationNumbers.join(", ")}`,
  );
}
if (entries.length === 0) failures.push("no PostgreSQL migrations found");

if (failures.length > 0) {
  throw new Error(JSON.stringify({ migrationContract: "failed", failures }));
}

console.log(
  JSON.stringify({
    migrationContract: "passed",
    directory: "infrastructure/postgres/migrations",
    files: entries,
  }),
);
