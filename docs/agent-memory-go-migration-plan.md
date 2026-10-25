# Estado de migración de Agent Memory a Go

## Decisión completada

Agent Memory usa exclusivamente el runtime nativo Go `ytk-memory`. Se retiraron
el runtime TypeScript, sus dependencias Node, sus pruebas y sus utilidades de
release y smoke.

## Capacidades disponibles

- SQLite y FTS5 locales, sin cgo.
- Sesiones, resúmenes, relaciones, lifecycle, revisión, retención y
  compactación.
- MCP por `stdio` con once herramientas y un proceso fijado a un proyecto.
- `doctor`, backup, upgrade, rollback y setup/uninstall para Codex, Claude Code, Pi y OpenCode.
- Compilación y paquetes validados para Windows x64, Linux x64 y macOS arm64.

## Verificación

La CI ejecuta en Windows, Linux y macOS arm64:

```text
gofmt
go vet ./...
go test ./...
go build ./cmd/ytk-memory
```

El piloto se completó en Windows según la confirmación del usuario. La prueba
manual de Linux queda aplazada; los checks Linux de GitHub Actions son el gate
aceptado por ahora. El comando `release` genera paquetes reproducibles,
manifiesto, checksum y firma Ed25519; los tags aprobados requieren una clave
persistente del job protegido.

## Trabajo posterior

Las mejoras futuras deben extender el módulo Go: contexto inicial compacto,
herramientas de lifecycle y corrección, evaluación de recuperación, diagnóstico
más detallado y el primer release
aprobado desde el canal firmado.
