package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteDoctorExplainsMissingConfiguration(t *testing.T) {
	var output bytes.Buffer
	result := map[string]any{
		"healthy":   false,
		"state":     "missing_configuration",
		"projectId": "autogestion-dsw",
		"database":  "C:/workspace/.ytk-memory/ytk-memory.sqlite",
		"checks": []map[string]string{{
			"name":    "database",
			"status":  "missing",
			"message": "No se encontró la base de datos. Ejecutá `ytk-memory setup codex` para crearla o restaurá un backup.",
		}},
	}

	if err := writeDoctor(&output, result, false); err != nil {
		t.Fatal(err)
	}
	text := output.String()
	for _, expected := range []string{
		"Agent Memory · Falta configuración",
		"Verificaciones:",
		"✗ database:",
		"ytk-memory setup codex",
	} {
		if !strings.Contains(text, expected) {
			t.Errorf("doctor output does not contain %q:\n%s", expected, text)
		}
	}
}

func TestResolveRequiresLocalProjectConfiguration(t *testing.T) {
	root := t.TempDir()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	if _, err := resolve("", "", "", true); err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("expected missing local configuration error, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, ".ytk-memory.json"), []byte(`{"project_slug":"sample","database":".ytk-memory/ytk-memory.sqlite"}`), 0644); err != nil {
		t.Fatal(err)
	}
	resolved, err := resolve("", "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.project != "sample" {
		t.Fatalf("got project %q, want sample", resolved.project)
	}
}
