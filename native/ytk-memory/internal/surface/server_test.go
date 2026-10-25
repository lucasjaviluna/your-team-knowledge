package surface

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/corporate-knowledge/ytk-memory/internal/core"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestMCPToolsRoundTripAndSessionOwnership(t *testing.T) {
	ctx := context.Background()
	store, err := core.Open(filepath.Join(t.TempDir(), "memory.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	server := NewService(store, Config{ProjectID: "project-a"}).Server()
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer clientSession.Close()
	tools, err := clientSession.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 11 {
		t.Fatalf("got %d tools, want 11", len(tools.Tools))
	}
	started, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "memory_session_start", Arguments: map[string]any{}})
	if err != nil {
		t.Fatal(err)
	}
	if started.IsError {
		t.Fatalf("start failed: %+v", started)
	}
	var session struct {
		SessionID string `json:"sessionId"`
	}
	if err := decodeContent(started, &session); err != nil {
		t.Fatal(err)
	}
	saved, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "memory_save", Arguments: map[string]any{"type": "decision", "title": "Use Go", "content": "The Core stays scoped to one project.", "sessionId": session.SessionID}})
	if err != nil {
		t.Fatal(err)
	}
	if saved.IsError {
		t.Fatalf("save failed: content=%v", textContent(saved))
	}
	var memory struct {
		Stored  bool   `json:"stored"`
		EntryID string `json:"entryId"`
	}
	if err := decodeContent(saved, &memory); err != nil {
		t.Fatal(err)
	}
	searched, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "memory_search", Arguments: map[string]any{"query": "project scoped"}})
	if err != nil {
		t.Fatal(err)
	}
	if searched.IsError {
		t.Fatalf("search failed: %+v", searched)
	}
	ownerMismatch := NewService(store, Config{ProjectID: "project-a"})
	foreignSave, _, err := ownerMismatch.save(ctx, nil, saveInput{Type: "decision", Title: "Foreign write", Content: "Must be rejected.", SessionID: session.SessionID})
	if err != nil || !foreignSave.IsError {
		t.Fatalf("expected different process owner to be rejected on save, got result=%+v err=%v", foreignSave, err)
	}
	closed, _, err := ownerMismatch.finish(ctx, nil, finishInput{SessionID: session.SessionID})
	if err != nil || !closed.IsError {
		t.Fatalf("expected different process owner to be rejected, got result=%+v err=%v", closed, err)
	}
	finished, err := clientSession.CallTool(ctx, &mcp.CallToolParams{Name: "memory_session_finish", Arguments: map[string]any{"sessionId": session.SessionID, "summary": "Complete summary."}})
	if err != nil {
		t.Fatal(err)
	}
	if finished.IsError {
		t.Fatalf("finish failed: %+v", finished)
	}
}

func TestConsolidationRequiresPreviewAndExplicitConfirmation(t *testing.T) {
	ctx := context.Background()
	store, err := core.Open(filepath.Join(t.TempDir(), "memory.sqlite"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := NewService(store, Config{ProjectID: "project-a"})
	for _, id := range []string{"conflict-one", "conflict-two"} {
		if _, err := store.Save(ctx, core.SaveInput{ID: id, WorkspaceID: "project-a", Type: "decision", Title: id, Content: "Candidate conflict."}); err != nil {
			t.Fatal(err)
		}
	}

	previewResult, _, err := service.consolidationPreview(ctx, nil, consolidationInput{MemoryIDs: []string{"conflict-one", "conflict-two"}, Title: "Canonical decision", ArchiveSources: true})
	if err != nil || previewResult.IsError {
		t.Fatalf("preview failed: result=%+v err=%v", previewResult, err)
	}
	var preview struct {
		Preview struct {
			SourceIDs        []string `json:"sourceIds"`
			ArchiveSourceIDs []string `json:"archiveSourceIds"`
		} `json:"preview"`
		RequiresConfirmation bool `json:"requiresConfirmation"`
	}
	if err := decodeContent(previewResult, &preview); err != nil {
		t.Fatal(err)
	}
	if !preview.RequiresConfirmation || len(preview.Preview.SourceIDs) != 2 || len(preview.Preview.ArchiveSourceIDs) != 2 {
		t.Fatalf("unexpected preview response: %#v", preview)
	}
	for _, id := range preview.Preview.SourceIDs {
		item, ok, err := store.Get(ctx, id, "project-a")
		if err != nil || !ok || item.Status != "active" {
			t.Fatalf("preview changed source %s: item=%#v ok=%v err=%v", id, item, ok, err)
		}
	}

	notConfirmed, _, err := service.consolidate(ctx, nil, consolidationInput{MemoryIDs: []string{"conflict-one", "conflict-two"}, ArchiveSources: true})
	if err != nil || !notConfirmed.IsError {
		t.Fatalf("expected confirmation error: result=%+v err=%v", notConfirmed, err)
	}
	confirmed, _, err := service.consolidate(ctx, nil, consolidationInput{MemoryIDs: []string{"conflict-one", "conflict-two"}, Title: "Canonical decision", ArchiveSources: true, Confirm: true})
	if err != nil || confirmed.IsError {
		t.Fatalf("confirmed consolidation failed: result=%+v err=%v", confirmed, err)
	}
	for _, id := range []string{"conflict-one", "conflict-two"} {
		item, ok, err := store.Get(ctx, id, "project-a")
		if err != nil || !ok || item.Status != "archived" {
			t.Fatalf("source was not archived after confirmed consolidation: item=%#v ok=%v err=%v", item, ok, err)
		}
	}
}

func textContent(result *mcp.CallToolResult) string {
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok {
			return text.Text
		}
	}
	return ""
}

func decodeContent(result *mcp.CallToolResult, target any) error {
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok {
			return json.Unmarshal([]byte(text.Text), target)
		}
	}
	return errors.New("no text content")
}
