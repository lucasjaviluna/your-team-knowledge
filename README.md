# Corporate Knowledge Platform

Plataforma de conocimiento corporativo que combina memoria local para agentes y recuperación documental corporativa.

La arquitectura y sus decisiones vigentes se mantienen en [docs/architecture.md](docs/architecture.md). La hoja de ruta de implementación está en [docs/implementation-plan.md](docs/implementation-plan.md).

## Agent Memory

El paquete publica un contrato neutral en `@corporate-knowledge/platform/memory`, un servidor MCP local y el inicializador `team-knowledge-memory-init`. Después de instalarlo, el inicializador prepara la configuración local del checkout; el servidor resuelve el proyecto automáticamente:

```text
team-knowledge-memory-init --area backend
team-knowledge-memory-mcp --database <ruta-sqlite>
```

La configuración completa y el contrato de herramientas están en [docs/agent-memory-mcp.md](docs/agent-memory-mcp.md).

El recorrido de interoperabilidad se valida con `npm run test:agent-memory-e2e`: dos clientes MCP independientes comparten memoria, respetan ownership de sesión y recuperan el contexto después de compactación.
