/* global console, process */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  MemoryService,
  PiHarnessMemoryProvider,
  SqliteAgentMemoryRepository,
} from "../dist/memory.js";

const options = parseOptions(process.argv.slice(2));
const database = resolve(options.database);
await mkdir(dirname(database), { recursive: true });

const repository = new SqliteAgentMemoryRepository(database);
const memory = new MemoryService(repository);
const provider = new PiHarnessMemoryProvider(memory);
const context = { projectId: options.project, area: options.area };

try {
  const stored = options.shouldStore
    ? await provider.store(
        {
          idempotencyKey: `demo:${options.project}:deployment-decision`,
          title: options.title,
          content: options.content,
          source: "agent-memory-demo",
          area: options.area,
          tags: ["decision", options.area],
        },
        context,
      )
    : undefined;
  const result = await provider.search(
    { query: options.query, limit: options.limit, maxChars: options.maxChars },
    context,
  );

  console.log(
    JSON.stringify(
      {
        database,
        projectId: options.project,
        stored,
        query: options.query,
        entries: result.entries,
        hint: options.shouldStore
          ? "Podés volver a ejecutar sólo con --query para buscar sin sobrescribir la memoria."
          : "Búsqueda ejecutada sin modificar la memoria.",
      },
      null,
      2,
    ),
  );
} finally {
  repository.close();
}

function parseOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) continue;
    const [key, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`Missing value for --${key}.`);
    values.set(key, normalizeNpmWindowsValue(value));
  }

  const title = values.get("title");
  const content = values.get("content");
  if ((title && !content) || (!title && content)) {
    throw new Error("--title and --content must be provided together.");
  }

  return {
    database: values.get("database") ?? ".local/agent-memory.sqlite",
    project: values.get("project") ?? "demo-project",
    area: values.get("area") ?? "backend",
    query: values.get("query") ?? "decisión despliegue",
    title,
    content,
    shouldStore: Boolean(title && content),
    limit: positiveInteger(values.get("limit") ?? "5", "limit"),
    maxChars: positiveInteger(values.get("max-chars") ?? "500", "max-chars"),
  };
}

function normalizeNpmWindowsValue(value) {
  if (value.startsWith("^") && value.endsWith("^")) {
    return value.replaceAll("^", "");
  }
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}
