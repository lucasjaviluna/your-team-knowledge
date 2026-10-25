# Desarrollo local

## Requisitos

- Go según `native/ytk-memory/go.mod`.

## Inicio rápido

1. Entrar en `native/ytk-memory`.
2. Ejecutar `gofmt -w .` antes de enviar cambios de Go.
3. Validar con `go vet ./...`, `go test ./...` y `go build ./cmd/ytk-memory`.

## Evaluación de recuperación

El corpus sintético versionado vive en
`native/ytk-memory/internal/core/testdata/retrieval-evaluation-v1.json`. Incluye
decisiones, cambio de nombre, notas contradictorias, términos exactos y consultas
parafraseadas. Para medir la recuperación léxica y el briefing inicial:

```text
ytk-memory evaluate --evaluation-fixture internal/core/testdata/retrieval-evaluation-v1.json --database .tmp/retrieval-evaluation.sqlite
```

El informe JSON contiene recall@k y precisión de búsqueda, precisión del
briefing, latencia medida localmente y caracteres devueltos. Las mediciones de
latencia se comparan entre ejecuciones en el mismo entorno; no son un umbral
portátil de CI.

El servidor MCP usa SQLite local y no requiere PostgreSQL, servicios externos,
embeddings ni modelos descargables. Para probarlo manualmente, compilá y luego
iniciá `./ytk-memory mcp --project proyecto-prueba`.

## Límites actuales

El producto se enfoca exclusivamente en Agent Memory para sesiones agenticas.
RAG, PostgreSQL/pgvector, embeddings, ingesta documental y API HTTP se retiraron
del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md) para
recuperar esa línea en otro proyecto.
