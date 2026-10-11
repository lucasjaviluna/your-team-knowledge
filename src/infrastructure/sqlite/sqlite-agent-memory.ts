import Database from "better-sqlite3";

import type { MemoryRepository, SearchMemoryInput } from "../../application/index.js";
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

export class SqliteAgentMemoryRepository implements MemoryRepository {
  private readonly database: Database.Database;

  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("journal_mode = WAL");
    this.migrate();
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
      .run(session.id, session.workspaceId, session.startedAt.toISOString(), null, null);
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
  ): MemoryItem | undefined {
    const row = this.database
      .prepare<
        [string, string],
        MemoryRow
      >(`SELECT * FROM memory_items WHERE workspace_id = ? AND subject_key = ? AND status = 'active' LIMIT 1`)
      .get(workspaceId, subjectKey);

    return row ? toMemoryItem(row) : undefined;
  }

  insert(item: MemoryItem): void {
    this.database
      .prepare(
        `INSERT INTO memory_items (
          id, workspace_id, session_id, type, title, content, subject_key,
          tags_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...toValues(item));
    this.index(item);
  }

  update(item: MemoryItem): void {
    this.database
      .prepare(
        `UPDATE memory_items SET
          session_id = ?, type = ?, title = ?, content = ?, subject_key = ?,
          tags_json = ?, status = ?, updated_at = ?
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
        item.id,
      );
    this.index(item);
  }

  search(input: Required<SearchMemoryInput>): readonly MemoryItem[] {
    const ftsQuery = toFtsQuery(input.query);

    if (!ftsQuery) {
      return [];
    }

    const rows = this.database
      .prepare<
        [string, string, number],
        MemoryRow
      >(`SELECT memory_items.*
          FROM memory_items_fts
          JOIN memory_items ON memory_items.id = memory_items_fts.memory_id
          WHERE memory_items.workspace_id = ?
            AND memory_items.status = 'active'
            AND memory_items_fts MATCH ?
          ORDER BY bm25(memory_items_fts), memory_items.updated_at DESC
          LIMIT ?`)
      .all(input.workspaceId, ftsQuery, input.limit);

    return rows.map(toMemoryItem);
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
  }

  private index(item: MemoryItem): void {
    this.database.prepare("DELETE FROM memory_items_fts WHERE memory_id = ?").run(item.id);
    this.database
      .prepare(
        `INSERT INTO memory_items_fts (memory_id, title, content, tags, subject_key)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(item.id, item.title, item.content, item.tags.join(" "), item.subjectKey ?? "");
  }
}

function toValues(item: MemoryItem): [
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

function toFtsQuery(query: string): string {
  return query
    .split(/[^\p{L}\p{N}_/-]+/u)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" AND ");
}
