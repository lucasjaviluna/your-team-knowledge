# Estado actual y punto de continuación

**Revisado:** 2026-10-25

**Alcance:** Agent Memory y runtime nativo Go.

## Alcance vigente

El repositorio se dedica a memoria durable local de agentes. RAG,
PostgreSQL/pgvector, embeddings, API documental y Context Orchestrator fueron
retirados del alcance; ver [ADR 0009](adr/0009-agent-memory-only-scope.md).

## Implementado

- Core Go con SQLite/FTS5; sesiones, memorias, `subjectKey`, relaciones,
  lifecycle, revisión, retención y consolidación.
- MCP `stdio` con once herramientas y proceso ligado a un proyecto; briefing
  compacto, búsqueda lexical, corrección versionada y consolidación confirmada.
- Setup/uninstall para Codex, Claude Code, Pi y OpenCode. Codex registra MCP en
  `CODEX_HOME/config.toml` y activa instrucciones por proyecto; los otros hosts
  usan registros de proyecto.
- CLI doctor, backup, upgrade y rollback. Doctor valida TOML Codex, acceso y
  tipo de ruta SQLite, integridad `quick_check` y registro/ejecutable del host.
- Evaluación sintética de retrieval y conformance; salida JSON con métricas
  reproducibles.
- CI en Windows x64, Linux x64 y macOS arm64 con formato, vet, pruebas y build.
- Canal de release implementado: paquetes, manifiesto, SHA-256, firma Ed25519,
  verificación de artefactos y smoke test por tag.
- Documentación técnica integral en
  [technical-architecture.md](technical-architecture.md).

El usuario confirmó el piloto en Windows. La validación manual Linux está
aplazada; la CI Linux se acepta como gate. El harness sintético no representa
una medición de relevancia o adopción en tareas reales.

## Pendiente

1. **Completar el primer release firmado:** el tag `v0.1.0` existe. Se corrigió
   el cierre de archivos tar/gzip/ZIP y el smoke test Ubuntu ya pasó. En el job
   Windows, la validación no encontró el directorio de artefactos bajo
   `RUNNER_TEMP`; el workflow ahora usa `GITHUB_WORKSPACE/release-output` de forma
   consistente entre empaquetado, validación y carga. Falta integrar el cambio y
   publicar un nuevo tag semántico para verificar todas las plataformas. No se
   confirmó la publicación del release.
2. **Reparar índices FTS legados:** `Open` crea la tabla FTS5 pero la migración
   no reindexa filas antiguas cuando esa tabla no existía. Implementar rebuild
   seguro y testear búsqueda después de migración.
3. **Validar en consumidores reales:** medir calidad del briefing/búsqueda y
   comprobar cada host cuando haya repositorios disponibles.
4. **Caracterizar concurrencia y reintentos** con más de un proceso SQLite.

La CI está definida en `.github/workflows/ci.yml`; la custodia y procedimiento
de firma están en [release-policy.md](release-policy.md). En el intento
informado, la generación y comparación de la clave pública pasó;
el fallo reportado fue la extracción del paquete Ubuntu. No se confirmó que el
release se haya publicado.

## Verificación y referencias

La CI ejecuta `gofmt`, `go vet ./...`, `go test ./...` y build en Windows,
Linux y macOS arm64. Para estado priorizado y criterios, ver
[agent-memory-roadmap](agent-memory-roadmap-2026-10-22.md) y
[implementation-plan](implementation-plan.md). Para el detalle de diseño,
ver [technical-architecture](technical-architecture.md).
