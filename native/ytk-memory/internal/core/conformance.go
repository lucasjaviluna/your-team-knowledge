package core

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

type Fixture struct {
	Version    int         `json:"version"`
	Clock      string      `json:"clock"`
	Operations []Operation `json:"operations"`
}
type Operation struct {
	ID             string             `json:"id"`
	Op             string             `json:"op"`
	WorkspaceID    string             `json:"workspaceId"`
	OwnerID        string             `json:"ownerId"`
	SessionID      string             `json:"sessionId"`
	SourceMemoryID string             `json:"sourceMemoryId"`
	TargetMemoryID string             `json:"targetMemoryId"`
	Relation       string             `json:"relation"`
	Type           string             `json:"type"`
	Title          string             `json:"title"`
	Content        string             `json:"content"`
	SubjectKey     string             `json:"subjectKey"`
	Tags           []string           `json:"tags"`
	ValidFrom      string             `json:"validFrom"`
	ExpiresAt      string             `json:"expiresAt"`
	ReviewAt       string             `json:"reviewAt"`
	Query          string             `json:"query"`
	Summary        string             `json:"summary"`
	MemoryID       string             `json:"memoryId"`
	StatusValue    string             `json:"status"`
	NextReviewAt   string             `json:"nextReviewAt"`
	MemoryIDs      []string           `json:"memoryIds"`
	MaxChars       int                `json:"maxChars"`
	ArchiveSources bool               `json:"archiveSources"`
	PurgeBefore    string             `json:"purgeBefore"`
	DryRun         *bool              `json:"dryRun"`
	AllWorkspaces  bool               `json:"allWorkspaces"`
	ExpectedTitles []string           `json:"expectedTitles"`
	ExpectedCount  *int               `json:"expectedCount"`
	Expected       *ExpectedLifecycle `json:"expected"`
	ExpectError    string             `json:"expectError"`
}
type ExpectedLifecycle struct {
	Total    int            `json:"total"`
	Expired  int            `json:"expired"`
	ByStatus map[string]int `json:"byStatus"`
}
type Report struct {
	Version    int      `json:"version"`
	Runtime    string   `json:"runtime"`
	Clock      string   `json:"clock"`
	Passed     int      `json:"passed"`
	Operations []Result `json:"operations"`
}
type Result struct {
	ID     string `json:"id"`
	Op     string `json:"op"`
	Status string `json:"status"`
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func RunConformance(fixtureFile, databaseFile string) (Report, error) {
	data, err := os.ReadFile(fixtureFile)
	if err != nil {
		return Report{}, err
	}
	var fixture Fixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		return Report{}, err
	}
	clock, err := time.Parse(time.RFC3339Nano, fixture.Clock)
	if err != nil {
		return Report{}, errorsNew("Fixture clock is invalid.")
	}
	store, err := Open(databaseFile, func() time.Time { return clock })
	if err != nil {
		return Report{}, err
	}
	defer store.Close()
	sessions, memories := map[string]string{}, map[string]string{}
	results := make([]Result, 0, len(fixture.Operations))
	sequence := 0
	for _, operation := range fixture.Operations {
		value, operationErr := execute(context.Background(), store, operation, sessions, memories, &sequence)
		if operation.ExpectError != "" {
			if operationErr == nil {
				return Report{}, fmt.Errorf("%s: Expected error '%s' but operation succeeded.", operation.ID, operation.ExpectError)
			}
			if operationErr.Error() != operation.ExpectError {
				return Report{}, fmt.Errorf("%s: %s", operation.ID, operationErr)
			}
			results = append(results, Result{ID: operation.ID, Op: operation.Op, Status: "passed", Error: operationErr.Error()})
			continue
		}
		if operationErr != nil {
			return Report{}, fmt.Errorf("%s: %w", operation.ID, operationErr)
		}
		results = append(results, Result{ID: operation.ID, Op: operation.Op, Status: "passed", Result: value})
	}
	return Report{Version: fixture.Version, Runtime: "go", Clock: fixture.Clock, Passed: len(results), Operations: results}, nil
}

func execute(ctx context.Context, store *Store, op Operation, sessions, memories map[string]string, sequence *int) (any, error) {
	nextID := func() string { (*sequence)++; return fmt.Sprintf("id-%03d", *sequence) }
	switch op.Op {
	case "startSession":
		var owner *string
		if strings.TrimSpace(op.OwnerID) != "" {
			owner = &op.OwnerID
		}
		result, err := store.StartSession(ctx, nextID(), op.WorkspaceID, owner)
		sessions[op.ID] = result.ID
		return result, err
	case "save":
		candidateID := fmt.Sprintf("id-%03d", *sequence+1)
		input := SaveInput{ID: candidateID, WorkspaceID: op.WorkspaceID, SessionID: reference(op.SessionID, sessions), Type: op.Type, Title: op.Title, Content: op.Content, SubjectKey: optional(op.SubjectKey), Tags: op.Tags, ValidFrom: optional(op.ValidFrom), ExpiresAt: optional(op.ExpiresAt), ReviewAt: optional(op.ReviewAt)}
		result, err := store.Save(ctx, input)
		if err == nil {
			if result.ID == candidateID {
				(*sequence)++
			}
			memories[op.ID] = result.ID
		}
		return result, err
	case "search":
		items, err := store.Search(ctx, op.WorkspaceID, op.Query, 20)
		if err != nil {
			return nil, err
		}
		titles := make([]string, len(items))
		for i, item := range items {
			titles[i] = item.Title
		}
		if !sameStrings(titles, op.ExpectedTitles) {
			return nil, fmt.Errorf("Expected %s but received %s.", jsonValue(op.ExpectedTitles), jsonValue(titles))
		}
		return map[string]any{"titles": titles}, nil
	case "addRelation":
		return store.AddRelation(ctx, dereference(op.SourceMemoryID, memories), dereference(op.TargetMemoryID, memories), op.Relation)
	case "inspectLifecycle":
		result, err := store.InspectLifecycle(ctx, op.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if op.Expected != nil && (result.Total != op.Expected.Total || result.Expired != op.Expected.Expired || !sameMap(result.ByStatus, op.Expected.ByStatus)) {
			return nil, fmt.Errorf("Expected lifecycle does not match.")
		}
		return result, nil
	case "archiveExpired":
		count, err := store.ArchiveExpired(ctx, op.WorkspaceID)
		if err != nil {
			return nil, err
		}
		if op.ExpectedCount != nil && int(count) != *op.ExpectedCount {
			return nil, fmt.Errorf("Expected %d but received %d.", *op.ExpectedCount, count)
		}
		return map[string]any{"count": count}, nil
	case "endSession":
		return store.EndSession(ctx, dereference(op.SessionID, sessions), optional(op.Summary))
	case "transitionStatus":
		result, err := store.Transition(ctx, dereference(op.MemoryID, memories), op.StatusValue, "")
		return map[string]any{"status": result.Status, "changed": result.Changed}, err
	case "completeReview":
		result, err := store.CompleteReview(ctx, dereference(op.MemoryID, memories), op.NextReviewAt, "")
		return map[string]any{"status": result.Status, "reviewAt": result.ReviewAt}, err
	case "listDueForReview":
		items, err := store.ListDueForReview(ctx, op.WorkspaceID)
		if err != nil {
			return nil, err
		}
		ids := make([]string, len(items))
		for index, item := range items {
			ids[index] = item.ID
		}
		return map[string]any{"ids": ids}, nil
	case "compact":
		ids := make([]string, len(op.MemoryIDs))
		for index, id := range op.MemoryIDs {
			ids[index] = dereference(id, memories)
		}
		maxChars := op.MaxChars
		if maxChars == 0 {
			maxChars = 2000
		}
		candidateID := fmt.Sprintf("id-%03d", *sequence+1)
		result, err := store.Compact(ctx, CompactInput{ID: candidateID, WorkspaceID: op.WorkspaceID, Title: op.Title, MemoryIDs: ids, MaxChars: maxChars, ArchiveSources: op.ArchiveSources})
		if err == nil {
			if result.Summary.ID == candidateID {
				(*sequence)++
			}
			memories[op.ID] = result.Summary.ID
		}
		return map[string]any{"summaryId": result.Summary.ID, "archivedSourceIds": result.ArchivedSourceIDs, "reused": result.Reused}, err
	case "runRetention":
		dryRun := true
		if op.DryRun != nil {
			dryRun = *op.DryRun
		}
		result, err := store.RunRetention(ctx, op.PurgeBefore, op.WorkspaceID, op.AllWorkspaces, dryRun)
		return map[string]any{"expiredCandidateIds": result.ExpiredCandidateIDs, "archivedCount": result.ArchivedCount, "purgeCandidateIds": result.PurgeCandidateIDs, "purgedCount": result.PurgedCount}, err
	default:
		return nil, fmt.Errorf("Unsupported conformance operation '%s'.", op.Op)
	}
}
func optional(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
func reference(value string, values map[string]string) *string {
	if value == "" {
		return nil
	}
	result := dereference(value, values)
	return &result
}
func dereference(value string, values map[string]string) string {
	if strings.HasPrefix(value, "$session.") {
		value = strings.TrimPrefix(value, "$session.")
	} else if strings.HasPrefix(value, "$memory.") {
		value = strings.TrimPrefix(value, "$memory.")
	}
	result, ok := values[value]
	if !ok {
		panic(fmt.Sprintf("%s is required.", value))
	}
	return result
}
func sameStrings(left, right []string) bool {
	return strings.Join(left, "\x00") == strings.Join(right, "\x00")
}
func sameMap(left, right map[string]int) bool {
	if len(left) != len(right) {
		return false
	}
	for key, value := range left {
		if right[key] != value {
			return false
		}
	}
	return true
}
func jsonValue(value any) string   { data, _ := json.Marshal(value); return string(data) }
func errorsNew(value string) error { return fmt.Errorf("%s", value) }
