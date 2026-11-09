package core

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"
)

// Portable v1 limits bound validation work before data is persisted.
const PortableMaxBytes = 8 << 20
const PortableMaxMemories = 1000
const PortableMaxRelations = 5000
const portableMaxDepth = 16

type PortableSource struct {
	Namespace string `json:"namespace"`
}
type PortableMemory struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`
	Title      string   `json:"title"`
	Content    string   `json:"content"`
	SubjectKey *string  `json:"subjectKey,omitempty"`
	Tags       []string `json:"tags"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
	ValidFrom  string   `json:"validFrom"`
	ExpiresAt  *string  `json:"expiresAt,omitempty"`
	ReviewAt   *string  `json:"reviewAt,omitempty"`
}
type PortableRelation struct {
	SourceID string `json:"sourceId"`
	TargetID string `json:"targetId"`
	Relation string `json:"relation"`
}
type PortableDocument struct {
	Format     string             `json:"format"`
	Version    int                `json:"version"`
	ExportedAt string             `json:"exportedAt"`
	Source     PortableSource     `json:"source"`
	Memories   []PortableMemory   `json:"memories"`
	Relations  []PortableRelation `json:"relations"`
}

// ParsePortable validates an untrusted document without opening or mutating a store.
func ParsePortable(data []byte) (PortableDocument, error) {
	var doc PortableDocument
	if len(data) == 0 || len(data) > PortableMaxBytes || !utf8.Valid(data) {
		return doc, errors.New("invalid portable document size or encoding")
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	if err := portableJSONValue(dec, 0); err != nil {
		return doc, errors.New("invalid portable JSON")
	}
	if _, err := dec.Token(); err != io.EOF {
		return doc, errors.New("invalid trailing JSON")
	}
	if err := portableExactKeys(data); err != nil {
		return doc, errors.New("invalid portable document fields")
	}
	dec = json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&doc); err != nil {
		return doc, errors.New("invalid portable document")
	}
	if doc.Format != "ytk-memory-export" || doc.Version != 1 {
		return doc, errors.New("unsupported portable format or version")
	}
	if !portableUUID(doc.Source.Namespace) || !portableTime(doc.ExportedAt) {
		return doc, errors.New("invalid portable source or export time")
	}
	if doc.Memories == nil || doc.Relations == nil || len(doc.Memories) > PortableMaxMemories || len(doc.Relations) > PortableMaxRelations {
		return doc, errors.New("invalid portable collection size")
	}
	ids := map[string]bool{}
	keys := map[string]bool{}
	for _, m := range doc.Memories {
		if !portableText(m.ID, 200) || !portableText(m.Title, 500) || !portableText(m.Content, 20000) || m.Tags == nil || len(m.Tags) > 100 {
			return doc, errors.New("invalid portable memory fields")
		}
		if ids[m.ID] {
			return doc, errors.New("duplicate portable memory ID")
		}
		ids[m.ID] = true
		if m.SubjectKey != nil {
			if !portableText(*m.SubjectKey, 500) || keys[*m.SubjectKey] {
				return doc, errors.New("invalid or duplicate portable subject key")
			}
			keys[*m.SubjectKey] = true
		}
		sensitive := m.ID + "\n" + m.Title + "\n" + m.Content
		if m.SubjectKey != nil {
			sensitive += "\n" + *m.SubjectKey
		}
		for _, tag := range m.Tags {
			if !portableText(tag, 500) {
				return doc, errors.New("invalid portable tag")
			}
			sensitive += "\n" + tag
		}
		if hasSensitiveContent(sensitive) {
			return doc, errors.New("sensitive content detected in portable document")
		}
		if !portableTime(m.CreatedAt) || !portableTime(m.UpdatedAt) || !portableTime(m.ValidFrom) || (m.ExpiresAt != nil && !portableTime(*m.ExpiresAt)) || (m.ReviewAt != nil && !portableTime(*m.ReviewAt)) {
			return doc, errors.New("invalid portable memory time")
		}
		valid, _ := time.Parse(time.RFC3339Nano, m.ValidFrom)
		if m.ExpiresAt != nil {
			v, _ := time.Parse(time.RFC3339Nano, *m.ExpiresAt)
			if !v.After(valid) || portableCanonicalTime(*m.ExpiresAt) <= portableCanonicalTime(m.ValidFrom) {
				return doc, errors.New("invalid portable lifecycle")
			}
		}
		if m.ReviewAt != nil {
			v, _ := time.Parse(time.RFC3339Nano, *m.ReviewAt)
			if v.Before(valid) || portableCanonicalTime(*m.ReviewAt) < portableCanonicalTime(m.ValidFrom) {
				return doc, errors.New("invalid portable lifecycle")
			}
		}
		if err := validateMemory(Memory{Type: m.Type, Status: "active"}); err != nil {
			return doc, errors.New("invalid portable memory type")
		}
	}
	seen := map[string]bool{}
	for _, r := range doc.Relations {
		if !ids[r.SourceID] || !ids[r.TargetID] || r.SourceID == r.TargetID || (r.Relation != "related" && r.Relation != "supports" && r.Relation != "supersedes" && r.Relation != "conflicts_with") {
			return doc, errors.New("invalid portable relation")
		}
		key := fmt.Sprintf("%q/%q/%q", r.SourceID, r.TargetID, r.Relation)
		if seen[key] {
			return doc, errors.New("duplicate portable relation")
		}
		seen[key] = true
	}
	return doc, nil
}
func portableText(s string, max int) bool {
	return strings.TrimSpace(s) == s && s != "" && len([]rune(s)) <= max
}
func portableTime(s string) bool { _, err := time.Parse(time.RFC3339Nano, s); return err == nil }
func portableUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
		} else if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func portableJSONValue(d *json.Decoder, depth int) error {
	if depth > portableMaxDepth {
		return errors.New("too deep")
	}
	token, err := d.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delim {
	case '{':
		seen := map[string]bool{}
		for d.More() {
			t, e := d.Token()
			if e != nil {
				return e
			}
			key, ok := t.(string)
			if !ok || seen[key] {
				return errors.New("duplicate key")
			}
			seen[key] = true
			if e = portableJSONValue(d, depth+1); e != nil {
				return e
			}
		}
		end, e := d.Token()
		if e != nil || end != json.Delim('}') {
			return errors.New("invalid object")
		}
	case '[':
		for d.More() {
			if e := portableJSONValue(d, depth+1); e != nil {
				return e
			}
		}
		end, e := d.Token()
		if e != nil || end != json.Delim(']') {
			return errors.New("invalid array")
		}
	default:
		return errors.New("unexpected delimiter")
	}
	return nil
}

// JSON decoder field matching is case-insensitive; enforce exact v1 keys first.
func portableExactKeys(data []byte) error {
	var root map[string]json.RawMessage
	if json.Unmarshal(data, &root) != nil {
		return errors.New("invalid root")
	}
	check := func(raw []byte, allowed map[string]bool, required []string) error {
		var o map[string]json.RawMessage
		if json.Unmarshal(raw, &o) != nil || o == nil {
			return errors.New("invalid object")
		}
		for k := range o {
			if !allowed[k] {
				return errors.New("unknown key")
			}
		}
		for _, k := range required {
			if _, ok := o[k]; !ok {
				return errors.New("missing key")
			}
		}
		return nil
	}
	top := map[string]bool{"format": true, "version": true, "exportedAt": true, "source": true, "memories": true, "relations": true}
	if err := check(data, top, []string{"format", "version", "exportedAt", "source", "memories", "relations"}); err != nil {
		return err
	}
	if err := check(root["source"], map[string]bool{"namespace": true}, []string{"namespace"}); err != nil {
		return err
	}
	var memories []json.RawMessage
	if json.Unmarshal(root["memories"], &memories) != nil || memories == nil {
		return errors.New("invalid memories")
	}
	allowed := map[string]bool{"id": true, "type": true, "title": true, "content": true, "subjectKey": true, "tags": true, "createdAt": true, "updatedAt": true, "validFrom": true, "expiresAt": true, "reviewAt": true}
	for _, m := range memories {
		if err := check(m, allowed, []string{"id", "type", "title", "content", "tags", "createdAt", "updatedAt", "validFrom"}); err != nil {
			return err
		}
	}
	var relations []json.RawMessage
	if json.Unmarshal(root["relations"], &relations) != nil || relations == nil {
		return errors.New("invalid relations")
	}
	for _, r := range relations {
		if err := check(r, map[string]bool{"sourceId": true, "targetId": true, "relation": true}, []string{"sourceId", "targetId", "relation"}); err != nil {
			return err
		}
	}
	return nil
}
