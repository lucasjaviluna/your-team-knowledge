# Desarrollo local

## Requisitos

- Go según `native/ytk-memory/go.mod`.

## Inicio rápido

1. Entrar en `native/ytk-memory`.
2. Ejecutar `gofmt -w .` antes de enviar cambios de Go.
3. Validar con `go vet ./...`, `go test ./...` y `go build ./cmd/ytk-memory`.

El servidor MCP usa SQLite local y no requiere PostgreSQL, servicios externos,
embeddings ni modelos descargables. Para probarlo manualmente, compilá y luego
iniciá `./ytk-memory mcp --project proyecto-prueba`.

## Límites actuales

El producto se enfoca exclusivamente en Agent Memory para sesiones agenticas.
RAG, PostgreSQL/pgvector, embeddings, ingesta documental y API HTTP se retiraron
del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md) para
recuperar esa línea en otro proyecto.
