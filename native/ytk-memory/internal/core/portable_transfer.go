package core

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"
)

type PortablePreviewEntry struct {
	SourceID string `json:"sourceId"`
	Status   string `json:"status"`
	Reason   string `json:"reason,omitempty"`
}
type PortablePreview struct {
	ProjectID string                 `json:"projectId"`
	Area      string                 `json:"area,omitempty"`
	Entries   []PortablePreviewEntry `json:"entries"`
	Relations int                    `json:"relations"`
	Token     string                 `json:"token"`
}
type PortableImportResult struct {
	Inserted  int `json:"inserted"`
	Unchanged int `json:"unchanged"`
	Relations int `json:"relations"`
}

func portableHash(v any) string {
	data, _ := json.Marshal(v)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func portableDataHash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func portableNamespace(ctx context.Context, tx *sql.Tx, project string) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, `SELECT namespace FROM portable_namespaces WHERE workspace_id=?`, project).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	raw, err := randomID()
	if err != nil {
		return "", err
	}
	id = raw[:8] + "-" + raw[8:12] + "-4" + raw[13:16] + "-a" + raw[17:20] + "-" + raw[20:]
	_, err = tx.ExecContext(ctx, `INSERT INTO portable_namespaces(workspace_id,namespace) VALUES (?,?)`, project, id)
	return id, err
}
func portableVisible(m Memory, area, now string) bool {
	return m.Status == "active" && m.ValidFrom <= now && (m.ExpiresAt == nil || *m.ExpiresAt > now) && (m.ReviewAt == nil || *m.ReviewAt > now) && (area == "" || memoryArea(m.Tags) == "" || memoryArea(m.Tags) == area)
}
func portableFromMemory(m Memory) PortableMemory {
	return PortableMemory{ID: m.ID, Type: m.Type, Title: m.Title, Content: m.Content, SubjectKey: m.SubjectKey, Tags: m.Tags, CreatedAt: m.CreatedAt, UpdatedAt: m.UpdatedAt, ValidFrom: portableCanonicalTime(m.ValidFrom), ExpiresAt: portableCanonicalOptional(m.ExpiresAt), ReviewAt: portableCanonicalOptional(m.ReviewAt)}
}

// ExportPortable exports an explicit selection from one consistent snapshot.
func (s *Store) ExportPortable(ctx context.Context, project, area string, ids []string) ([]byte, error) {
	if strings.TrimSpace(project) == "" || len(ids) == 0 || len(ids) > PortableMaxMemories {
		return nil, errors.New("invalid project or selection")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	ns, err := portableNamespace(ctx, tx, project)
	if err != nil {
		return nil, err
	}
	now := formatTime(s.now())
	doc := PortableDocument{Format: "ytk-memory-export", Version: 1, ExportedAt: now, Source: PortableSource{Namespace: ns}, Memories: []PortableMemory{}, Relations: []PortableRelation{}}
	selected := map[string]bool{}
	for _, id := range ids {
		if selected[id] || !portableText(id, 200) {
			return nil, errors.New("invalid or duplicate selection")
		}
		item, e := scanMemory(tx.QueryRowContext(ctx, `SELECT * FROM memory_items WHERE id=? AND workspace_id=?`, id, project))
		if errors.Is(e, sql.ErrNoRows) {
			return nil, errors.New("memory not found")
		}
		if e != nil {
			return nil, e
		}
		if !portableVisible(item, area, now) {
			return nil, errors.New("memory not found")
		}
		selected[id] = true
		doc.Memories = append(doc.Memories, portableFromMemory(item))
	}
	sort.Slice(doc.Memories, func(i, j int) bool { return doc.Memories[i].ID < doc.Memories[j].ID })
	rows, err := tx.QueryContext(ctx, `SELECT r.source_memory_id,r.target_memory_id,r.relation FROM memory_relations r JOIN memory_items m ON m.id=r.source_memory_id WHERE m.workspace_id=? ORDER BY r.source_memory_id,r.target_memory_id,r.relation`, project)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r PortableRelation
		if err = rows.Scan(&r.SourceID, &r.TargetID, &r.Relation); err != nil {
			rows.Close()
			return nil, err
		}
		if selected[r.SourceID] && selected[r.TargetID] {
			doc.Relations = append(doc.Relations, r)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	if _, err = ParsePortable(data); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return data, nil
}
func (s *Store) PreviewPortable(ctx context.Context, project, area string, data []byte) (PortablePreview, error) {
	doc, err := ParsePortable(data)
	if err != nil {
		return PortablePreview{}, err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return PortablePreview{}, err
	}
	defer tx.Rollback()
	p, err := s.portablePlan(ctx, tx, project, area, data, doc)
	if err != nil {
		return p, err
	}
	if err = tx.Commit(); err != nil {
		return PortablePreview{}, err
	}
	return p, nil
}
func (s *Store) portablePlan(ctx context.Context, tx *sql.Tx, project, area string, data []byte, doc PortableDocument) (PortablePreview, error) {
	p := PortablePreview{ProjectID: project, Area: area, Entries: []PortablePreviewEntry{}, Relations: len(doc.Relations)}
	if strings.TrimSpace(project) == "" {
		return p, errors.New("project required")
	}
	now := formatTime(s.now())
	var ownNamespace string
	nsErr := tx.QueryRowContext(ctx, `SELECT namespace FROM portable_namespaces WHERE workspace_id=?`, project).Scan(&ownNamespace)
	if nsErr != nil && !errors.Is(nsErr, sql.ErrNoRows) {
		return p, nsErr
	}
	state := []any{}
	rows, err := tx.QueryContext(ctx, `SELECT * FROM memory_items WHERE workspace_id=? ORDER BY id`, project)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		m, e := scanMemory(rows)
		if e != nil {
			rows.Close()
			return p, e
		}
		state = append(state, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	var imports []string
	rows, err = tx.QueryContext(ctx, `SELECT source_namespace,source_id,local_id,source_digest,local_digest FROM portable_imports WHERE workspace_id=? ORDER BY source_namespace,source_id`, project)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var a, b, c, d, e string
		if err = rows.Scan(&a, &b, &c, &d, &e); err != nil {
			rows.Close()
			return p, err
		}
		imports = append(imports, portableHash([]string{a, b, c, d, e}))
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	// Include relations in the token, so an intervening relation edit invalidates it.
	var relations []string
	rows, err = tx.QueryContext(ctx, `SELECT r.source_memory_id,r.target_memory_id,r.relation,r.created_at FROM memory_relations r JOIN memory_items m ON m.id=r.source_memory_id WHERE m.workspace_id=? ORDER BY 1,2,3`, project)
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var a, b, c, d string
		if err = rows.Scan(&a, &b, &c, &d); err != nil {
			rows.Close()
			return p, err
		}
		relations = append(relations, portableHash([]string{a, b, c, d}))
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	for _, m := range doc.Memories {
		entry := PortablePreviewEntry{SourceID: m.ID, Status: "new"}
		if ownNamespace != "" && ownNamespace == doc.Source.Namespace {
			entry.Status = "blocked"
			entry.Reason = "source and destination share an identity"
		}
		valid, _ := time.Parse(time.RFC3339Nano, m.ValidFrom)
		current := s.now()
		if valid.After(current) || (m.ExpiresAt != nil && !portableAfter(portableCanonicalTime(*m.ExpiresAt), current)) || (m.ReviewAt != nil && !portableAfter(portableCanonicalTime(*m.ReviewAt), current)) {
			entry.Status = "blocked"
			entry.Reason = "memory is not currently eligible"
		}
		if a := memoryArea(m.Tags); area != "" && a != "" && a != area {
			entry.Status = "blocked"
			entry.Reason = "memory is outside destination area"
		}
		var localID, sourceDigest, localDigest string
		e := tx.QueryRowContext(ctx, `SELECT local_id,source_digest,local_digest FROM portable_imports WHERE workspace_id=? AND source_namespace=? AND source_id=?`, project, doc.Source.Namespace, m.ID).Scan(&localID, &sourceDigest, &localDigest)
		if e != nil && !errors.Is(e, sql.ErrNoRows) {
			return p, e
		}
		if e == nil {
			local, le := scanMemory(tx.QueryRowContext(ctx, `SELECT * FROM memory_items WHERE id=? AND workspace_id=?`, localID, project))
			if le != nil && !errors.Is(le, sql.ErrNoRows) {
				return p, le
			}
			if le != nil || !portableVisible(local, area, now) || sourceDigest != portableHash(m) || localDigest != portableHash(local) {
				entry.Status = "blocked"
				entry.Reason = "existing import changed or is unavailable"
			} else if entry.Status != "blocked" {
				entry.Status = "unchanged"
			}
		}
		if entry.Status == "new" && m.SubjectKey != nil {
			var n int
			if err = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM memory_items WHERE workspace_id=? AND status='active' AND subject_key=?`, project, *m.SubjectKey).Scan(&n); err != nil {
				return p, err
			}
			if n > 0 {
				entry.Status = "blocked"
				entry.Reason = "destination conflict"
			}
		}
		p.Entries = append(p.Entries, entry)
	}
	p.Token = portableHash([]any{"ytk-portable-preview-v1", project, area, portableDataHash(data), state, imports, relations, p.Entries})
	return p, nil
}
func portableAfter(v string, now time.Time) bool {
	t, e := time.Parse(time.RFC3339Nano, v)
	return e == nil && t.After(now)
}
func (s *Store) ImportPortable(ctx context.Context, project, area string, data []byte, token string) (PortableImportResult, error) {
	result := PortableImportResult{}
	if len(token) != 64 {
		return result, errors.New("reviewed preview token is required")
	}
	doc, err := ParsePortable(data)
	if err != nil {
		return result, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	plan, err := s.portablePlan(ctx, tx, project, area, data, doc)
	if err != nil {
		return result, err
	}
	if plan.Token != token {
		return result, errors.New("preview is stale; review again")
	}
	for _, e := range plan.Entries {
		if e.Status == "blocked" {
			return result, errors.New("preview contains blocked entries")
		}
	}
	ids := map[string]string{}
	now := formatTime(s.now())
	for i, m := range doc.Memories {
		if plan.Entries[i].Status == "unchanged" {
			var id string
			if err = tx.QueryRowContext(ctx, `SELECT local_id FROM portable_imports WHERE workspace_id=? AND source_namespace=? AND source_id=?`, project, doc.Source.Namespace, m.ID).Scan(&id); err != nil {
				return result, err
			}
			ids[m.ID] = id
			result.Unchanged++
			continue
		}
		id, e := randomID()
		if e != nil {
			return result, e
		}
		item := Memory{ID: id, WorkspaceID: project, Type: m.Type, Title: m.Title, Content: m.Content, SubjectKey: m.SubjectKey, Tags: normalizeTags(m.Tags), Status: "active", CreatedAt: now, UpdatedAt: now, ValidFrom: portableCanonicalTime(m.ValidFrom), ExpiresAt: portableCanonicalOptional(m.ExpiresAt), ReviewAt: portableCanonicalOptional(m.ReviewAt)}
		if hasSensitiveContent(item.Title + "\n" + item.Content) {
			return result, errors.New("sensitive content detected")
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO memory_items (id,workspace_id,session_id,type,title,content,subject_key,tags_json,status,created_at,updated_at,valid_from,expires_at,review_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, memoryValues(item)...); err != nil {
			return result, err
		}
		if err = index(ctx, tx, item); err != nil {
			return result, err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO portable_imports(workspace_id,source_namespace,source_id,local_id,source_digest,local_digest) VALUES(?,?,?,?,?,?)`, project, doc.Source.Namespace, m.ID, id, portableHash(m), portableHash(item)); err != nil {
			return result, err
		}
		ids[m.ID] = id
		result.Inserted++
	}
	for _, r := range doc.Relations {
		res, e := tx.ExecContext(ctx, `INSERT INTO memory_relations(source_memory_id,target_memory_id,relation,created_at) VALUES(?,?,?,?) ON CONFLICT(source_memory_id,target_memory_id,relation) DO NOTHING`, ids[r.SourceID], ids[r.TargetID], r.Relation, now)
		if e != nil {
			return result, e
		}
		n, e := res.RowsAffected()
		if e != nil {
			return result, e
		}
		result.Relations += int(n)
	}
	if err = tx.Commit(); err != nil {
		return PortableImportResult{}, err
	}
	return result, nil
}

func portableCanonicalTime(v string) string {
	t, _ := time.Parse(time.RFC3339Nano, v)
	return formatTime(t)
}
func portableCanonicalOptional(v *string) *string {
	if v == nil {
		return nil
	}
	result := portableCanonicalTime(*v)
	return &result
}
