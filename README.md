# Agent Memory

Repositorio de referencia para Agent Memory: runtime local para sesiones
agenticas, con SQLite/FTS5, MCP y distribución nativa Go. El alcance está
documentado en [ADR 0009](docs/adr/0009-agent-memory-only-scope.md).

## Runtime nativo Go

El binario `ytk-memory` ofrece:

- cinco herramientas MCP para iniciar/cerrar sesiones, guardar, buscar y leer
  memorias;
- aislamiento por proyecto;
- `doctor`, `backup`, `upgrade` y `rollback`;
- setup y uninstall de Codex con registro MCP global y activación local;
- paquetes Windows/Linux con checksum y firma.

La guía de instalación está en [docs/agent-memory-installation.md](docs/agent-memory-installation.md)
y la guía de consumidores en [docs/agent-memory-native-consumer-guide.md](docs/agent-memory-native-consumer-guide.md).

## Compatibilidad TypeScript

El paquete Node mantiene los contratos de Agent Memory durante la transición:

```text
npm ci
npm run build
npm run test:agent-memory-conformance
```

La distribución principal para nuevos consumidores es el binario Go. El
protocolo reusable está en [docs/agent-memory-protocol.md](docs/agent-memory-protocol.md).

## Desarrollo

Consultá [docs/local-development.md](docs/local-development.md) para los checks
locales y [docs/current-status.md](docs/current-status.md) para el siguiente
trabajo. RAG y conocimiento documental fueron retirados para concentrar el
producto en Agent Memory. El contexto de esa decisión está en el ADR 0009.
