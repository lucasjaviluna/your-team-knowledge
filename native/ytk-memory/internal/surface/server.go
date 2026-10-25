package surface

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Config struct{ ProjectID, Area string }
type Service struct {
	Store                    *core.Store
	ProjectID, Area, OwnerID string
}

func NewService(store *core.Store, config Config) *Service {
	owner := make([]byte, 16)
	_, _ = rand.Read(owner)
	return &Service{Store: store, ProjectID: config.ProjectID, Area: config.Area, OwnerID: hex.EncodeToString(owner)}
}

func (s *Service) Server() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "ytk-memory", Version: "0.1.0"}, nil)
	add := func(name, description string, readonly bool) *mcp.Tool {
		return &mcp.Tool{Name: name, Description: description, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: readonly, DestructiveHint: boolPtr(false)}}
	}
	mcp.AddTool(server, add("memory_session_start", "Start a project-scoped session and return compact context or query matches.", false), s.start)
	mcp.AddTool(server, add("memory_search", "Search reusable memory in the configured project.", true), s.search)
	mcp.AddTool(server, add("memory_get", "Read one memory from the configured project.", true), s.get)
	mcp.AddTool(server, add("memory_save", "Create or update durable project memory.", false), s.save)
	mcp.AddTool(server, add("memory_session_finish", "Finish a project-scoped session and optionally save its summary.", false), s.finish)
	mcp.AddTool(server, add("memory_review_list", "List project memories that are due for review.", true), s.reviewList)
	mcp.AddTool(server, add("memory_review_complete", "Complete a due memory review and schedule its next review.", false), s.reviewComplete)
	mcp.AddTool(server, add("memory_correct", "Correct a memory while preserving and linking its previous version.", false), s.correct)
	mcp.AddTool(server, add("memory_relations", "Inspect related memories and their version links in this project.", true), s.relations)
	return server
}

type startInput struct {
	Query    string `json:"query,omitempty"`
	Limit    int    `json:"limit,omitempty"`
	MaxChars int    `json:"maxChars,omitempty"`
}
type searchInput struct {
	Query    string `json:"query"`
	Limit    int    `json:"limit,omitempty"`
	MaxChars int    `json:"maxChars,omitempty"`
}
type getInput struct {
	MemoryID string `json:"memoryId"`
	MaxChars int    `json:"maxChars,omitempty"`
}
type saveInput struct {
	Type       string   `json:"type"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	SubjectKey string   `json:"subjectKey,omitempty"`
	Tags       []string `json:"tags,omitempty"`
	Source     string   `json:"source,omitempty"`
	SessionID  string   `json:"sessionId,omitempty"`
}
type finishInput struct {
	SessionID string `json:"sessionId"`
	Summary   string `json:"summary,omitempty"`
}
type reviewListInput struct {
	Limit    int `json:"limit,omitempty"`
	MaxChars int `json:"maxChars,omitempty"`
}
type reviewCompleteInput struct {
	MemoryID     string `json:"memoryId"`
	NextReviewAt string `json:"nextReviewAt"`
	Reason       string `json:"reason,omitempty"`
}
type correctInput struct {
	MemoryID string `json:"memoryId"`
	Title    string `json:"title,omitempty"`
	Content  string `json:"content,omitempty"`
}
type relationsInput struct {
	MemoryID string `json:"memoryId"`
	Limit    int    `json:"limit,omitempty"`
	MaxChars int    `json:"maxChars,omitempty"`
}
type entry struct {
	ID         string   `json:"id"`
	ProjectID  string   `json:"projectId"`
	Type       string   `json:"type"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	SubjectKey *string  `json:"subjectKey,omitempty"`
	Source     string   `json:"source"`
	Area       string   `json:"area,omitempty"`
	Tags       []string `json:"tags"`
	Status     string   `json:"status"`
	ReviewAt   *string  `json:"reviewAt,omitempty"`
	ExpiresAt  *string  `json:"expiresAt,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
}

func toolResult(value map[string]any, err error) (*mcp.CallToolResult, map[string]any, error) {
	if err != nil {
		return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: err.Error()}}}, nil, nil
	}
	data, _ := json.Marshal(value)
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(data)}}}, value, nil
}
func (s *Service) start(ctx context.Context, _ *mcp.CallToolRequest, in startInput) (*mcp.CallToolResult, map[string]any, error) {
	in.Query = strings.TrimSpace(in.Query)
	if err := validate(in.Query, 2000, false); err != nil {
		return toolResult(nil, err)
	}
	entries := []entry{}
	if strings.TrimSpace(in.Query) != "" {
		found, e := s.find(ctx, in.Query, in.Limit, in.MaxChars)
		if e != nil {
			return toolResult(nil, e)
		}
		entries = found
	} else {
		limit, maxChars := in.Limit, in.MaxChars
		if limit == 0 {
			limit = 8
		}
		if limit < 1 || limit > 100 {
			return toolResult(nil, errors.New("limit must be between 1 and 100."))
		}
		if maxChars == 0 {
			maxChars = 2400
		}
		if maxChars < 100 || maxChars > 20000 {
			return toolResult(nil, errors.New("maxChars must be between 100 and 20000."))
		}
		found, e := s.Store.Context(ctx, s.ProjectID, 100)
		if e != nil {
			return toolResult(nil, e)
		}
		entries = s.contextEntries(found, limit, maxChars)
	}
	session, err := s.Store.StartSession(ctx, newID(), s.ProjectID, &s.OwnerID)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"sessionId": session.ID, "entries": entries}, nil)
}

func (s *Service) contextEntries(items []core.Memory, limit, maxChars int) []entry {
	out := []entry{}
	used := 0
	for _, item := range items {
		area := tagValue(item.Tags, "area")
		if s.Area != "" && area != "" && area != s.Area {
			continue
		}
		title := item.Title
		content := item.Content
		remaining := maxChars - used
		if remaining <= 0 {
			break
		}
		// Count title and content together so the complete briefing stays within
		// the caller's character budget, including Unicode text.
		if len([]rune(title))+len([]rune(content)) > remaining {
			titleRunes := []rune(title)
			contentRunes := []rune(content)
			if len(titleRunes) >= remaining {
				title = string(titleRunes[:remaining])
				content = ""
			} else {
				title = string(titleRunes)
				content = string(contentRunes[:remaining-len(titleRunes)])
			}
		}
		source := tagValue(item.Tags, "source")
		if source == "" {
			source = "agent-memory:sqlite"
		}
		if area == "" {
			area = s.Area
		}
		out = append(out, memoryEntry(item, title, content, source, area))
		used += len([]rune(title)) + len([]rune(content))
		if used >= maxChars || len(out) == limit {
			break
		}
	}
	return out
}
func (s *Service) search(ctx context.Context, _ *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, map[string]any, error) {
	found, err := s.find(ctx, in.Query, in.Limit, in.MaxChars)
	return toolResult(map[string]any{"entries": found}, err)
}
func (s *Service) find(ctx context.Context, query string, limit, maxChars int) ([]entry, error) {
	query = strings.TrimSpace(query)
	if err := validate(query, 2000, true); err != nil {
		return nil, err
	}
	if limit == 0 {
		limit = 20
	}
	if limit < 1 || limit > 100 {
		return nil, errors.New("limit must be between 1 and 100.")
	}
	if maxChars == 0 {
		maxChars = 4000
	}
	if maxChars < 100 || maxChars > 20000 {
		return nil, errors.New("maxChars must be between 100 and 20000.")
	}
	items, err := s.Store.Search(ctx, s.ProjectID, query, 100)
	if err != nil {
		return nil, err
	}
	out := []entry{}
	for _, item := range items {
		area := tagValue(item.Tags, "area")
		if s.Area != "" && area != "" && area != s.Area {
			continue
		}
		content := item.Content
		if len([]rune(content)) > maxChars {
			content = string([]rune(content)[:maxChars]) + "…"
		}
		source := tagValue(item.Tags, "source")
		if source == "" {
			source = "agent-memory:sqlite"
		}
		if area == "" {
			area = s.Area
		}
		out = append(out, memoryEntry(item, item.Title, content, source, area))
		if len(out) == limit {
			break
		}
	}
	return out, nil
}
func (s *Service) get(ctx context.Context, _ *mcp.CallToolRequest, in getInput) (*mcp.CallToolResult, map[string]any, error) {
	in.MemoryID = strings.TrimSpace(in.MemoryID)
	if err := validate(in.MemoryID, 200, true); err != nil {
		return toolResult(nil, err)
	}
	max := in.MaxChars
	if max == 0 {
		max = 20000
	}
	if max < 100 || max > 20000 {
		return toolResult(nil, errors.New("maxChars must be between 100 and 20000."))
	}
	item, ok, err := s.Store.Get(ctx, in.MemoryID, s.ProjectID)
	if err != nil {
		return toolResult(nil, err)
	}
	if !ok {
		return toolResult(nil, errors.New("Memory was not found in this project."))
	}
	area := tagValue(item.Tags, "area")
	if s.Area != "" && area != "" && area != s.Area {
		return toolResult(nil, errors.New("Memory was not found in this project."))
	}
	content := item.Content
	if len([]rune(content)) > max {
		content = string([]rune(content)[:max]) + "…"
	}
	source := tagValue(item.Tags, "source")
	if source == "" {
		source = "agent-memory:sqlite"
	}
	if area == "" {
		area = s.Area
	}
	return toolResult(map[string]any{"entry": memoryEntry(item, item.Title, content, source, area)}, nil)
}
func (s *Service) save(ctx context.Context, _ *mcp.CallToolRequest, in saveInput) (*mcp.CallToolResult, map[string]any, error) {
	in.Title, in.Content = strings.TrimSpace(in.Title), strings.TrimSpace(in.Content)
	in.SubjectKey, in.Source, in.SessionID = strings.TrimSpace(in.SubjectKey), strings.TrimSpace(in.Source), strings.TrimSpace(in.SessionID)
	if err := validate(in.Type, 20, true); err != nil {
		return toolResult(nil, err)
	}
	if err := validate(in.Title, 500, true); err != nil {
		return toolResult(nil, err)
	}
	if err := validate(in.Content, 50000, true); err != nil {
		return toolResult(nil, err)
	}
	if in.Type != "decision" && in.Type != "discovery" && in.Type != "pattern" && in.Type != "preference" && in.Type != "summary" {
		return toolResult(nil, errors.New("Unsupported memory item type."))
	}
	if len([]rune(in.SubjectKey)) > 500 || len([]rune(in.Source)) > 200 || len(in.Tags) > 50 || len([]rune(in.SessionID)) > 200 {
		return toolResult(nil, errors.New("A memory field exceeds its maximum length."))
	}
	tags := append([]string{}, in.Tags...)
	for index := range tags {
		tags[index] = strings.TrimSpace(tags[index])
		if tags[index] == "" || len([]rune(tags[index])) > 100 {
			return toolResult(nil, errors.New("Each tag must contain between 1 and 100 characters."))
		}
	}
	source := in.Source
	if source == "" {
		source = "agent-memory:sqlite"
	}
	tags = append(tags, "source:"+source)
	if s.Area != "" {
		tags = append(tags, "area:"+s.Area)
	}
	var subject, session *string
	if in.SubjectKey != "" {
		subject = &in.SubjectKey
	}
	if in.SessionID != "" {
		session = &in.SessionID
	}
	owner := (*string)(nil)
	if session != nil {
		owner = &s.OwnerID
	}
	item, err := s.Store.Save(ctx, core.SaveInput{ID: newID(), WorkspaceID: s.ProjectID, Type: in.Type, Title: in.Title, Content: in.Content, SubjectKey: subject, SessionID: session, OwnerID: owner, Tags: tags})
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"stored": true, "entryId": item.ID}, nil)
}
func (s *Service) finish(ctx context.Context, _ *mcp.CallToolRequest, in finishInput) (*mcp.CallToolResult, map[string]any, error) {
	in.SessionID, in.Summary = strings.TrimSpace(in.SessionID), strings.TrimSpace(in.Summary)
	if err := validate(in.SessionID, 200, true); err != nil {
		return toolResult(nil, err)
	}
	if len([]rune(in.Summary)) > 50000 {
		return toolResult(nil, errors.New("summary exceeds the maximum length."))
	}
	var summary *string
	if strings.TrimSpace(in.Summary) != "" {
		summary = &in.Summary
	}
	session, err := s.Store.EndOwnedSession(ctx, in.SessionID, s.ProjectID, s.OwnerID, summary)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"sessionId": session.ID, "summaryStored": summary != nil}, nil)
}

func (s *Service) reviewList(ctx context.Context, _ *mcp.CallToolRequest, in reviewListInput) (*mcp.CallToolResult, map[string]any, error) {
	limit, maxChars := in.Limit, in.MaxChars
	if limit == 0 {
		limit = 20
	}
	if limit < 1 || limit > 100 {
		return toolResult(nil, errors.New("limit must be between 1 and 100."))
	}
	if maxChars == 0 {
		maxChars = 4000
	}
	if maxChars < 100 || maxChars > 20000 {
		return toolResult(nil, errors.New("maxChars must be between 100 and 20000."))
	}
	items, err := s.Store.ListDueForReview(ctx, s.ProjectID)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"entries": s.contextEntries(items, limit, maxChars)}, nil)
}

func (s *Service) reviewComplete(ctx context.Context, _ *mcp.CallToolRequest, in reviewCompleteInput) (*mcp.CallToolResult, map[string]any, error) {
	in.MemoryID, in.NextReviewAt, in.Reason = strings.TrimSpace(in.MemoryID), strings.TrimSpace(in.NextReviewAt), strings.TrimSpace(in.Reason)
	if err := validate(in.MemoryID, 200, true); err != nil {
		return toolResult(nil, err)
	}
	if err := validate(in.NextReviewAt, 100, true); err != nil {
		return toolResult(nil, err)
	}
	if len([]rune(in.Reason)) > 2000 {
		return toolResult(nil, errors.New("reason exceeds the maximum length."))
	}
	next, err := time.Parse(time.RFC3339Nano, in.NextReviewAt)
	if err != nil {
		return toolResult(nil, errors.New("nextReviewAt must be an RFC3339 timestamp."))
	}
	item, ok, err := s.Store.Get(ctx, in.MemoryID, s.ProjectID)
	if err != nil {
		return toolResult(nil, err)
	}
	if !ok || (s.Area != "" && tagValue(item.Tags, "area") != "" && tagValue(item.Tags, "area") != s.Area) {
		return toolResult(nil, errors.New("Memory was not found in this project."))
	}
	result, err := s.Store.CompleteReview(ctx, in.MemoryID, next.UTC().Format("2006-01-02T15:04:05.000Z"), in.Reason)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"memoryId": result.Memory.ID, "previousStatus": result.PreviousStatus, "status": result.Status, "reviewAt": result.ReviewAt, "reason": result.Reason, "occurredAt": result.OccurredAt}, nil)
}

func (s *Service) correct(ctx context.Context, _ *mcp.CallToolRequest, in correctInput) (*mcp.CallToolResult, map[string]any, error) {
	in.MemoryID = strings.TrimSpace(in.MemoryID)
	in.Title, in.Content = strings.TrimSpace(in.Title), strings.TrimSpace(in.Content)
	if err := validate(in.MemoryID, 200, true); err != nil {
		return toolResult(nil, err)
	}
	if len([]rune(in.Title)) > 500 || len([]rune(in.Content)) > 50000 {
		return toolResult(nil, errors.New("A correction field exceeds its maximum length."))
	}
	if in.Title == "" && in.Content == "" {
		return toolResult(nil, errors.New("title or content is required."))
	}
	item, ok, err := s.Store.Get(ctx, in.MemoryID, s.ProjectID)
	if err != nil {
		return toolResult(nil, err)
	}
	if !ok || (s.Area != "" && tagValue(item.Tags, "area") != "" && tagValue(item.Tags, "area") != s.Area) {
		return toolResult(nil, errors.New("Memory was not found in this project."))
	}
	if in.Title == "" {
		in.Title = item.Title
	}
	if in.Content == "" {
		in.Content = item.Content
	}
	if in.Title == item.Title && in.Content == item.Content {
		return toolResult(nil, errors.New("The correction does not change the memory."))
	}
	result, err := s.Store.CorrectMemory(ctx, s.ProjectID, in.MemoryID, in.Title, in.Content)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"previousId": result.Previous.ID, "currentId": result.Current.ID, "status": result.Current.Status, "relation": "supersedes"}, nil)
}

func (s *Service) relations(ctx context.Context, _ *mcp.CallToolRequest, in relationsInput) (*mcp.CallToolResult, map[string]any, error) {
	in.MemoryID = strings.TrimSpace(in.MemoryID)
	if err := validate(in.MemoryID, 200, true); err != nil {
		return toolResult(nil, err)
	}
	limit, maxChars := in.Limit, in.MaxChars
	if limit == 0 {
		limit = 20
	}
	if limit < 1 || limit > 100 {
		return toolResult(nil, errors.New("limit must be between 1 and 100."))
	}
	if maxChars == 0 {
		maxChars = 4000
	}
	if maxChars < 100 || maxChars > 20000 {
		return toolResult(nil, errors.New("maxChars must be between 100 and 20000."))
	}
	item, ok, err := s.Store.Get(ctx, in.MemoryID, s.ProjectID)
	if err != nil {
		return toolResult(nil, err)
	}
	if !ok || (s.Area != "" && tagValue(item.Tags, "area") != "" && tagValue(item.Tags, "area") != s.Area) {
		return toolResult(nil, errors.New("Memory was not found in this project."))
	}
	links, err := s.Store.ListRelations(ctx, s.ProjectID, in.MemoryID, limit)
	if err != nil {
		return toolResult(nil, err)
	}
	entries := []map[string]any{}
	used := 0
	for _, link := range links {
		area := tagValue(link.Memory.Tags, "area")
		if s.Area != "" && area != "" && area != s.Area {
			continue
		}
		remaining := maxChars - used
		if remaining <= 0 {
			break
		}
		title, content := link.Memory.Title, link.Memory.Content
		if len([]rune(title))+len([]rune(content)) > remaining {
			titleRunes, contentRunes := []rune(title), []rune(content)
			if len(titleRunes) >= remaining {
				title, content = string(titleRunes[:remaining]), ""
			} else {
				title, content = string(titleRunes), string(contentRunes[:remaining-len(titleRunes)])
			}
		}
		source := tagValue(link.Memory.Tags, "source")
		if source == "" {
			source = "agent-memory:sqlite"
		}
		entryValue := memoryEntry(link.Memory, title, content, source, area)
		entries = append(entries, map[string]any{"relation": link.Relation, "direction": link.Direction, "entry": entryValue})
		used += len([]rune(title)) + len([]rune(content))
		if len(entries) == limit || used >= maxChars {
			break
		}
	}
	return toolResult(map[string]any{"relations": entries}, nil)
}

func memoryEntry(item core.Memory, title, content, source, area string) entry {
	if source == "" {
		source = "agent-memory:sqlite"
	}
	return entry{ID: item.ID, ProjectID: item.WorkspaceID, Type: item.Type, Title: title, Content: content, SubjectKey: item.SubjectKey, Source: source, Area: area, Tags: item.Tags, Status: item.Status, ReviewAt: item.ReviewAt, ExpiresAt: item.ExpiresAt, CreatedAt: item.CreatedAt, UpdatedAt: item.UpdatedAt}
}

func validate(v string, max int, required bool) error {
	v = strings.TrimSpace(v)
	if required && v == "" {
		return errors.New("value is required.")
	}
	if len([]rune(v)) > max {
		return errors.New("value exceeds the maximum length.")
	}
	return nil
}
func tagValue(tags []string, key string) string {
	for _, v := range tags {
		if strings.HasPrefix(v, key+":") {
			return strings.TrimPrefix(v, key+":")
		}
	}
	return ""
}
func newID() string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return hex.EncodeToString([]byte("fallback-session-id"))
	}
	return hex.EncodeToString(b)
}
func stringPtr(v string) *string { return &v }
func boolPtr(v bool) *bool       { return &v }
