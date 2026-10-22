package main

import (
	"bytes"
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
