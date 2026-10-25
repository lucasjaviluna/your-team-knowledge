package surface

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

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
	mcp.AddTool(server, add("memory_session_start", "Start a project-scoped session and optionally recall memory.", false), s.start)
	mcp.AddTool(server, add("memory_search", "Search reusable memory in the configured project.", true), s.search)
	mcp.AddTool(server, add("memory_get", "Read one memory from the configured project.", true), s.get)
	mcp.AddTool(server, add("memory_save", "Create or update durable project memory.", false), s.save)
	mcp.AddTool(server, add("memory_session_finish", "Finish a project-scoped session and optionally save its summary.", false), s.finish)
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
type entry struct {
	ID        string   `json:"id"`
	ProjectID string   `json:"projectId"`
	Type      string   `json:"type"`
	Title     string   `json:"title"`
	Content   string   `json:"content"`
	Source    string   `json:"source"`
	Area      string   `json:"area,omitempty"`
	Tags      []string `json:"tags"`
	Status    string   `json:"status"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
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
	}
	session, err := s.Store.StartSession(ctx, newID(), s.ProjectID, &s.OwnerID)
	if err != nil {
		return toolResult(nil, err)
	}
	return toolResult(map[string]any{"sessionId": session.ID, "entries": entries}, nil)
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
		out = append(out, entry{item.ID, item.WorkspaceID, item.Type, item.Title, content, source, area, item.Tags, item.Status, item.CreatedAt, item.UpdatedAt})
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
	return toolResult(map[string]any{"entry": entry{item.ID, item.WorkspaceID, item.Type, item.Title, content, source, area, item.Tags, item.Status, item.CreatedAt, item.UpdatedAt}}, nil)
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
