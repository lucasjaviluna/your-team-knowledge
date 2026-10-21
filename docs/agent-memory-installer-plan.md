# Instalador automático de Agent Memory por agente

## Objetivo

Después de instalar el paquete, un usuario ejecuta un solo comando desde su proyecto y puede usar Agent Memory SQLite en una nueva sesión de su agente sin copiar configuración MCP ni instrucciones. El primer agente soportado es Codex; la interfaz permitirá agregar Claude y otros clientes después.

Comando objetivo:

```text
ytk-memory-init --agent codex --area backend
```

`--agent` identifica el cliente a configurar, independientemente del modelo elegido dentro de ese cliente.

## Estado antes de esta implementación

`src/agent-memory-init.ts` resuelve proyecto, área y base de datos, y genera `.ytk-memory.json`, `.ytk-memory/mcp.json` y `.ytk-memory/YTK-MEMORY.md`. El usuario no necesita registrar manualmente el servidor MCP ni incorporar el protocolo. El servidor MCP y el contrato de memoria SQLite ya existían.

## Avance

La primera implementación incorpora un contrato de adaptador por agente y el adaptador Codex. `--agent codex` registra el MCP en `.codex/config.toml` y añade el protocolo a `AGENTS.md` mediante bloques delimitados. Resuelve rutas absolutas, admite `--dry-run` y `--uninstall`, detecta colisiones y migra los archivos portables del inicializador anterior. La escritura se planifica antes de modificar archivos y revierte lo escrito si falla un paso. Las pruebas específicas cubren instalación repetida, preservación de contenido ajeno, migración y desinstalación. Cuando se selecciona un adaptador, `.ytk-memory/mcp.json` sólo se genera con `--portable`; sin adaptador, el flujo portable lo sigue generando.

El adaptador Codex admite `--instructions local|global|both`. El alcance local incorpora en el `AGENTS.md` del checkout un activador breve y genera la skill `.agents/skills/ytk-memory/SKILL.md` con el protocolo completo. El mismo protocolo se mantiene como fallback portable en `.ytk-memory/YTK-MEMORY.md`, generado desde `src/installer/agent-memory-protocol.ts` para evitar divergencias. No son dos skills: Codex descubre la primera; la segunda permite seguir el protocolo desde hosts MCP sin soporte de skills. Ambos archivos son artefactos administrados por el instalador, por eso Prettier los excluye y los cambios deben hacerse en su generador, no en las copias generadas. El global instala una regla condicional sin proyecto ni rutas en el perfil de Codex del usuario. La opción `both` combina ambos sin duplicar el protocolo. La CLI pregunta el alcance sólo en un terminal interactivo; en automatizaciones conserva `local` como valor por defecto.

El núcleo del instalador Codex y la distribución por tarball tienen pruebas y CI para Windows y Linux; el workflow también ejecuta smokes MCP y E2E de dos consumidores. No se ha validado aquí la detección desde la aplicación Codex real ni su comportamiento específico en CLI e IDE. Sigue pendiente endurecer el diagnóstico de TOML malformado/entradas previas y hacer esa validación con los hosts reales. El alcance vigente está resumido en [current-status.md](current-status.md).

## Fases

1. **Núcleo de instalación.** Separar la resolución común de proyecto, área, base y ejecutable de los adaptadores de cada agente. Mantener un contrato de instalación extensible para `codex` y futuros clientes. Definir `--dry-run`, instalación repetible y una marca de propiedad para cada bloque generado.
2. **Adaptador Codex MCP.** Crear o actualizar `.codex/config.toml` del proyecto, preservando el resto del archivo. Registrar un servidor propio del checkout con `node`, argumentos separados, ruta absoluta al ejecutable MCP, `--project` explícito y ruta absoluta a SQLite. Detectar colisiones con entradas existentes y migrar sólo las entradas propias o reconocidas. Tener en cuenta que Codex carga la configuración del proyecto únicamente cuando éste es de confianza.
3. **Protocolo Codex.** Crear `AGENTS.md` si falta, o insertar un bloque breve delimitado en el existente sin alterar sus otras instrucciones. Incluir inicio de sesión, búsqueda antes de decisiones, guardado de conocimiento reusable con clave estable, resumen al cerrar y exclusión de secretos. Conservar `.ytk-memory/YTK-MEMORY.md` como referencia portable. La skill `.agents/skills/ytk-memory/` contiene las instrucciones extensas.
4. **Operación segura.** Hacer que una segunda ejecución actualice lo propio sin duplicar contenido. Incorporar `--uninstall --agent codex` para retirar sólo los bloques instalados, `--dry-run` para mostrar cambios y mensajes claros ante conflictos. Preservar archivos previos y preparar reversión si una escritura intermedia falla.
5. **Diagnóstico.** Comprobar Node 22+, existencia del ejecutable, resolución del proyecto, ubicación de la base, validez de TOML y detección del MCP por Codex. Informar que se requiere una nueva sesión para cargar cambios. La instalación debe reconocer configuraciones anteriores defectuosas sin crear una segunda entrada que compita con ellas.
6. **Validación.** Instalar el tarball en un proyecto temporal con `AGENTS.md` y `.codex/config.toml` preexistentes. Confirmar instalación repetida, preservación de contenido ajeno, detección de herramientas MCP, guardado SQLite, recuperación en una sesión nueva y desinstalación selectiva. Validar Windows y Linux. Comprobar CLI e IDE; evaluar por separado la app de escritorio.

## Criterio de terminado

Tras instalar el paquete, `ytk-memory-init --agent codex --area <area>` configura MCP y protocolo en el proyecto. Una nueva sesión de Codex puede guardar y recuperar memoria SQLite sin copiar archivos ni editar configuraciones manualmente. La segunda ejecución no duplica entradas y la desinstalación conserva contenido ajeno.

## Referencias

- `src/agent-memory-init.ts`
- `docs/agent-memory-mcp.md`
- `docs/agent-memory-protocol.md`
- Documentación oficial de Codex: configuración por proyecto, MCP, `AGENTS.md` y skills.
