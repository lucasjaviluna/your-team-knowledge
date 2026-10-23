# Desarrollo local

## Requisitos

- Node.js 22 o superior para la compatibilidad TypeScript.
- npm 10 o superior.
- Go según `native/ytk-memory/go.mod` para el runtime nativo.

## Inicio rápido

1. Ejecutar `npm ci`.
2. Ejecutar `npm run build`.
3. Validar con `npm run lint`, `npm run typecheck` y `npm test`.
4. Ejecutar `npm run test:mcp-smoke` para validar el transporte MCP.
5. Ejecutar `npm run test:agent-memory-go-conformance` y `go test ./...` desde
   `native/ytk-memory` para validar el runtime Go.

El servidor MCP usa SQLite local y no requiere PostgreSQL, servicios externos,
embeddings ni modelos descargables. Para probarlo manualmente, compilá y luego
iniciá `node dist/mcp-server.js --project proyecto-prueba`.

## Límites actuales

El producto se enfoca exclusivamente en Agent Memory para sesiones agenticas.
RAG, PostgreSQL/pgvector, embeddings, ingesta documental y API HTTP se retiraron
del repositorio. Ver [ADR 0009](adr/0009-agent-memory-only-scope.md) para
recuperar esa línea en otro proyecto.
