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

## Release local

El empaquetado aprobado requiere una clave Ed25519 persistente en
`YTK_MEMORY_SIGNING_PRIVATE_KEY`. Desde `native/ytk-memory`:

```text
ytk-memory release package --version 0.1.0 --goos linux --goarch amd64 --output dist
ytk-memory release verify \
  --artifact dist/ytk-memory_0.1.0_linux_amd64.tar.gz \
  --manifest dist/ytk-memory_0.1.0_linux_amd64.tar.gz.manifest.json \
  --signature dist/ytk-memory_0.1.0_linux_amd64.tar.gz.sig \
  --public-key dist/ytk-memory_0.1.0_linux_amd64.tar.gz.pub
```

`--ephemeral-key` está reservado para smoke tests y no produce un artefacto
apto para distribución. El workflow de tags `v*` exige el secreto persistente,
la variable pública `YTK_MEMORY_SIGNING_PUBLIC_KEY`, sube el artefacto con su
manifiesto, firma, clave pública y checksum, y publica el release sólo después
de validar Windows y Linux y verificar cada firma. Consultá la
[política de firma, rotación y revocación](release-policy.md) antes del primer
tag aprobado.

## Límites actuales

El producto se enfoca exclusivamente en Agent Memory para sesiones agenticas.
RAG, PostgreSQL/pgvector, embeddings, ingesta documental y API HTTP se retiraron
del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md) para
recuperar esa línea en otro proyecto.
