# Corporate Knowledge Platform

Plataforma de conocimiento corporativo que combina memoria local para agentes y recuperación documental corporativa.

La arquitectura y sus decisiones vigentes se mantienen en [docs/architecture.md](docs/architecture.md). La hoja de ruta de implementación está en [docs/implementation-plan.md](docs/implementation-plan.md), y el estado actual con el siguiente punto de continuación en [docs/current-status.md](docs/current-status.md).

## Agent Memory

El paquete publica un contrato neutral en `@corporate-knowledge/platform/memory`, un servidor MCP local y el inicializador `ytk-memory-init`. Después de instalarlo, el inicializador prepara la configuración local del checkout; el servidor resuelve el proyecto automáticamente:

### Instalarlo en otro proyecto

El paquete todavía es privado y se distribuye mediante un tarball interno. Desde
este repositorio, generá el artefacto:

```text
npm run release:internal
```

Luego, desde el proyecto destino, instalá el tarball que se generó en
`artifacts/`:

```text
npm install --save-dev "<ruta-al-repositorio>/artifacts/corporate-knowledge-platform-0.1.0.tgz"
```

El proyecto destino necesita Node.js 22 o posterior. Una vez instalado,
ejecutá el inicializador desde la raíz del checkout:

```text
npx ytk-memory-init --agent codex --area backend
```

El comando configura el MCP del proyecto y agrega el protocolo de Agent Memory
al `AGENTS.md`. Con alcance local también instala la skill detallada en
`.agents/skills/ytk-memory/SKILL.md` y conserva el mismo protocolo como
fallback portable en `.ytk-memory/YTK-MEMORY.md`. En una terminal
interactiva pregunta si las instrucciones deben quedar en el repositorio, en el
perfil global de Codex o en ambos. Para scripts usá un alcance explícito y
`--no-prompt`:

```text
npx ytk-memory-init --agent codex --area backend --instructions local --no-prompt
```

Antes de escribir, podés revisar los cambios con `--dry-run`:

```text
npx ytk-memory-init --agent codex --area backend --dry-run --no-prompt
```

Si el proyecto ya tiene configuración propia, el instalador preserva el resto
del contenido. Después de instalar, confiá el proyecto en Codex si corresponde
y abrí una nueva sesión para que cargue `.codex/config.toml` y `AGENTS.md`.

Para retirar los bloques instalados por Codex:

```text
npx ytk-memory-init --agent codex --uninstall --instructions local --no-prompt
```

El manifiesto portable `.ytk-memory/mcp.json` sólo hace falta para hosts sin
adaptador nativo. Generálo con `--portable` si el proyecto usa un adaptador, o
ejecutá el inicializador sin `--agent` para usar el flujo portable.

El binario MCP también puede ejecutarse directamente:

```text
ytk-memory-init --agent codex --area backend
ytk-memory-mcp --database <ruta-sqlite>
```

El instalador agrega instrucciones al repositorio por defecto. Usá
`--instructions global` o `--instructions both` para sumar una regla
condicional al perfil de Codex del usuario.

`--instructions` sólo define dónde se agrega `AGENTS.md`; el registro MCP se
mantiene en `.codex/config.toml` del proyecto porque contiene el proyecto, la
base SQLite y las rutas del checkout.

La configuración completa y el contrato de herramientas están en [docs/agent-memory-mcp.md](docs/agent-memory-mcp.md). Para generar también el manifiesto MCP portable al usar un adaptador, agregá `--portable`.

El recorrido de interoperabilidad se valida con `npm run test:agent-memory-e2e`: dos clientes MCP independientes comparten memoria, respetan ownership de sesión y recuperan el contexto después de compactación.
