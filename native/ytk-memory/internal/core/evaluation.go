package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// EvaluationFixture is a small, versioned retrieval corpus. It intentionally
// contains only synthetic information so it can be committed and run locally.
type EvaluationFixture struct {
	Version     int                `json:"version"`
	Clock       string             `json:"clock"`
	WorkspaceID string             `json:"workspaceId"`
	Memories    []EvaluationMemory `json:"memories"`
	Searches    []EvaluationCase   `json:"searches"`
	Briefings   []EvaluationCase   `json:"briefings"`
}

type EvaluationMemory struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	SubjectKey string   `json:"subjectKey"`
	Tags       []string `json:"tags"`
}

type EvaluationCase struct {
	ID                  string   `json:"id"`
	Query               string   `json:"query,omitempty"`
	RelevantSubjectKeys []string `json:"relevantSubjectKeys"`
	Limit               int      `json:"limit,omitempty"`
}

type EvaluationResult struct {
	ID                  string   `json:"id"`
	RelevantSubjectKeys []string `json:"relevantSubjectKeys"`
	ReturnedSubjectKeys []string `json:"returnedSubjectKeys"`
	Recall              float64  `json:"recall"`
	Precision           float64  `json:"precision"`
	LatencyMicros       int64    `json:"latencyMicros"`
	ContextChars        int      `json:"contextChars"`
}

type EvaluationReport struct {
	Version              int                `json:"version"`
	Runtime              string             `json:"runtime"`
	Clock                string             `json:"clock"`
	Search               []EvaluationResult `json:"search"`
	Briefing             []EvaluationResult `json:"briefing"`
	SearchRecallAtK      float64            `json:"searchRecallAtK"`
	SearchPrecisionAtK   float64            `json:"searchPrecisionAtK"`
	BriefingPrecision    float64            `json:"briefingPrecision"`
	AverageLatencyMicros int64              `json:"averageLatencyMicros"`
	AverageContextChars  int                `json:"averageContextChars"`
}

// RunEvaluation loads a synthetic corpus, measures the current lexical search
// and compact-context behavior, and returns a machine-readable report.
func RunEvaluation(fixtureFile, databaseFile string) (EvaluationReport, error) {
	data, err := os.ReadFile(fixtureFile)
	if err != nil {
		return EvaluationReport{}, err
	}
	var fixture EvaluationFixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		return EvaluationReport{}, err
	}
	if fixture.Version != 1 {
		return EvaluationReport{}, fmt.Errorf("Unsupported evaluation fixture version %d.", fixture.Version)
	}
	clock, err := time.Parse(time.RFC3339Nano, fixture.Clock)
	if err != nil {
		return EvaluationReport{}, errors.New("Evaluation fixture clock is invalid.")
	}
	if strings.TrimSpace(fixture.WorkspaceID) == "" {
		return EvaluationReport{}, errors.New("Evaluation fixture workspaceId is required.")
	}
	store, err := Open(databaseFile, func() time.Time { return clock })
	if err != nil {
		return EvaluationReport{}, err
	}
	defer store.Close()
	ctx := context.Background()
	for _, item := range fixture.Memories {
		if strings.TrimSpace(item.ID) == "" || strings.TrimSpace(item.SubjectKey) == "" {
			return EvaluationReport{}, errors.New("Evaluation memories require id and subjectKey.")
		}
		if _, err := store.Save(ctx, SaveInput{ID: item.ID, WorkspaceID: fixture.WorkspaceID, Type: item.Type, Title: item.Title, Content: item.Content, SubjectKey: stringPointer(item.SubjectKey), Tags: item.Tags}); err != nil {
			return EvaluationReport{}, err
		}
	}
	report := EvaluationReport{Version: fixture.Version, Runtime: "go", Clock: fixture.Clock}
	for _, test := range fixture.Searches {
		result, err := evaluateSearch(ctx, store, fixture.WorkspaceID, test)
		if err != nil {
			return EvaluationReport{}, fmt.Errorf("search %s: %w", test.ID, err)
		}
		report.Search = append(report.Search, result)
	}
	for _, test := range fixture.Briefings {
		result, err := evaluateBriefing(ctx, store, fixture.WorkspaceID, test)
		if err != nil {
			return EvaluationReport{}, fmt.Errorf("briefing %s: %w", test.ID, err)
		}
		report.Briefing = append(report.Briefing, result)
	}
	report.SearchRecallAtK = averageRecall(report.Search)
	report.SearchPrecisionAtK = averagePrecision(report.Search)
	report.BriefingPrecision = averagePrecision(report.Briefing)
	report.AverageLatencyMicros = averageLatency(append(append([]EvaluationResult{}, report.Search...), report.Briefing...))
	report.AverageContextChars = averageContextChars(report.Briefing)
	return report, nil
}

func evaluateSearch(ctx context.Context, store *Store, workspaceID string, test EvaluationCase) (EvaluationResult, error) {
	if strings.TrimSpace(test.ID) == "" || strings.TrimSpace(test.Query) == "" {
		return EvaluationResult{}, errors.New("id and query are required.")
	}
	limit, err := evaluationLimit(test.Limit)
	if err != nil {
		return EvaluationResult{}, err
	}
	started := time.Now()
	items, err := store.Search(ctx, workspaceID, test.Query, limit)
	latency := time.Since(started).Microseconds()
	if err != nil {
		return EvaluationResult{}, err
	}
	return evaluationResult(test, items, latency), nil
}

func evaluateBriefing(ctx context.Context, store *Store, workspaceID string, test EvaluationCase) (EvaluationResult, error) {
	if strings.TrimSpace(test.ID) == "" {
		return EvaluationResult{}, errors.New("id is required.")
	}
	limit, err := evaluationLimit(test.Limit)
	if err != nil {
		return EvaluationResult{}, err
	}
	started := time.Now()
	items, err := store.Context(ctx, workspaceID, limit)
	latency := time.Since(started).Microseconds()
	if err != nil {
		return EvaluationResult{}, err
	}
	return evaluationResult(test, items, latency), nil
}

func evaluationLimit(limit int) (int, error) {
	if limit == 0 {
		return 5, nil
	}
	if limit < 1 || limit > 100 {
		return 0, errors.New("limit must be between 1 and 100.")
	}
	return limit, nil
}

func evaluationResult(test EvaluationCase, items []Memory, latency int64) EvaluationResult {
	returned := make([]string, 0, len(items))
	chars := 0
	for _, item := range items {
		if item.SubjectKey != nil {
			returned = append(returned, *item.SubjectKey)
		}
		chars += len([]rune(item.Title)) + len([]rune(item.Content))
	}
	relevant := uniqueStrings(test.RelevantSubjectKeys)
	hits := 0
	for _, key := range returned {
		if contains(relevant, key) {
			hits++
		}
	}
	precision, recall := 0.0, 0.0
	if len(returned) > 0 {
		precision = float64(hits) / float64(len(returned))
	}
	if len(relevant) > 0 {
		recall = float64(hits) / float64(len(relevant))
	}
	return EvaluationResult{ID: test.ID, RelevantSubjectKeys: relevant, ReturnedSubjectKeys: returned, Recall: recall, Precision: precision, LatencyMicros: latency, ContextChars: chars}
}

func averageRecall(values []EvaluationResult) float64 {
	return average(values, func(value EvaluationResult) float64 { return value.Recall })
}
func averagePrecision(values []EvaluationResult) float64 {
	return average(values, func(value EvaluationResult) float64 { return value.Precision })
}
func average(values []EvaluationResult, selector func(EvaluationResult) float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += selector(value)
	}
	return total / float64(len(values))
}
func averageLatency(values []EvaluationResult) int64 {
	if len(values) == 0 {
		return 0
	}
	var total int64
	for _, value := range values {
		total += value.LatencyMicros
	}
	return total / int64(len(values))
}
func averageContextChars(values []EvaluationResult) int {
	if len(values) == 0 {
		return 0
	}
	total := 0
	for _, value := range values {
		total += value.ContextChars
	}
	return total / len(values)
}
func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
func stringPointer(value string) *string { return &value }
