import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, parse, resolve } from "node:path";

export interface ProjectMemoryConfig {
  projectId: string;
  projectRoot: string;
  databaseFile: string;
  area?: string;
  source: "argument" | "environment" | "config" | "git" | "directory";
  configFile?: string;
}

interface TeamMemoryFile {
  project_slug?: unknown;
  projectId?: unknown;
  default_area?: unknown;
  database?: unknown;
}

/** Resolves one stable project scope without writing to the caller's checkout. */
export function resolveProjectMemoryConfig(input: {
  projectId?: string;
  database?: string;
  area?: string;
  environment: NodeJS.ProcessEnv;
  workingDirectory: string;
}): ProjectMemoryConfig {
  const workingDirectory = resolve(input.workingDirectory);
  const discovered = findConfig(workingDirectory);
  const fileConfig = discovered?.config;
  const explicitProject = text(input.projectId);
  const environmentProject = text(input.environment.TEAM_KNOWLEDGE_PROJECT_ID);
  const configuredProject =
    text(fileConfig?.project_slug) ?? text(fileConfig?.projectId);
  const gitProject =
    explicitProject || environmentProject || configuredProject
      ? undefined
      : projectFromGit(workingDirectory);
  const projectId =
    explicitProject ??
    environmentProject ??
    configuredProject ??
    gitProject ??
    normalizeProjectId(basename(workingDirectory));
  const source: ProjectMemoryConfig["source"] = explicitProject
    ? "argument"
    : environmentProject
      ? "environment"
      : configuredProject
        ? "config"
        : gitProject
          ? "git"
          : "directory";
  const projectRoot = discovered?.directory ?? workingDirectory;
  const configuredDatabase =
    text(input.database) ??
    text(input.environment.TEAM_KNOWLEDGE_MEMORY_DATABASE) ??
    text(fileConfig?.database);
  const databaseFile = resolve(
    projectRoot,
    configuredDatabase || ".team-memory/agent-memory.sqlite",
  );
  const area =
    text(input.area) ??
    text(input.environment.TEAM_KNOWLEDGE_AREA) ??
    text(fileConfig?.default_area);
  return {
    projectId: requireProjectId(projectId),
    projectRoot,
    databaseFile,
    ...(area ? { area } : {}),
    source,
    ...(discovered ? { configFile: discovered.filename } : {}),
  };
}

function findConfig(
  start: string,
): { filename: string; directory: string; config: TeamMemoryFile } | undefined {
  let current = start;
  while (true) {
    const filename = join(current, ".team-memory.json");
    if (existsSync(filename)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(filename, "utf8"));
      } catch {
        throw new Error(`Invalid JSON in ${filename}.`);
      }
      if (!isRecord(parsed))
        throw new Error(`Expected an object in ${filename}.`);
      return { filename, directory: current, config: parsed };
    }
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return undefined;
    current = parent;
  }
}

function projectFromGit(workingDirectory: string): string | undefined {
  try {
    const remote = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        cwd: workingDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    const match = remote.match(/(?:[:/])([^/:]+?)(?:\.git)?$/);
    return match?.[1] ? normalizeProjectId(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function requireProjectId(value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 200 ||
    [...normalized].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error("Resolved project id is invalid.");
  return normalized;
}

function normalizeProjectId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "project";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function isRecord(value: unknown): value is TeamMemoryFile {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
