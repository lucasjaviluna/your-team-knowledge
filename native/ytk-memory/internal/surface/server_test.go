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

func TestFiveMCPToolsRoundTripAndSessionOwnership(t *testing.T) {
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
	if len(tools.Tools) != 5 {
		t.Fatalf("got %d tools, want 5", len(tools.Tools))
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
