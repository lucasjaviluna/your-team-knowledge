# Agent Memory

Repositorio de referencia para Agent Memory: runtime local para sesiones
agenticas, con SQLite/FTS5, MCP y distribución nativa Go. El alcance está
documentado en [ADR 0009](docs/adr/0009-agent-memory-only-scope.md).

## Runtime nativo Go

El binario `ytk-memory` ofrece:

- once herramientas MCP para sesiones, búsqueda, guardado, revisión, corrección
  versionada y consulta de relaciones;
- aislamiento por proyecto;
- `doctor`, `backup`, `upgrade` y `rollback`;
- `doctor --read-only` para inspeccionar SQLite sin aplicar migraciones;
- CLI de lectura local: `search`, `list`, `get` y `stats`, limitada al proyecto
  resuelto desde `.ytk-memory.json` o los flags explícitos;
- setup y uninstall idempotentes de Codex, Claude Code, Pi y OpenCode; Codex usa
  registro MCP global y los demás hosts configuración por proyecto;
- compilación y pruebas en Windows, Linux y macOS arm64 desde el módulo Go.

El comando `ytk-memory evaluate` ejecuta el corpus sintético de recuperación y
emite métricas JSON para comparar cambios de ranking y briefing. Consultá
[docs/local-development.md](docs/local-development.md) para ejecutarlo.

La CLI también permite inspeccionar la memoria del proyecto configurado:

```text
ytk-memory search --query "SQLite concurrency" --json
ytk-memory list --limit 20
ytk-memory get --id <memory-id>
ytk-memory stats --json
```

Los comandos respetan el proyecto y área de `.ytk-memory.json`; aceptan
`--project`, `--database` y `--area` para fijarlos explícitamente.

La guía de instalación está en [docs/agent-memory-installation.md](docs/agent-memory-installation.md)
y la guía de consumidores en [docs/agent-memory-native-consumer-guide.md](docs/agent-memory-native-consumer-guide.md).
La descripción detallada de capas Go, esquema SQLite/FTS5, índices, tools,
métricas, seguridad y distribución está en
[docs/technical-architecture.md](docs/technical-architecture.md).

## Desarrollo

Consultá [docs/local-development.md](docs/local-development.md) para los checks
locales y [docs/current-status.md](docs/current-status.md) para el siguiente
trabajo. RAG y conocimiento documental fueron retirados para concentrar el
producto en Agent Memory. El contexto de esa decisión está en el ADR 0009.
