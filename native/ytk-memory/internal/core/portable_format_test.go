package core

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParsePortable(t *testing.T) {
	good := PortableDocument{Format: "ytk-memory-export", Version: 1, ExportedAt: "2026-11-09T12:00:00Z", Source: PortableSource{Namespace: "8afc8511-f9d2-4604-853c-d46d592292e1"}, Memories: []PortableMemory{{ID: "one", Type: "decision", Title: "Decision", Content: "Keep WAL enabled.", Tags: []string{}, CreatedAt: "2026-11-09T12:00:00Z", UpdatedAt: "2026-11-09T12:00:00Z", ValidFrom: "2026-11-09T12:00:00Z"}}, Relations: []PortableRelation{}}
	data, _ := json.Marshal(good)
	if _, err := ParsePortable(data); err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(*PortableDocument){"version": func(d *PortableDocument) { d.Version = 2 }, "duplicate": func(d *PortableDocument) { d.Memories = append(d.Memories, d.Memories[0]) }, "secret": func(d *PortableDocument) { d.Memories[0].Content = "api_key=abcdefghijklmnopqrstuvwxyz123456" }, "dangling": func(d *PortableDocument) {
		d.Relations = append(d.Relations, PortableRelation{SourceID: "one", TargetID: "missing", Relation: "related"})
	}, "invalid time": func(d *PortableDocument) { d.Memories[0].ValidFrom = "bad" }} {
		t.Run(name, func(t *testing.T) {
			var copy PortableDocument
			_ = json.Unmarshal(data, &copy)
			mutate(&copy)
			b, _ := json.Marshal(copy)
			if _, e := ParsePortable(b); e == nil {
				t.Fatal("accepted invalid document")
			}
		})
	}
	for _, bad := range []string{strings.Replace(string(data), "\"version\":1", "\"version\":1,\"version\":1", 1), strings.Replace(string(data), "\"format\":", "\"unknown\":1,\"format\":", 1), string(data) + " {}", strings.Repeat(" ", PortableMaxBytes+1)} {
		if _, err := ParsePortable([]byte(bad)); err == nil {
			t.Fatal("accepted invalid JSON or size")
		}
	}
}
