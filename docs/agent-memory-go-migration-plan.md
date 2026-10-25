# Estado de migración de Agent Memory a Go

## Decisión completada

Agent Memory usa exclusivamente el runtime nativo Go `ytk-memory`. Se retiraron
el runtime TypeScript, sus dependencias Node, sus pruebas y sus utilidades de
release y smoke.

## Capacidades disponibles

- SQLite y FTS5 locales, sin cgo.
- Sesiones, resúmenes, relaciones, lifecycle, revisión, retención y
  compactación.
- MCP por `stdio` con cinco herramientas y un proceso fijado a un proyecto.
- `doctor`, backup, upgrade, rollback, setup y uninstall de Codex.
- Compilación nativa para Windows x64 y Linux x64.

## Verificación

La CI ejecuta en Windows y Linux:

```text
gofmt
go vet ./...
go test ./...
go build ./cmd/ytk-memory
```

El piloto se completó en Windows según la confirmación del usuario. La prueba
manual de Linux queda aplazada; los checks Linux de GitHub Actions son el gate
aceptado por ahora.

## Trabajo posterior

Las mejoras futuras deben extender el módulo Go: contexto inicial compacto,
herramientas de lifecycle y corrección, evaluación de recuperación, diagnóstico
más detallado y distribución firmada desde un canal de release aprobado.
