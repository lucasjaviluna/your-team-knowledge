# ADR 0008: Registro MCP global de Codex y activación local por proyecto

## Estado

Aceptada.

## Contexto

El instalador nativo registraba el servidor MCP de Codex en
`.codex/config.toml` dentro de cada checkout y permitía instrucciones locales,
globales o ambas. Esto repetía el registro del mismo ejecutable y vinculaba sus
argumentos a un único proyecto, base SQLite y directorio de trabajo.

Codex usa su propio `CODEX_HOME/config.toml` para la configuración global. El
registro de Agent Memory puede vivir allí sin activar memoria en todos los
repositorios, siempre que el servidor exija una configuración local antes de
abrir SQLite.

## Decisión

`ytk-memory setup codex` registra una sola entrada MCP genérica y administrada
en `CODEX_HOME/config.toml`. La entrada ejecuta `ytk-memory mcp` sin argumentos
de proyecto, base, área ni directorio de trabajo.

Cada proyecto conserva su activación local mediante `.ytk-memory.json`, el
bloque administrado de `AGENTS.md` y la skill
`.agents/skills/ytk-memory/SKILL.md`. El servidor MCP sólo inicia si encuentra
`.ytk-memory.json` desde el directorio de trabajo del proceso. Esa configuración
resuelve el proyecto, la base y el área de la instancia.

`uninstall codex` elimina la activación local y conserva el registro global.
Cuando se ejecuta interactivamente, ofrece eliminar también el bloque MCP
global; `--remove-global-mcp` habilita esa limpieza en automatizaciones.

## Consecuencias

- Un único registro MCP sirve a varios proyectos configurados.
- No se instalan instrucciones ni skills globales.
- Un proyecto sin setup local no puede crear una SQLite por una invocación MCP.
- El instalador debe detectar y rechazar una entrada global `ytk_memory` ajena
  o incompatible.
- La desinstalación de un proyecto no desactiva Agent Memory en otros proyectos
  salvo que el usuario confirme la limpieza global.
