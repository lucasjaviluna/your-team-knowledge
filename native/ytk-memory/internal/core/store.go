package core

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const timestampLayout = "2006-01-02T15:04:05.000Z07:00"

type Store struct {
	db  *sql.DB
	now func() time.Time
}

type Session struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	OwnerID     *string `json:"ownerId,omitempty"`
	StartedAt   string  `json:"startedAt"`
	EndedAt     *string `json:"endedAt,omitempty"`
	Summary     *string `json:"summary,omitempty"`
}

type Memory struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspaceId"`
	SessionID   *string  `json:"sessionId,omitempty"`
	Type        string   `json:"type"`
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	SubjectKey  *string  `json:"subjectKey,omitempty"`
	Tags        []string `json:"tags"`
	Status      string   `json:"status"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	ValidFrom   string   `json:"validFrom"`
	ExpiresAt   *string  `json:"expiresAt,omitempty"`
	ReviewAt    *string  `json:"reviewAt,omitempty"`
	ArchivedAt  *string  `json:"archivedAt,omitempty"`
}

type Relation struct {
	SourceMemoryID string `json:"sourceMemoryId"`
	TargetMemoryID string `json:"targetMemoryId"`
	Relation       string `json:"relation"`
	CreatedAt      string `json:"createdAt"`
}

func Open(filename string, now func() time.Time) (*Store, error) {
	if now == nil {
		now = time.Now
	}
	db, err := sql.Open("sqlite", filename)
	if err != nil {
		return nil, err
	}
	store := &Store{db: db, now: now}
	if err := store.migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_id TEXT,
			started_at TEXT NOT NULL, ended_at TEXT, summary TEXT
		);
		CREATE TABLE IF NOT EXISTS memory_items (
			id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT,
			type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
			subject_key TEXT, tags_json TEXT NOT NULL, status TEXT NOT NULL,
			created_at TEXT NOT NULL, updated_at TEXT NOT NULL, valid_from TEXT NOT NULL,
			expires_at TEXT, review_at TEXT, archived_at TEXT,
			FOREIGN KEY (session_id) REFERENCES sessions(id)
		);
		CREATE INDEX IF NOT EXISTS memory_items_workspace_status_idx ON memory_items(workspace_id, status);
		CREATE INDEX IF NOT EXISTS memory_items_subject_key_idx ON memory_items(workspace_id, subject_key);
		CREATE TABLE IF NOT EXISTS memory_relations (
			source_memory_id TEXT NOT NULL, target_memory_id TEXT NOT NULL,
			relation TEXT NOT NULL, created_at TEXT NOT NULL,
			PRIMARY KEY (source_memory_id, target_memory_id, relation),
			FOREIGN KEY (source_memory_id) REFERENCES memory_items(id),
			FOREIGN KEY (target_memory_id) REFERENCES memory_items(id)
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS memory_items_fts USING fts5(
			memory_id UNINDEXED, title, content, tags, subject_key
		);
	`)
	if err != nil {
		return err
	}
	for _, column := range []struct{ name, definition string }{
		{"owner_id", "TEXT"},
	} {
		if err := ensureColumn(ctx, s.db, "sessions", column.name, column.definition); err != nil {
			return err
		}
	}
	for _, column := range []struct{ name, definition string }{
		{"valid_from", "TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'"},
		{"expires_at", "TEXT"},
		{"review_at", "TEXT"},
		{"archived_at", "TEXT"},
	} {
		if err := ensureColumn(ctx, s.db, "memory_items", column.name, column.definition); err != nil {
			return err
		}
	}
	_, err = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS memory_items_lifecycle_idx ON memory_items(workspace_id, status, valid_from, expires_at, review_at)`)
	return err
}

func ensureColumn(ctx context.Context, db *sql.DB, table, column, definition string) error {
	rows, err := db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, kind string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &kind, &notNull, &defaultValue, &primaryKey); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	_, err = db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	return err
}

func (s *Store) StartSession(ctx context.Context, id, workspaceID string, ownerID *string) (Session, error) {
	workspaceID = required(workspaceID, "workspaceId")
	startedAt := formatTime(s.now())
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (id, workspace_id, owner_id, started_at, ended_at, summary) VALUES (?, ?, ?, ?, NULL, NULL)`, id, workspaceID, ownerID, startedAt)
	return Session{ID: id, WorkspaceID: workspaceID, OwnerID: ownerID, StartedAt: startedAt}, err
}

func (s *Store) EndSession(ctx context.Context, sessionID string, summary *string) (Session, error) {
	existing, err := s.findSession(ctx, required(sessionID, "sessionId"))
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, fmt.Errorf("Session '%s' was not found.", sessionID)
	}
	if err != nil {
		return Session{}, err
	}
	endedAt := formatTime(s.now())
	_, err = s.db.ExecContext(ctx, `UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?`, endedAt, summary, sessionID)
	if err != nil {
		return Session{}, err
	}
	existing.EndedAt, existing.Summary = &endedAt, summary
	return existing, nil
}

// EndOwnedSession closes a session only when both its project and owner match.
func (s *Store) EndOwnedSession(ctx context.Context, sessionID, workspaceID, ownerID string, summary *string) (Session, error) {
	existing, err := s.findSession(ctx, required(sessionID, "sessionId"))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (existing.WorkspaceID != workspaceID || existing.OwnerID == nil || *existing.OwnerID != ownerID)) {
		return Session{}, fmt.Errorf("Session '%s' was not found.", sessionID)
	}
	if err != nil {
		return Session{}, err
	}
	if summary != nil && hasSensitiveContent(*summary) {
		return Session{}, errors.New("Sensitive content detected in memory.")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback()
	endedAt := formatTime(s.now())
	result, err := tx.ExecContext(ctx, `UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ? AND workspace_id = ? AND owner_id = ? AND ended_at IS NULL`, endedAt, summary, sessionID, workspaceID, ownerID)
	if err != nil {
		return Session{}, err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return Session{}, err
	}
	if changed != 1 {
		return Session{}, fmt.Errorf("Session '%s' was not found or is already closed.", sessionID)
	}
	if summary != nil {
		tags, _ := json.Marshal([]string{"source:agent-memory:sqlite"})
		now := endedAt
		_, err = tx.ExecContext(ctx, `INSERT INTO memory_items (id,workspace_id,session_id,type,title,content,subject_key,tags_json,status,created_at,updated_at,valid_from,expires_at,review_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, "session-summary-"+sessionID, workspaceID, sessionID, "summary", "Session summary", *summary, "session/"+sessionID, string(tags), "active", now, now, now, nil, nil, nil)
		if err != nil {
			return Session{}, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO memory_items_fts (memory_id,title,content,tags,subject_key) VALUES (?,?,?,?,?)`, "session-summary-"+sessionID, "Session summary", *summary, string(tags), "session/"+sessionID)
		if err != nil {
			return Session{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Session{}, err
	}
	existing.EndedAt, existing.Summary = &endedAt, summary
	return existing, nil
}

// Get returns an item only when it belongs to the requested workspace.
func (s *Store) Get(ctx context.Context, id, workspaceID string) (Memory, bool, error) {
	item, err := s.findMemory(ctx, required(id, "memoryId"))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && item.WorkspaceID != workspaceID) {
		return Memory{}, false, nil
	}
	if err != nil {
		return Memory{}, false, err
	}
	return item, true, nil
}

// Backup writes a consistent SQLite snapshot using VACUUM INTO.
type BackupResult struct {
	DestinationFile string `json:"destinationFile"`
	TotalPages      int    `json:"totalPages"`
	RemainingPages  int    `json:"remainingPages"`
}

func (s *Store) Backup(ctx context.Context, destination string) (BackupResult, error) {
	if strings.TrimSpace(destination) == "" {
		return BackupResult{}, errors.New("destination is required")
	}
	_, err := s.db.ExecContext(ctx, `VACUUM INTO '`+strings.ReplaceAll(destination, "'", "''")+`'`)
	if err != nil {
		return BackupResult{}, err
	}
	backup, err := sql.Open("sqlite", destination)
	if err != nil {
		return BackupResult{}, err
	}
	defer backup.Close()
	var pages int
	if err := backup.QueryRowContext(ctx, "PRAGMA page_count").Scan(&pages); err != nil {
		return BackupResult{}, err
	}
	return BackupResult{DestinationFile: destination, TotalPages: pages, RemainingPages: 0}, nil
}

// IntegrityCheck verifies the SQLite file without changing its contents.
func (s *Store) IntegrityCheck(ctx context.Context) error {
	rows, err := s.db.QueryContext(ctx, "PRAGMA quick_check")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			return err
		}
		if result != "ok" {
			return fmt.Errorf("SQLite integrity check failed: %s", result)
		}
	}
	return rows.Err()
}

func (s *Store) Save(ctx context.Context, input SaveInput) (Memory, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Memory{}, err
	}
	defer tx.Rollback()
	item, err := s.save(ctx, tx, input)
	if err != nil {
		return Memory{}, err
	}
	if err := tx.Commit(); err != nil {
		return Memory{}, err
	}
	return item, nil
}

func (s *Store) save(ctx context.Context, db queryExecutor, input SaveInput) (Memory, error) {
	workspaceID := required(input.WorkspaceID, "workspaceId")
	title, content := required(input.Title, "title"), required(input.Content, "content")
	if hasSensitiveContent(title + "\n" + content) {
		return Memory{}, errors.New("Sensitive content detected in memory.")
	}
	if input.SessionID != nil {
		session, err := s.findSession(ctx, *input.SessionID)
		if err != nil || session.WorkspaceID != workspaceID || (input.OwnerID != nil && (session.OwnerID == nil || *session.OwnerID != *input.OwnerID)) {
			return Memory{}, fmt.Errorf("Session '%s' was not found.", *input.SessionID)
		}
	}
	now := formatTime(s.now())
	var existing *Memory
	if input.SubjectKey != nil && strings.TrimSpace(*input.SubjectKey) != "" {
		item, err := s.findActiveBySubjectKey(ctx, workspaceID, strings.TrimSpace(*input.SubjectKey), now)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return Memory{}, err
		}
		if err == nil {
			existing = &item
		}
	}
	validFrom := now
	if input.ValidFrom != nil {
		validFrom = *input.ValidFrom
	} else if existing != nil {
		validFrom = existing.ValidFrom
	}
	expiresAt, reviewAt := input.ExpiresAt, input.ReviewAt
	if existing != nil {
		if expiresAt == nil {
			expiresAt = existing.ExpiresAt
		}
		if reviewAt == nil {
			reviewAt = existing.ReviewAt
		}
	}
	item := Memory{ID: input.ID, WorkspaceID: workspaceID, SessionID: input.SessionID, Type: input.Type, Title: title, Content: content, SubjectKey: trimmedPointer(input.SubjectKey), Tags: normalizeTags(input.Tags), Status: input.Status, CreatedAt: now, UpdatedAt: now, ValidFrom: validFrom, ExpiresAt: expiresAt, ReviewAt: reviewAt}
	if existing != nil {
		item.ID, item.CreatedAt = existing.ID, existing.CreatedAt
	}
	if item.Status == "" {
		item.Status = "active"
	}
	if err := validateMemory(item); err != nil {
		return Memory{}, err
	}
	if existing == nil {
		_, err := db.ExecContext(ctx, `INSERT INTO memory_items (id, workspace_id, session_id, type, title, content, subject_key, tags_json, status, created_at, updated_at, valid_from, expires_at, review_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, memoryValues(item)...)
		if err != nil {
			return Memory{}, err
		}
	} else {
		_, err := db.ExecContext(ctx, `UPDATE memory_items SET session_id=?, type=?, title=?, content=?, subject_key=?, tags_json=?, status=?, updated_at=?, valid_from=?, expires_at=?, review_at=?, archived_at=? WHERE id=?`, updateMemoryValues(item)...)
		if err != nil {
			return Memory{}, err
		}
	}
	if err := index(ctx, db, item); err != nil {
		return Memory{}, err
	}
	return item, nil
}

type queryExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type SaveInput struct {
	ID, WorkspaceID, Type, Title, Content, Status                  string
	SessionID, SubjectKey, ValidFrom, ExpiresAt, ReviewAt, OwnerID *string
	Tags                                                           []string
}

func (s *Store) Search(ctx context.Context, workspaceID, query string, limit int) ([]Memory, error) {
	ftsQuery := toFTSQuery(required(query, "query"))
	if ftsQuery == "" {
		return []Memory{}, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT memory_items.* FROM memory_items_fts JOIN memory_items ON memory_items.id = memory_items_fts.memory_id WHERE memory_items.workspace_id=? AND memory_items.status='active' AND memory_items.valid_from<=? AND (memory_items.expires_at IS NULL OR memory_items.expires_at>?) AND (memory_items.review_at IS NULL OR memory_items.review_at>?) AND memory_items_fts MATCH ? ORDER BY bm25(memory_items_fts), memory_items.updated_at DESC LIMIT ?`, workspaceID, formatTime(s.now()), formatTime(s.now()), formatTime(s.now()), ftsQuery, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Memory{}
	for rows.Next() {
		item, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// Context returns a compact, project-scoped briefing ordered by explicit
// priority, recent session summaries, then other durable memories.
func (s *Store) Context(ctx context.Context, workspaceID string, limit int) ([]Memory, error) {
	workspaceID = required(workspaceID, "workspaceId")
	if limit < 1 || limit > 100 {
		return nil, errors.New("limit must be between 1 and 100.")
	}
	now := formatTime(s.now())
	rows, err := s.db.QueryContext(ctx, `SELECT * FROM memory_items
		WHERE workspace_id=? AND status='active' AND valid_from<=?
		AND (expires_at IS NULL OR expires_at>?)
		AND (review_at IS NULL OR review_at>?)
		ORDER BY CASE
			WHEN instr(tags_json, '"priority:critical"')>0 THEN 0
			WHEN instr(tags_json, '"priority:high"')>0 THEN 1
			WHEN type='summary' THEN 2
			WHEN type IN ('decision','preference','pattern') THEN 3
			ELSE 4 END,
			updated_at DESC, id ASC LIMIT ?`, workspaceID, now, now, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Memory{}
	for rows.Next() {
		item, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) AddRelation(ctx context.Context, sourceID, targetID, relation string) (Relation, error) {
	source, err := s.findMemory(ctx, required(sourceID, "sourceMemoryId"))
	if err != nil {
		return Relation{}, errors.New("Both memories must exist before creating a relation.")
	}
	target, err := s.findMemory(ctx, required(targetID, "targetMemoryId"))
	if err != nil {
		return Relation{}, errors.New("Both memories must exist before creating a relation.")
	}
	if source.WorkspaceID != target.WorkspaceID {
		return Relation{}, errors.New("Related memories must belong to the same workspace.")
	}
	if source.Status == "archived" || target.Status == "archived" {
		return Relation{}, errors.New("Archived memories cannot participate in new relations.")
	}
	if sourceID == targetID {
		return Relation{}, errors.New("A memory cannot relate to itself.")
	}
	if relation != "related" && relation != "supports" && relation != "conflicts_with" && relation != "supersedes" {
		return Relation{}, fmt.Errorf("Unsupported memory relation type: '%s'.", relation)
	}
	var existing Relation
	err = s.db.QueryRowContext(ctx, `SELECT source_memory_id, target_memory_id, relation, created_at FROM memory_relations WHERE source_memory_id=? AND target_memory_id=? AND relation=?`, sourceID, targetID, relation).Scan(&existing.SourceMemoryID, &existing.TargetMemoryID, &existing.Relation, &existing.CreatedAt)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Relation{}, err
	}
	createdAt := formatTime(s.now())
	_, err = s.db.ExecContext(ctx, `INSERT INTO memory_relations (source_memory_id, target_memory_id, relation, created_at) VALUES (?, ?, ?, ?)`, sourceID, targetID, relation, createdAt)
	return Relation{SourceMemoryID: sourceID, TargetMemoryID: targetID, Relation: relation, CreatedAt: createdAt}, err
}

type RelatedMemory struct {
	Relation  string `json:"relation"`
	Direction string `json:"direction"`
	Memory    Memory `json:"memory"`
}

// ListRelations returns related memories only when both ends belong to the
// requested workspace.
func (s *Store) ListRelations(ctx context.Context, workspaceID, memoryID string, limit int) ([]RelatedMemory, error) {
	workspaceID = required(workspaceID, "workspaceId")
	memoryID = required(memoryID, "memoryId")
	if limit < 1 || limit > 100 {
		return nil, errors.New("limit must be between 1 and 100.")
	}
	_, ok, err := s.Get(ctx, memoryID, workspaceID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("Memory '%s' was not found.", memoryID)
	}
	rows, err := s.db.QueryContext(ctx, `SELECT r.source_memory_id, r.target_memory_id, r.relation, r.created_at
		FROM memory_relations r
		JOIN memory_items source ON source.id=r.source_memory_id
		JOIN memory_items target ON target.id=r.target_memory_id
		WHERE source.workspace_id=? AND target.workspace_id=?
		AND (r.source_memory_id=? OR r.target_memory_id=?)
		ORDER BY r.created_at DESC, r.source_memory_id, r.target_memory_id LIMIT ?`, workspaceID, workspaceID, memoryID, memoryID, limit)
	if err != nil {
		return nil, err
	}
	type relationIDs struct{ source, target, relation, createdAt string }
	ids := []relationIDs{}
	for rows.Next() {
		var value relationIDs
		if err := rows.Scan(&value.source, &value.target, &value.relation, &value.createdAt); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, value)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	result := make([]RelatedMemory, 0, len(ids))
	for _, value := range ids {
		direction, otherID := "outgoing", value.target
		if value.target == memoryID {
			direction, otherID = "incoming", value.source
		}
		other, exists, err := s.Get(ctx, otherID, workspaceID)
		if err != nil {
			return nil, err
		}
		if exists {
			result = append(result, RelatedMemory{Relation: value.relation, Direction: direction, Memory: other})
		}
	}
	return result, nil
}

type CorrectionResult struct {
	Previous Memory `json:"previous"`
	Current  Memory `json:"current"`
}

// CorrectMemory preserves the old revision and links the replacement to it.
func (s *Store) CorrectMemory(ctx context.Context, workspaceID, memoryID, title, content string) (CorrectionResult, error) {
	workspaceID = required(workspaceID, "workspaceId")
	memoryID = required(memoryID, "memoryId")
	title, content = required(title, "title"), required(content, "content")
	if hasSensitiveContent(title + "\n" + content) {
		return CorrectionResult{}, errors.New("Sensitive content detected in memory.")
	}

	old, ok, err := s.Get(ctx, memoryID, workspaceID)
	if err != nil {
		return CorrectionResult{}, err
	}
	if !ok {
		return CorrectionResult{}, fmt.Errorf("Memory '%s' was not found.", memoryID)
	}
	if old.Status != "active" && old.Status != "needs_review" {
		return CorrectionResult{}, fmt.Errorf("Memory '%s' cannot be corrected from status '%s'.", memoryID, old.Status)
	}
	now := formatTime(s.now())
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CorrectionResult{}, err
	}
	defer tx.Rollback()
	old, err = scanMemory(tx.QueryRowContext(ctx, `SELECT * FROM memory_items WHERE id=?`, memoryID))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && old.WorkspaceID != workspaceID) {
		return CorrectionResult{}, fmt.Errorf("Memory '%s' was not found.", memoryID)
	}
	if err != nil {
		return CorrectionResult{}, err
	}
	if old.Status != "active" && old.Status != "needs_review" {
		return CorrectionResult{}, fmt.Errorf("Memory '%s' cannot be corrected from status '%s'.", memoryID, old.Status)
	}

	previous := old
	previous.Status, previous.UpdatedAt = "superseded", now
	if err := updateUsing(ctx, tx, previous); err != nil {
		return CorrectionResult{}, err
	}
	current := old
	newID, err := randomID()
	if err != nil {
		return CorrectionResult{}, err
	}
	current.ID, current.Title, current.Content = newID, title, content
	current.Status, current.CreatedAt, current.UpdatedAt, current.ValidFrom = "active", now, now, now
	current.ArchivedAt, current.ReviewAt = nil, nil
	if current.ExpiresAt != nil && *current.ExpiresAt <= now {
		current.ExpiresAt = nil
	}
	if err := validateMemory(current); err != nil {
		return CorrectionResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO memory_items (id, workspace_id, session_id, type, title, content, subject_key, tags_json, status, created_at, updated_at, valid_from, expires_at, review_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, memoryValues(current)...); err != nil {
		return CorrectionResult{}, err
	}
	if err := index(ctx, tx, current); err != nil {
		return CorrectionResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO memory_relations (source_memory_id, target_memory_id, relation, created_at) VALUES (?, ?, 'supersedes', ?)`, current.ID, previous.ID, now); err != nil {
		return CorrectionResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return CorrectionResult{}, err
	}
	return CorrectionResult{Previous: previous, Current: current}, nil
}

type Lifecycle struct {
	Total        int            `json:"total"`
	ByStatus     map[string]int `json:"byStatus"`
	Future       int            `json:"future"`
	Expired      int            `json:"expired"`
	DueForReview int            `json:"dueForReview"`
}

func (s *Store) InspectLifecycle(ctx context.Context, workspaceID string) (Lifecycle, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT * FROM memory_items WHERE workspace_id=?`, workspaceID)
	if err != nil {
		return Lifecycle{}, err
	}
	defer rows.Close()
	result := Lifecycle{ByStatus: map[string]int{"active": 0, "needs_review": 0, "superseded": 0, "archived": 0}}
	now := formatTime(s.now())
	for rows.Next() {
		item, err := scanMemory(rows)
		if err != nil {
			return Lifecycle{}, err
		}
		result.Total++
		result.ByStatus[item.Status]++
		if item.ValidFrom > now {
			result.Future++
		}
		if item.ExpiresAt != nil && *item.ExpiresAt <= now {
			result.Expired++
		}
		if item.ReviewAt != nil && *item.ReviewAt <= now && item.Status == "active" {
			result.DueForReview++
		}
	}
	return result, rows.Err()
}

func (s *Store) ArchiveExpired(ctx context.Context, workspaceID string) (int64, error) {
	now := formatTime(s.now())
	result, err := s.db.ExecContext(ctx, `UPDATE memory_items SET status='archived', archived_at=?, updated_at=? WHERE workspace_id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<=?`, now, now, workspaceID, now)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

type StatusTransition struct {
	Memory         Memory `json:"memory"`
	PreviousStatus string `json:"previousStatus"`
	Status         string `json:"status"`
	Reason         string `json:"reason"`
	Changed        bool   `json:"changed"`
	OccurredAt     string `json:"occurredAt"`
}

func (s *Store) Transition(ctx context.Context, memoryID, status, reason string) (StatusTransition, error) {
	item, err := s.findMemory(ctx, required(memoryID, "memoryId"))
	if errors.Is(err, sql.ErrNoRows) {
		return StatusTransition{}, fmt.Errorf("Memory '%s' was not found.", memoryID)
	}
	if err != nil {
		return StatusTransition{}, err
	}
	if !validTransition(item.Status, status) {
		if !validStatus(status) {
			return StatusTransition{}, fmt.Errorf("Unsupported memory status: '%s'.", status)
		}
		return StatusTransition{}, fmt.Errorf("Memory status cannot transition from '%s' to '%s'.", item.Status, status)
	}
	now := formatTime(s.now())
	updated := item
	updated.Status, updated.UpdatedAt = status, now
	if status == "archived" && updated.ArchivedAt == nil {
		updated.ArchivedAt = &now
	}
	if err := s.update(ctx, updated); err != nil {
		return StatusTransition{}, err
	}
	if strings.TrimSpace(reason) == "" {
		reason = fmt.Sprintf("status transition: %s -> %s", item.Status, status)
	}
	return StatusTransition{Memory: updated, PreviousStatus: item.Status, Status: status, Reason: reason, Changed: item.Status != status, OccurredAt: now}, nil
}

type ReviewCompletion struct {
	Memory           Memory  `json:"memory"`
	PreviousStatus   string  `json:"previousStatus"`
	Status           string  `json:"status"`
	PreviousReviewAt *string `json:"previousReviewAt,omitempty"`
	ReviewAt         string  `json:"reviewAt"`
	Reason           string  `json:"reason"`
	OccurredAt       string  `json:"occurredAt"`
}

func (s *Store) CompleteReview(ctx context.Context, memoryID, nextReviewAt, reason string) (ReviewCompletion, error) {
	item, err := s.findMemory(ctx, required(memoryID, "memoryId"))
	if errors.Is(err, sql.ErrNoRows) {
		return ReviewCompletion{}, fmt.Errorf("Memory '%s' was not found.", memoryID)
	}
	if err != nil {
		return ReviewCompletion{}, err
	}
	now := formatTime(s.now())
	if nextReviewAt <= now {
		return ReviewCompletion{}, errors.New("nextReviewAt must be in the future.")
	}
	if item.Status != "active" && item.Status != "needs_review" {
		return ReviewCompletion{}, fmt.Errorf("Memory '%s' cannot complete review from status '%s'.", memoryID, item.Status)
	}
	if item.ValidFrom > now || (item.ExpiresAt != nil && *item.ExpiresAt <= now) {
		return ReviewCompletion{}, fmt.Errorf("Memory '%s' is not eligible for review.", memoryID)
	}
	if item.ReviewAt == nil || *item.ReviewAt > now {
		return ReviewCompletion{}, fmt.Errorf("Memory '%s' is not due for review.", memoryID)
	}
	updated := item
	updated.Status, updated.ReviewAt, updated.UpdatedAt = "active", &nextReviewAt, now
	if err := s.update(ctx, updated); err != nil {
		return ReviewCompletion{}, err
	}
	if strings.TrimSpace(reason) == "" {
		reason = "memory review completed"
	}
	return ReviewCompletion{Memory: updated, PreviousStatus: item.Status, Status: "active", PreviousReviewAt: item.ReviewAt, ReviewAt: nextReviewAt, Reason: reason, OccurredAt: now}, nil
}

func (s *Store) ListDueForReview(ctx context.Context, workspaceID string) ([]Memory, error) {
	now := formatTime(s.now())
	rows, err := s.db.QueryContext(ctx, `SELECT * FROM memory_items WHERE workspace_id=? AND status='active' AND valid_from<=? AND (expires_at IS NULL OR expires_at>?) AND review_at IS NOT NULL AND review_at<=? ORDER BY review_at, updated_at`, workspaceID, now, now, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Memory{}
	for rows.Next() {
		item, err := scanMemory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ListExpiredIDs(ctx context.Context, workspaceID string) ([]string, error) {
	query, args := `SELECT id FROM memory_items WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=?`, []any{formatTime(s.now())}
	if workspaceID != "" {
		query += ` AND workspace_id=?`
		args = append(args, workspaceID)
	}
	query += ` ORDER BY expires_at, id`
	return s.listIDs(ctx, query, args...)
}

func (s *Store) ListArchivedIDs(ctx context.Context, before, workspaceID string) ([]string, error) {
	query, args := `SELECT id FROM memory_items WHERE status='archived' AND COALESCE(archived_at, updated_at)<?`, []any{before}
	if workspaceID != "" {
		query += ` AND workspace_id=?`
		args = append(args, workspaceID)
	}
	query += ` ORDER BY COALESCE(archived_at, updated_at), id`
	return s.listIDs(ctx, query, args...)
}

func (s *Store) PurgeArchived(ctx context.Context, before, workspaceID string) (int, error) {
	ids, err := s.ListArchivedIDs(ctx, before, workspaceID)
	if err != nil {
		return 0, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, `DELETE FROM memory_items_fts WHERE memory_id=?`, id); err != nil {
			tx.Rollback()
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM memory_relations WHERE source_memory_id=? OR target_memory_id=?`, id, id); err != nil {
			tx.Rollback()
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM memory_items WHERE id=?`, id); err != nil {
			tx.Rollback()
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(ids), nil
}

type RetentionResult struct {
	DryRun              bool     `json:"dryRun"`
	WorkspaceID         string   `json:"workspaceId,omitempty"`
	AllWorkspaces       bool     `json:"allWorkspaces"`
	ExpiredCandidateIDs []string `json:"expiredCandidateIds"`
	ArchivedCount       int64    `json:"archivedCount"`
	PurgeCandidateIDs   []string `json:"purgeCandidateIds"`
	PurgedCount         int      `json:"purgedCount"`
	Metrics             struct {
		ExpiredCandidates int   `json:"expiredCandidates"`
		Archived          int64 `json:"archived"`
		PurgeCandidates   int   `json:"purgeCandidates"`
		Purged            int   `json:"purged"`
	} `json:"metrics"`
}

func (s *Store) RunRetention(ctx context.Context, purgeBefore, workspaceID string, allWorkspaces, dryRun bool) (RetentionResult, error) {
	if (workspaceID != "") == allWorkspaces {
		return RetentionResult{}, errors.New("Retention requires workspaceId or an explicit allWorkspaces: true.")
	}
	expired, err := s.ListExpiredIDs(ctx, workspaceID)
	if err != nil {
		return RetentionResult{}, err
	}
	existing, err := s.ListArchivedIDs(ctx, purgeBefore, workspaceID)
	if err != nil {
		return RetentionResult{}, err
	}
	projected := append([]string{}, existing...)
	if purgeBefore > formatTime(s.now()) {
		projected = unique(append(projected, expired...))
	}
	result := RetentionResult{DryRun: dryRun, WorkspaceID: workspaceID, AllWorkspaces: allWorkspaces, ExpiredCandidateIDs: expired, PurgeCandidateIDs: projected}
	if dryRun {
		result.Metrics.ExpiredCandidates = len(expired)
		result.Metrics.PurgeCandidates = len(projected)
		return result, nil
	}
	archived, err := s.archiveExpiredScope(ctx, workspaceID)
	if err != nil {
		return RetentionResult{}, err
	}
	purgeCandidates, err := s.ListArchivedIDs(ctx, purgeBefore, workspaceID)
	if err != nil {
		return RetentionResult{}, err
	}
	purged, err := s.PurgeArchived(ctx, purgeBefore, workspaceID)
	if err != nil {
		return RetentionResult{}, err
	}
	result.ArchivedCount, result.PurgeCandidateIDs, result.PurgedCount = archived, purgeCandidates, purged
	result.Metrics.ExpiredCandidates, result.Metrics.Archived, result.Metrics.PurgeCandidates, result.Metrics.Purged = len(expired), archived, len(purgeCandidates), purged
	return result, nil
}

func (s *Store) archiveExpiredScope(ctx context.Context, workspaceID string) (int64, error) {
	now := formatTime(s.now())
	query, args := `UPDATE memory_items SET status='archived', archived_at=?, updated_at=? WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=?`, []any{now, now, now}
	if workspaceID != "" {
		query += ` AND workspace_id=?`
		args = append(args, workspaceID)
	}
	result, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

type CompactResult struct {
	Summary           Memory   `json:"summary"`
	ArchivedSourceIDs []string `json:"archivedSourceIds"`
	Reused            bool     `json:"reused"`
}

// ConsolidationPreview describes a compact operation without writing to the
// store. Callers must obtain this preview before asking a person to confirm a
// consolidation, particularly one that archives its sources.
type ConsolidationPreview struct {
	Title             string   `json:"title"`
	SubjectKey        string   `json:"subjectKey"`
	Content           string   `json:"content"`
	SourceIDs         []string `json:"sourceIds"`
	ArchiveSourceIDs  []string `json:"archiveSourceIds"`
	ExistingSummaryID string   `json:"existingSummaryId,omitempty"`
}

// PreviewConsolidation validates and renders the exact summary that Compact
// would create, without changing memories or relations.
func (s *Store) PreviewConsolidation(ctx context.Context, input CompactInput) (ConsolidationPreview, error) {
	if len(input.MemoryIDs) < 2 {
		return ConsolidationPreview{}, errors.New("memoryIds must contain at least two memory ids.")
	}
	if input.MaxChars < 200 || input.MaxChars > 20000 {
		return ConsolidationPreview{}, errors.New("maxChars must be an integer between 200 and 20000.")
	}
	ids := unique(input.MemoryIDs)
	if len(ids) < 2 {
		return ConsolidationPreview{}, errors.New("memoryIds must contain at least two distinct memory ids.")
	}
	sources := make([]Memory, 0, len(ids))
	for _, id := range ids {
		item, err := s.findMemory(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return ConsolidationPreview{}, fmt.Errorf("Memory '%s' was not found.", id)
		}
		if err != nil {
			return ConsolidationPreview{}, err
		}
		if item.WorkspaceID != input.WorkspaceID {
			return ConsolidationPreview{}, fmt.Errorf("Memory '%s' belongs to another workspace.", id)
		}
		if item.Status == "archived" {
			return ConsolidationPreview{}, fmt.Errorf("Memory '%s' is archived and cannot be compacted.", id)
		}
		sources = append(sources, item)
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = fmt.Sprintf("Resumen compacto (%d memorias)", len(sources))
	}
	key := strings.TrimSpace(input.SubjectKey)
	if key == "" {
		hash := sha256.Sum256([]byte(input.WorkspaceID + "\n" + title + "\n" + strings.Join(sorted(ids), ",")))
		key = fmt.Sprintf("compaction/%x", hash[:12])
	}
	preview := ConsolidationPreview{Title: title, SubjectKey: key, Content: compactContent(sources, input.MaxChars), SourceIDs: ids}
	if input.ArchiveSources {
		preview.ArchiveSourceIDs = append([]string{}, ids...)
	}
	if existing, err := s.findActiveBySubjectKey(ctx, input.WorkspaceID, key, formatTime(s.now())); err == nil {
		preview.ExistingSummaryID = existing.ID
	} else if !errors.Is(err, sql.ErrNoRows) {
		return ConsolidationPreview{}, err
	}
	return preview, nil
}

func (s *Store) Compact(ctx context.Context, input CompactInput) (CompactResult, error) {
	preview, err := s.PreviewConsolidation(ctx, input)
	if err != nil {
		return CompactResult{}, err
	}
	sources := make([]Memory, 0, len(preview.SourceIDs))
	for _, id := range preview.SourceIDs {
		item, err := s.findMemory(ctx, id)
		if err != nil {
			return CompactResult{}, err
		}
		sources = append(sources, item)
	}
	tags := append([]string{"compacted"}, input.Tags...)
	for _, source := range sources {
		tags = append(tags, source.Tags...)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CompactResult{}, err
	}
	defer tx.Rollback()
	summary, err := s.save(ctx, tx, SaveInput{ID: input.ID, WorkspaceID: input.WorkspaceID, Type: "summary", Title: preview.Title, Content: preview.Content, SubjectKey: &preview.SubjectKey, Tags: tags})
	if err != nil {
		return CompactResult{}, err
	}
	for _, source := range sources {
		if _, err := tx.ExecContext(ctx, `INSERT INTO memory_relations (source_memory_id, target_memory_id, relation, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(source_memory_id, target_memory_id, relation) DO NOTHING`, summary.ID, source.ID, "related", formatTime(s.now())); err != nil {
			return CompactResult{}, err
		}
	}
	archived := []string{}
	if input.ArchiveSources {
		now := formatTime(s.now())
		for _, source := range sources {
			if _, err := tx.ExecContext(ctx, `UPDATE memory_items SET status='archived', archived_at=COALESCE(archived_at, ?), updated_at=? WHERE id=?`, now, now, source.ID); err != nil {
				return CompactResult{}, err
			}
			archived = append(archived, source.ID)
		}
	}
	if err := tx.Commit(); err != nil {
		return CompactResult{}, err
	}
	return CompactResult{Summary: summary, ArchivedSourceIDs: archived, Reused: preview.ExistingSummaryID != ""}, nil
}

type CompactInput struct {
	ID, WorkspaceID, Title, SubjectKey string
	MemoryIDs, Tags                    []string
	MaxChars                           int
	ArchiveSources                     bool
}

func (s *Store) update(ctx context.Context, item Memory) error {
	return updateUsing(ctx, s.db, item)
}

func updateUsing(ctx context.Context, db queryExecutor, item Memory) error {
	_, err := db.ExecContext(ctx, `UPDATE memory_items SET session_id=?, type=?, title=?, content=?, subject_key=?, tags_json=?, status=?, updated_at=?, valid_from=?, expires_at=?, review_at=?, archived_at=? WHERE id=?`, updateMemoryValues(item)...)
	if err != nil {
		return err
	}
	return index(ctx, db, item)
}
func (s *Store) listIDs(ctx context.Context, query string, args ...any) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
func validStatus(status string) bool {
	return status == "active" || status == "needs_review" || status == "superseded" || status == "archived"
}
func validTransition(current, next string) bool {
	allowed := map[string]map[string]bool{"active": {"active": true, "needs_review": true, "superseded": true, "archived": true}, "needs_review": {"active": true, "needs_review": true, "superseded": true, "archived": true}, "superseded": {"superseded": true, "archived": true}, "archived": {"archived": true}}
	return allowed[current][next]
}
func unique(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}
func sorted(values []string) []string {
	result := append([]string{}, values...)
	sort.Strings(result)
	return result
}
func compactContent(sources []Memory, maxChars int) string {
	ids := make([]string, len(sources))
	for i, source := range sources {
		ids[i] = source.ID
	}
	content := fmt.Sprintf("Resumen automático de %d memorias. Fuentes: %s.", len(sources), strings.Join(ids, ", "))
	for _, source := range sources {
		line := fmt.Sprintf("- %s: %s", source.Title, source.Content)
		candidate := content + "\n" + line
		if len(candidate) <= maxChars {
			content = candidate
			continue
		}
		remaining := maxChars - len(content) - 5
		if remaining > 20 {
			content += "\n" + line[:remaining] + "…"
		}
		break
	}
	if len(content) > maxChars {
		return content[:maxChars]
	}
	return content
}

func (s *Store) findSession(ctx context.Context, id string) (Session, error) {
	var result Session
	err := s.db.QueryRowContext(ctx, `SELECT id, workspace_id, owner_id, started_at, ended_at, summary FROM sessions WHERE id=?`, id).Scan(&result.ID, &result.WorkspaceID, &result.OwnerID, &result.StartedAt, &result.EndedAt, &result.Summary)
	return result, err
}

func (s *Store) findActiveBySubjectKey(ctx context.Context, workspaceID, subjectKey, asOf string) (Memory, error) {
	return s.queryMemory(ctx, `SELECT * FROM memory_items WHERE workspace_id=? AND subject_key=? AND status='active' AND valid_from<=? AND (expires_at IS NULL OR expires_at>?) AND (review_at IS NULL OR review_at>?) LIMIT 1`, workspaceID, subjectKey, asOf, asOf, asOf)
}
func (s *Store) findMemory(ctx context.Context, id string) (Memory, error) {
	return s.queryMemory(ctx, `SELECT * FROM memory_items WHERE id=?`, id)
}
func (s *Store) queryMemory(ctx context.Context, query string, args ...any) (Memory, error) {
	return scanMemory(s.db.QueryRowContext(ctx, query, args...))
}

func (s *Store) index(ctx context.Context, item Memory) error {
	return index(ctx, s.db, item)
}

func index(ctx context.Context, db queryExecutor, item Memory) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM memory_items_fts WHERE memory_id=?`, item.ID); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, `INSERT INTO memory_items_fts (memory_id, title, content, tags, subject_key) VALUES (?, ?, ?, ?, ?)`, item.ID, item.Title, item.Content, strings.Join(item.Tags, " "), valueOrEmpty(item.SubjectKey))
	return err
}

type scanner interface{ Scan(...any) error }

func scanMemory(row scanner) (Memory, error) {
	var item Memory
	var tagsJSON string
	err := row.Scan(&item.ID, &item.WorkspaceID, &item.SessionID, &item.Type, &item.Title, &item.Content, &item.SubjectKey, &tagsJSON, &item.Status, &item.CreatedAt, &item.UpdatedAt, &item.ValidFrom, &item.ExpiresAt, &item.ReviewAt, &item.ArchivedAt)
	if err != nil {
		return Memory{}, err
	}
	if err := json.Unmarshal([]byte(tagsJSON), &item.Tags); err != nil {
		return Memory{}, err
	}
	return item, nil
}
func memoryValues(item Memory) []any {
	tags, _ := json.Marshal(item.Tags)
	return []any{item.ID, item.WorkspaceID, item.SessionID, item.Type, item.Title, item.Content, item.SubjectKey, string(tags), item.Status, item.CreatedAt, item.UpdatedAt, item.ValidFrom, item.ExpiresAt, item.ReviewAt, item.ArchivedAt}
}
func updateMemoryValues(item Memory) []any {
	tags, _ := json.Marshal(item.Tags)
	return []any{
		item.SessionID,
		item.Type,
		item.Title,
		item.Content,
		item.SubjectKey,
		string(tags),
		item.Status,
		item.UpdatedAt,
		item.ValidFrom,
		item.ExpiresAt,
		item.ReviewAt,
		item.ArchivedAt,
		item.ID,
	}
}
func formatTime(value time.Time) string { return value.UTC().Format(timestampLayout) }
func randomID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}
func required(value, name string) string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		panic(fmt.Sprintf("%s is required.", name))
	}
	return normalized
}
func trimmedPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func normalizeTags(tags []string) []string {
	set := map[string]struct{}{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag != "" {
			set[tag] = struct{}{}
		}
	}
	result := make([]string, 0, len(set))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if _, ok := set[tag]; ok {
			result = append(result, tag)
			delete(set, tag)
		}
	}
	return result
}
func validateMemory(item Memory) error {
	if item.Type != "decision" && item.Type != "discovery" && item.Type != "pattern" && item.Type != "preference" && item.Type != "summary" {
		return fmt.Errorf("Unsupported memory item type: '%s'.", item.Type)
	}
	if item.Status != "active" && item.Status != "needs_review" && item.Status != "superseded" && item.Status != "archived" {
		return fmt.Errorf("Unsupported memory status: '%s'.", item.Status)
	}
	if item.ExpiresAt != nil && *item.ExpiresAt <= item.ValidFrom {
		return errors.New("expiresAt must be after validFrom.")
	}
	if item.ReviewAt != nil && *item.ReviewAt < item.ValidFrom {
		return errors.New("reviewAt must be on or after validFrom.")
	}
	return nil
}
func hasSensitiveContent(value string) bool {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----`),
		regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`),
		regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`),
		regexp.MustCompile(`(?i)\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{20,}`),
	}
	for _, pattern := range patterns {
		if pattern.MatchString(value) {
			return true
		}
	}
	return false
}
func toFTSQuery(query string) string {
	synonyms := map[string][]string{
		"autenticacion":  {"autenticación", "autenticacion", "authentication", "auth", "autenticada", "autenticadas"},
		"autenticación":  {"autenticación", "autenticacion", "authentication", "auth", "autenticada", "autenticadas"},
		"authentication": {"autenticación", "autenticacion", "authentication", "auth", "autenticada", "autenticadas"},
		"auth":           {"autenticación", "autenticacion", "authentication", "auth", "autenticada", "autenticadas"},
		"proteccion":     {"protección", "proteccion", "proteger", "protege", "protegen", "protegida", "protegidas"},
		"protección":     {"protección", "proteccion", "proteger", "protege", "protegen", "protegida", "protegidas"},
		"despliegue":     {"despliegue", "despliegues", "deployment", "deploy"},
		"deployment":     {"despliegue", "despliegues", "deployment", "deploy"},
		"rollback":       {"rollback", "reversion", "reversión", "revertir"},
	}
	terms := []string{}
	for _, term := range strings.Fields(strings.ToLower(query)) {
		term = strings.Trim(term, `"'()`)
		if term == "" {
			continue
		}
		variants := append([]string{term, singular(term)}, synonyms[term]...)
		variants = unique(variants)
		quoted := make([]string, len(variants))
		for index, variant := range variants {
			quoted[index] = `"` + strings.ReplaceAll(variant, `"`, `""`) + `"`
		}
		if len(quoted) == 1 {
			terms = append(terms, quoted[0])
		} else {
			terms = append(terms, "("+strings.Join(quoted, " OR ")+")")
		}
	}
	return strings.Join(terms, " AND ")
}
func singular(term string) string {
	if len(term) > 5 && strings.HasSuffix(term, "es") {
		return term[:len(term)-2]
	}
	if len(term) > 4 && strings.HasSuffix(term, "s") {
		return term[:len(term)-1]
	}
	return term
}
