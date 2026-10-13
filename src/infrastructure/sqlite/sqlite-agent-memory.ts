import Database from "better-sqlite3";
import { resolve } from "node:path";

import type {
  MemoryRepository,
  MemoryLifecycleSnapshot,
  ResolvedSearchMemoryInput,
} from "../../application/index.js";
import type {
  MemoryItem,
  MemoryItemStatus,
  MemoryItemType,
  MemoryRelation,
  MemoryRelationType,
  MemorySession,
} from "../../domain/index.js";

interface MemoryRow {
  id: string;
  workspace_id: string;
  session_id: string | null;
  type: MemoryItemType;
  title: string;
  content: string;
  subject_key: string | null;
  tags_json: string;
  status: MemoryItemStatus;
  created_at: string;
  updated_at: string;
  valid_from: string;
  expires_at: string | null;
  review_at: string | null;
  archived_at: string | null;
}

interface SessionRow {
  id: string;
  workspace_id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

interface RelationRow {
  source_memory_id: string;
  target_memory_id: string;
  relation: MemoryRelationType;
  created_at: string;
}

export interface SqliteAgentMemoryOptions {
  synonyms?: Readonly<Record<string, readonly string[]>>;
}

export interface SqliteBackupResult {
  destinationFile: string;
  totalPages: number;
  remainingPages: number;
}

const defaultSynonyms: Readonly<Record<string, readonly string[]>> = {
  autenticacion: [
    "autenticación",
    "autenticacion",
    "authentication",
    "auth",
    "autenticada",
    "autenticadas",
  ],
  autenticación: [
    "autenticación",
    "autenticacion",
    "authentication",
    "auth",
    "autenticada",
    "autenticadas",
  ],
  proteccion: [
    "protección",
    "proteccion",
    "proteger",
    "protege",
    "protegen",
    "protegida",
    "protegidas",
  ],
  protección: [
    "protección",
    "proteccion",
    "proteger",
    "protege",
    "protegen",
    "protegida",
    "protegidas",
  ],
  despliegue: ["despliegue", "despliegues", "deployment", "deploy"],
  deployment: ["despliegue", "despliegues", "deployment", "deploy"],
  rollback: ["rollback", "reversion", "reversión", "revertir"],
};

export class SqliteAgentMemoryRepository implements MemoryRepository {
  private readonly database: Database.Database;

  private readonly filename: string;

  private readonly synonyms: Readonly<Record<string, readonly string[]>>;

  constructor(filename: string, options: SqliteAgentMemoryOptions = {}) {
    this.filename = filename;
    this.synonyms = buildSynonymIndex({
      ...defaultSynonyms,
      ...(options.synonyms ?? {}),
    });
    this.database = new Database(filename);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.migrate();
  }

  async backup(destinationFile: string): Promise<SqliteBackupResult> {
    const destination = destinationFile.trim();
    if (!destination) {
      throw new Error("destinationFile is required.");
    }
    if (
      this.filename !== ":memory:" &&
      resolve(this.filename) === resolve(destination)
    ) {
      throw new Error("destinationFile must differ from the source database.");
    }

    const metadata = await this.database.backup(destination);
    return {
      destinationFile: destination,
      totalPages: metadata.totalPages,
      remainingPages: metadata.remainingPages,
    };
  }

  close(): void {
    this.database.close();
  }

  insertSession(session: MemorySession): void {
    this.database
      .prepare(
        `INSERT INTO sessions (id, workspace_id, started_at, ended_at, summary)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.workspaceId,
        session.startedAt.toISOString(),
        null,
        null,
      );
  }

  findSession(sessionId: string): MemorySession | undefined {
    const row = this.database
      .prepare<[string], SessionRow>("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId);

    return row ? toMemorySession(row) : undefined;
  }

  endSession(sessionId: string, endedAt: Date, summary?: string): void {
    this.database
      .prepare("UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?")
      .run(endedAt.toISOString(), summary ?? null, sessionId);
  }

  addRelation(relation: MemoryRelation): void {
    this.database
      .prepare(
        `INSERT OR REPLACE INTO memory_relations
         (source_memory_id, target_memory_id, relation, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        relation.sourceMemoryId,
        relation.targetMemoryId,
        relation.relation,
        relation.createdAt.toISOString(),
      );
  }

  listRelations(memoryId: string): readonly MemoryRelation[] {
    const rows = this.database
      .prepare<[string, string], RelationRow>(
        `SELECT * FROM memory_relations
         WHERE source_memory_id = ? OR target_memory_id = ?
         ORDER BY created_at ASC`,
      )
      .all(memoryId, memoryId);

    return rows.map(toMemoryRelation);
  }

  findActiveBySubjectKey(
    workspaceId: string,
    subjectKey: string,
    asOf = new Date(),
  ): MemoryItem | undefined {
    const row = this.database
      .prepare<[string, string, string, string, string], MemoryRow>(
        `SELECT * FROM memory_items
         WHERE workspace_id = ? AND subject_key = ? AND status = 'active'
           AND valid_from <= ?
           AND (expires_at IS NULL OR expires_at > ?)
           AND (review_at IS NULL OR review_at > ?)
         LIMIT 1`,
      )
      .get(
        workspaceId,
        subjectKey,
        asOf.toISOString(),
        asOf.toISOString(),
        asOf.toISOString(),
      );

    return row ? toMemoryItem(row) : undefined;
  }

  findById(memoryId: string): MemoryItem | undefined {
    const row = this.database
      .prepare<[string], MemoryRow>("SELECT * FROM memory_items WHERE id = ?")
      .get(memoryId);

    return row ? toMemoryItem(row) : undefined;
  }

  insert(item: MemoryItem): void {
    this.database
      .prepare(
        `INSERT INTO memory_items (
          id, workspace_id, session_id, type, title, content, subject_key,
          tags_json, status, created_at, updated_at, valid_from, expires_at,
          review_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...toValues(item));
    this.index(item);
  }

  update(item: MemoryItem): void {
    this.database
      .prepare(
        `UPDATE memory_items SET
          session_id = ?, type = ?, title = ?, content = ?, subject_key = ?,
          tags_json = ?, status = ?, updated_at = ?, valid_from = ?,
          expires_at = ?, review_at = ?, archived_at = ?
        WHERE id = ?`,
      )
      .run(
        item.sessionId ?? null,
        item.type,
        item.title,
        item.content,
        item.subjectKey ?? null,
        JSON.stringify(item.tags),
        item.status,
        item.updatedAt.toISOString(),
        (item.validFrom ?? item.createdAt).toISOString(),
        item.expiresAt?.toISOString() ?? null,
        item.reviewAt?.toISOString() ?? null,
        item.archivedAt?.toISOString() ?? null,
        item.id,
      );
    this.index(item);
  }

  search(input: ResolvedSearchMemoryInput): readonly MemoryItem[] {
    const ftsQuery = toFtsQuery(input.query, this.synonyms);

    if (!ftsQuery) {
      return [];
    }

    const reviewClause = input.includeNeedsReview
      ? "AND memory_items.status IN ('active', 'needs_review')"
      : "AND memory_items.status = 'active' AND (memory_items.review_at IS NULL OR memory_items.review_at > ?)";
    const parameters = input.includeNeedsReview
      ? [
          input.workspaceId,
          input.asOf.toISOString(),
          input.asOf.toISOString(),
          ftsQuery,
          input.limit,
        ]
      : [
          input.workspaceId,
          input.asOf.toISOString(),
          input.asOf.toISOString(),
          input.asOf.toISOString(),
          ftsQuery,
          input.limit,
        ];
    const rows = this.database
      .prepare<unknown[], MemoryRow>(
        `SELECT memory_items.*
          FROM memory_items_fts
          JOIN memory_items ON memory_items.id = memory_items_fts.memory_id
          WHERE memory_items.workspace_id = ?
            AND memory_items.valid_from <= ?
            AND (memory_items.expires_at IS NULL OR memory_items.expires_at > ?)
            ${reviewClause}
            AND memory_items_fts MATCH ?
          ORDER BY bm25(memory_items_fts), memory_items.updated_at DESC
          LIMIT ?`,
      )
      .all(...parameters);

    return rows.map(toMemoryItem);
  }

  listDueForReview(asOf: Date, workspaceId?: string): readonly MemoryItem[] {
    const rows = workspaceId
      ? this.database
          .prepare<[string, string], MemoryRow>(
            `SELECT * FROM memory_items
             WHERE workspace_id = ? AND status = 'active'
               AND review_at IS NOT NULL AND review_at <= ?
             ORDER BY review_at ASC, updated_at ASC`,
          )
          .all(workspaceId, asOf.toISOString())
      : this.database
          .prepare<[string], MemoryRow>(
            `SELECT * FROM memory_items
             WHERE status = 'active'
               AND review_at IS NOT NULL AND review_at <= ?
             ORDER BY review_at ASC, updated_at ASC`,
          )
          .all(asOf.toISOString());

    return rows.map(toMemoryItem);
  }

  archiveExpired(asOf: Date): number {
    const result = this.database
      .prepare(
        `UPDATE memory_items
         SET status = 'archived', archived_at = ?, updated_at = ?
         WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .run(asOf.toISOString(), asOf.toISOString(), asOf.toISOString());

    return result.changes;
  }

  listExpiredIds(asOf: Date): readonly string[] {
    return this.database
      .prepare<[string], { id: string }>(
        `SELECT id FROM memory_items
         WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?
         ORDER BY expires_at, id`,
      )
      .all(asOf.toISOString())
      .map((row) => row.id);
  }

  purgeArchived(before: Date): number {
    const transaction = this.database.transaction(() => {
      const rows = this.database
        .prepare<[string], { id: string }>(
          `SELECT id FROM memory_items
           WHERE status = 'archived' AND COALESCE(archived_at, updated_at) < ?`,
        )
        .all(before.toISOString());

      for (const row of rows) {
        this.database
          .prepare("DELETE FROM memory_items_fts WHERE memory_id = ?")
          .run(row.id);
        this.database
          .prepare(
            "DELETE FROM memory_relations WHERE source_memory_id = ? OR target_memory_id = ?",
          )
          .run(row.id, row.id);
        this.database
          .prepare("DELETE FROM memory_items WHERE id = ?")
          .run(row.id);
      }

      return rows.length;
    });

    return transaction();
  }

  listArchivedIds(before: Date): readonly string[] {
    return this.database
      .prepare<[string], { id: string }>(
        `SELECT id FROM memory_items
         WHERE status = 'archived' AND COALESCE(archived_at, updated_at) < ?
         ORDER BY COALESCE(archived_at, updated_at), id`,
      )
      .all(before.toISOString())
      .map((row) => row.id);
  }

  inspectLifecycle(asOf: Date, workspaceId?: string): MemoryLifecycleSnapshot {
    const rows = workspaceId
      ? this.database
          .prepare<[string], MemoryRow>(
            "SELECT * FROM memory_items WHERE workspace_id = ?",
          )
          .all(workspaceId)
      : this.database
          .prepare<[], MemoryRow>("SELECT * FROM memory_items")
          .all();
    const byStatus: Record<MemoryItemStatus, number> = {
      active: 0,
      needs_review: 0,
      superseded: 0,
      archived: 0,
    };
    let future = 0;
    let expired = 0;
    let dueForReview = 0;

    for (const row of rows) {
      byStatus[row.status] += 1;
      if (new Date(row.valid_from) > asOf) future += 1;
      if (row.expires_at && new Date(row.expires_at) <= asOf) expired += 1;
      if (
        row.review_at &&
        new Date(row.review_at) <= asOf &&
        row.status === "active"
      ) {
        dueForReview += 1;
      }
    }

    return { total: rows.length, byStatus, future, expired, dueForReview };
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        session_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        subject_key TEXT,
        tags_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        expires_at TEXT,
        review_at TEXT,
        archived_at TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS memory_items_workspace_status_idx
        ON memory_items(workspace_id, status);

      CREATE INDEX IF NOT EXISTS memory_items_subject_key_idx
        ON memory_items(workspace_id, subject_key);

      CREATE TABLE IF NOT EXISTS memory_relations (
        source_memory_id TEXT NOT NULL,
        target_memory_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_memory_id, target_memory_id, relation),
        FOREIGN KEY (source_memory_id) REFERENCES memory_items(id),
        FOREIGN KEY (target_memory_id) REFERENCES memory_items(id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
        memory_id UNINDEXED,
        title,
        content,
        tags,
        subject_key
      );
    `);

    this.ensureColumn(
      "memory_items",
      "valid_from",
      "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'",
    );
    this.ensureColumn("memory_items", "expires_at", "TEXT");
    this.ensureColumn("memory_items", "review_at", "TEXT");
    this.ensureColumn("memory_items", "archived_at", "TEXT");
    this.database.exec(
      "CREATE INDEX IF NOT EXISTS memory_items_lifecycle_idx ON memory_items(workspace_id, status, valid_from, expires_at, review_at)",
    );
  }

  private ensureColumn(
    table: string,
    column: string,
    definition: string,
  ): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];

    if (!columns.some((entry) => entry.name === column)) {
      this.database.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      );
    }
  }

  private index(item: MemoryItem): void {
    this.database
      .prepare("DELETE FROM memory_items_fts WHERE memory_id = ?")
      .run(item.id);
    this.database
      .prepare(
        `INSERT INTO memory_items_fts (memory_id, title, content, tags, subject_key)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.title,
        item.content,
        item.tags.join(" "),
        item.subjectKey ?? "",
      );
  }
}

function toValues(
  item: MemoryItem,
): [
  string,
  string,
  string | null,
  MemoryItemType,
  string,
  string,
  string | null,
  string,
  MemoryItemStatus,
  string,
  string,
  string,
  string | null,
  string | null,
  string | null,
] {
  return [
    item.id,
    item.workspaceId,
    item.sessionId ?? null,
    item.type,
    item.title,
    item.content,
    item.subjectKey ?? null,
    JSON.stringify(item.tags),
    item.status,
    item.createdAt.toISOString(),
    item.updatedAt.toISOString(),
    (item.validFrom ?? item.createdAt).toISOString(),
    item.expiresAt?.toISOString() ?? null,
    item.reviewAt?.toISOString() ?? null,
    item.archivedAt?.toISOString() ?? null,
  ];
}

function toMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    type: row.type,
    title: row.title,
    content: row.content,
    ...(row.subject_key ? { subjectKey: row.subject_key } : {}),
    tags: JSON.parse(row.tags_json) as string[],
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    validFrom: new Date(row.valid_from),
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at) } : {}),
    ...(row.review_at ? { reviewAt: new Date(row.review_at) } : {}),
    ...(row.archived_at ? { archivedAt: new Date(row.archived_at) } : {}),
  };
}

function toMemorySession(row: SessionRow): MemorySession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    startedAt: new Date(row.started_at),
    ...(row.ended_at ? { endedAt: new Date(row.ended_at) } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
  };
}

function toMemoryRelation(row: RelationRow): MemoryRelation {
  return {
    sourceMemoryId: row.source_memory_id,
    targetMemoryId: row.target_memory_id,
    relation: row.relation,
    createdAt: new Date(row.created_at),
  };
}

function toFtsQuery(
  query: string,
  synonyms: Readonly<Record<string, readonly string[]>> = {},
): string {
  return query
    .split(/[^\p{L}\p{N}_/-]+/u)
    .filter(Boolean)
    .map((term) => {
      const synonymVariants = synonyms[term.toLocaleLowerCase()] ?? [];
      const variants = [
        term,
        singularize(term),
        ...synonymVariants,
        ...synonymVariants.map(singularize),
      ].filter((value, index, values) => values.indexOf(value) === index);
      return variants.length === 1
        ? quoteFtsTerm(variants[0] as string)
        : `(${variants.map(quoteFtsTerm).join(" OR ")})`;
    })
    .join(" AND ");
}

function buildSynonymIndex(
  groups: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  const index = new Map<string, Set<string>>();

  for (const [term, variants] of Object.entries(groups)) {
    const group = new Set([term, ...variants]);
    for (const variant of group) {
      const key = variant.toLocaleLowerCase();
      const existing = index.get(key) ?? new Set<string>();
      for (const member of group) existing.add(member);
      index.set(key, existing);
    }
  }

  return Object.fromEntries(
    [...index.entries()].map(([term, variants]) => [term, [...variants]]),
  );
}

function quoteFtsTerm(term: string): string {
  return `"${term.replaceAll('"', '""')}"`;
}

function singularize(term: string): string {
  if (term.length > 5 && term.endsWith("es")) {
    return term.slice(0, -2);
  }
  if (term.length > 4 && term.endsWith("s")) {
    return term.slice(0, -1);
  }
  return term;
}
