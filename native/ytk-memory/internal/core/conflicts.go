package core

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"unicode"
)

// ConflictCandidate identifies a related memory, not a confirmed contradiction.
type ConflictCandidate struct {
	ID        string           `json:"id"`
	Title     string           `json:"title"`
	Content   string           `json:"content"`
	UpdatedAt string           `json:"updatedAt"`
	Reasons   []ConflictReason `json:"reasons"`
}
type ConflictReason struct {
	Code     string `json:"code"`
	Evidence string `json:"evidence"`
}
type ConflictBase struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt"`
}
type ConflictResult struct {
	Base               ConflictBase        `json:"base"`
	Candidates         []ConflictCandidate `json:"candidates"`
	Truncated          bool                `json:"truncated"`
	ExplorationLimited bool                `json:"explorationLimited"`
}

// ConflictCandidates takes a consistent read snapshot and never mutates memory.
func (s *Store) ConflictCandidates(ctx context.Context, workspace, area, id string, limit, maxChars int) (ConflictResult, error) {
	result := ConflictResult{Candidates: []ConflictCandidate{}}
	if strings.TrimSpace(id) == "" || len([]rune(id)) > 200 {
		return result, errors.New("invalid memoryId")
	}
	if limit < 1 || limit > 50 {
		return result, errors.New("limit must be between 1 and 50")
	}
	if maxChars < 100 || maxChars > 20000 {
		return result, errors.New("maxChars must be between 100 and 20000")
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	now := formatTime(s.now())
	base, err := scanMemory(tx.QueryRowContext(ctx, `SELECT * FROM memory_items WHERE id=? AND workspace_id=? AND status='active' AND valid_from<=? AND (expires_at IS NULL OR expires_at>?) AND (review_at IS NULL OR review_at>?)`, id, workspace, now, now, now))
	if errors.Is(err, sql.ErrNoRows) {
		return result, errors.New("memory not found")
	}
	if err != nil {
		return result, err
	}
	if a := memoryArea(base.Tags); area != "" && a != "" && a != area {
		return result, errors.New("memory not found")
	}
	result.Base = ConflictBase{ID: base.ID, Title: base.Title, Content: base.Content, UpdatedAt: base.UpdatedAt}
	terms := conflictTerms(base.Title + " " + base.Content)
	if len(terms) > 0 {
		parts := make([]string, len(terms))
		for i, t := range terms {
			parts[i] = `"` + strings.ReplaceAll(t, `"`, `""`) + `"`
		}
		// Area filtering happens before the exploration limit; first area tag matches memoryArea.
		rows, e := tx.QueryContext(ctx, `SELECT memory_items.* FROM memory_items_fts JOIN memory_items ON memory_items.id=memory_items_fts.memory_id WHERE memory_items.workspace_id=? AND memory_items.id<>? AND memory_items.status='active' AND memory_items.valid_from<=? AND (memory_items.expires_at IS NULL OR memory_items.expires_at>?) AND (memory_items.review_at IS NULL OR memory_items.review_at>?) AND (?='' OR COALESCE((SELECT substr(value,6) FROM json_each(memory_items.tags_json) WHERE substr(value,1,5)='area:' LIMIT 1),'') IN ('',?)) AND NOT EXISTS (SELECT 1 FROM memory_relations r WHERE r.relation='supersedes' AND ((r.source_memory_id=? AND r.target_memory_id=memory_items.id) OR (r.target_memory_id=? AND r.source_memory_id=memory_items.id))) AND memory_items_fts MATCH ? ORDER BY bm25(memory_items_fts), memory_items.updated_at DESC, memory_items.id ASC LIMIT 201`, workspace, id, now, now, now, area, area, id, id, strings.Join(parts, " OR "))
		if e != nil {
			return result, e
		}
		examined := 0
		for rows.Next() {
			examined++
			if examined > 200 {
				result.ExplorationLimited = true
				break
			}
			item, e := scanMemory(rows)
			if e != nil {
				rows.Close()
				return result, e
			}
			shared := sharedConflictTerms(terms, item.Title+" "+item.Content)
			if len(shared) > 0 {
				result.Candidates = append(result.Candidates, ConflictCandidate{ID: item.ID, Title: item.Title, Content: item.Content, UpdatedAt: item.UpdatedAt, Reasons: []ConflictReason{{Code: "shared_terms", Evidence: strings.Join(shared, ", ")}}})
			}
		}
		if e = rows.Err(); e != nil {
			rows.Close()
			return result, e
		}
		rows.Close()
		sort.Slice(result.Candidates, func(i, j int) bool {
			a, b := result.Candidates[i], result.Candidates[j]
			ai, bi := strings.Count(a.Reasons[0].Evidence, ", "), strings.Count(b.Reasons[0].Evidence, ", ")
			if ai != bi {
				return ai > bi
			}
			if a.UpdatedAt != b.UpdatedAt {
				return a.UpdatedAt > b.UpdatedAt
			}
			return a.ID < b.ID
		})
		if len(result.Candidates) > limit {
			result.Candidates = result.Candidates[:limit]
			result.Truncated = true
		}
	}
	remaining := maxChars
	trim := func(v *string) {
		r := []rune(*v)
		if len(r) > remaining {
			*v = string(r[:remaining])
			result.Truncated = true
			remaining = 0
		} else {
			remaining -= len(r)
		}
	}
	trim(&result.Base.Title)
	trim(&result.Base.Content)
	for i := range result.Candidates {
		trim(&result.Candidates[i].Title)
		trim(&result.Candidates[i].Content)
		for j := range result.Candidates[i].Reasons {
			trim(&result.Candidates[i].Reasons[j].Evidence)
		}
	}
	if err = tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}
func conflictTerms(text string) []string {
	stop := map[string]bool{"para": true, "with": true, "from": true, "this": true, "that": true, "have": true, "como": true, "esta": true, "este": true, "the": true, "and": true, "una": true, "del": true, "los": true, "las": true, "que": true, "por": true, "not": true, "sin": true}
	seen := map[string]bool{}
	out := []string{}
	for _, t := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		if len([]rune(t)) < 3 || stop[t] || seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
		if len(out) == 16 {
			break
		}
	}
	return out
}
func sharedConflictTerms(base []string, text string) []string {
	set := map[string]bool{}
	for _, t := range conflictTermsAll(text) {
		set[t] = true
	}
	out := []string{}
	for _, t := range base {
		if set[t] {
			out = append(out, t)
		}
	}
	return out
}
func conflictTermsAll(text string) []string {
	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) })
}
