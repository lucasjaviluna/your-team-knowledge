# Plan de migración de Agent Memory a Go y distribución nativa

## Objetivo

Entregar Agent Memory como un binario local, firmado y versionado, que un
repositorio de trabajo pueda activar sin instalar Node.js, npm, Docker ni una
base de datos externa. El primer flujo soportado será Codex; el servidor MCP
seguirá permitiendo integrar otros hosts.

El alcance es Agent Memory. Corporate Knowledge RAG, PostgreSQL, embeddings y
la API HTTP corporativa siguen en TypeScript.

## Resultado esperado

Un usuario descarga una versión del binario para su plataforma y, desde un
checkout, ejecuta:

```text
ytk-memory setup codex
ytk-memory doctor
```

Después de reiniciar Codex, el agente recupera, guarda y resume memoria entre
sesiones. La memoria queda en `.ytk-memory/ytk-memory.sqlite` dentro del
repositorio y el usuario puede crear backups, actualizar o volver a una copia
anterior mediante el mismo binario.

La guía de uso y requisitos está en
[agent-memory-native-consumer-guide.md](agent-memory-native-consumer-guide.md).

## Arquitectura objetivo

```text
Codex u otro host MCP
          |
          | stdio
          v
  ytk-memory (binario Go)
     |        |         |
     |        |         +-- setup / doctor / backup / upgrade / rollback
     |        +-- MCP: sesiones, search, get, save, finish
     v
SQLite + FTS5 en .ytk-memory/
```

El ejecutable inicial tendrá estos subcomandos:

| Comando                       | Responsabilidad                                                   |
| ----------------------------- | ----------------------------------------------------------------- |
| `ytk-memory setup <host>`     | Configura MCP e instrucciones para un repositorio.                |
| `ytk-memory mcp`              | Sirve Agent Memory por `stdio`.                                   |
| `ytk-memory doctor`           | Verifica binario, proyecto, configuración, base y compatibilidad. |
| `ytk-memory backup`           | Crea una copia consistente de SQLite.                             |
| `ytk-memory upgrade`          | Migra el esquema con backup obligatorio.                          |
| `ytk-memory rollback`         | Restaura una copia con confirmación explícita.                    |
| `ytk-memory uninstall <host>` | Retira solo la configuración administrada.                        |

Los nombres, argumentos y salidas JSON deben especificarse antes de implementar
cada comando. El binario debe reservar `stdout` para MCP cuando se ejecuta
`mcp`; diagnósticos y errores de inicio van a `stderr`.

## Contratos que no pueden cambiar durante la migración

1. **Datos:** el runtime Go abre y migra bases SQLite creadas por la versión
   TypeScript sin perder sesiones, memorias, relaciones, FTS ni lifecycle.
2. **Semántica:** `subjectKey`, filtros de vigencia, transiciones de estado,
   aislamiento por `projectId`/workspace, contenido sensible y ownership de
   sesión conservan el comportamiento actual.
3. **MCP:** las cinco herramientas actuales, sus validaciones y sus respuestas
   estructuradas son la superficie mínima compatible.
4. **Proyecto consumidor:** `.ytk-memory.json`, `.ytk-memory/`, los bloques
   administrados en `.codex/config.toml` y `AGENTS.md` siguen siendo
   reconocibles y reversibles.
5. **Operación:** backup, upgrade y rollback siguen siendo explícitos y nunca
   reemplazan una base sin una copia verificable.

La suite TypeScript existente y nuevos fixtures de SQLite se convierten en una
suite de conformidad. Cada caso se ejecuta contra ambos runtimes mientras dure
la transición.

## Plan por fases

### Fase 0 — Contrato y línea base

**Objetivo:** impedir una reimplementación guiada por documentación incompleta.

- Aprobar ADR 0007.
- Inventariar esquema SQLite, migraciones, FTS, consultas y archivos que crea
  el instalador.
- Convertir los tests de memoria, MCP, mantenimiento e instalador en escenarios
  black-box independientes de Node.
- Agregar fixtures de base: vacía, legacy, con relaciones, con lifecycle y con
  datos sensibles rechazados.
- Definir versión de protocolo MCP y política de compatibilidad de SQLite.

**Salida:** una especificación ejecutable y fixtures compartidos.

### Fase 1 — Núcleo SQLite en Go

**Objetivo:** igualar persistencia y reglas de dominio sin exponer aún un
binario a consumidores.

- Crear un módulo Go aislado para dominio, repositorio SQLite y migraciones.
- Usar SQLite sin cgo con FTS5 incluido.
- Portar creación/lectura/actualización por `subjectKey`, búsqueda FTS y
  expansión léxica configurada.
- Portar sesiones, resúmenes, relaciones, lifecycle, revisión, retención,
  compactación y detección sensible.
- Comparar resultados y cambios de base contra la suite de conformidad.

**Criterio de salida:** las fixtures existentes se comportan igual en Go y en
TypeScript, incluidas bases creadas por versiones anteriores.

### Fase 2 — MCP y CLI de operación

**Objetivo:** hacer que el binario sustituya al servidor y CLI Node para el
caso de uso principal.

- Implementar `mcp` con las cinco herramientas compatibles.
- Fijar el proceso a un proyecto y preservar ownership de sesión.
- Implementar `doctor`, `backup`, `upgrade` y `rollback` con salidas JSON
  estables para automatización.
- Añadir pruebas de protocolo con el cliente MCP oficial y pruebas de
  recuperación después de upgrade/rollback.

**Criterio de salida:** el E2E de dos consumidores pasa exclusivamente contra
el binario Go.

### Fase 3 — Setup de repositorios consumidores

**Objetivo:** instalar Agent Memory en un checkout de forma segura y
repetible.

- Implementar `setup codex`, `--dry-run`, `--uninstall` y alcances
  `local|global|both`.
- Preservar y validar TOML/Markdown preexistentes; detectar conflictos sin
  sobrescribir configuraciones ajenas.
- Generar instrucciones y fallback portable desde una única plantilla.
- Extender `doctor` para comprobar versión, ejecutable registrado, TOML,
  rutas, acceso SQLite, esquema y disponibilidad MCP.
- Probar con `AGENTS.md` y `.codex/config.toml` preexistentes.

**Criterio de salida:** un checkout limpio queda listo para Codex con una orden
y el desinstalador revierte solamente lo propio.

### Fase 4 — Empaquetado y releases

**Objetivo:** producir artefactos verificables y consumibles sin toolchain.

- Construir artefactos nativos primero para `windows/amd64` y `linux/amd64`.
- Ejecutar pruebas nativas en cada plataforma; no publicar un artefacto solo
  porque compile de forma cruzada.
- Publicar un archivo comprimido por plataforma, un manifiesto de versión,
  SHA-256 y firma del artefacto.
- Definir un canal interno de releases con retención, soporte y procedimiento
  de revocación. El canal concreto se decide antes de publicar; no depende de
  npm.
- Agregar pruebas que descarguen/instalen el artefacto en un directorio limpio
  sin Node instalado y ejecuten `doctor`, MCP y mantenimiento.

**Criterio de salida:** una máquina limpia instala y usa el binario sin npm ni
Node, y puede verificar origen e integridad del artefacto.

### Fase 5 — Piloto y transición

**Objetivo:** demostrar consumo real antes de retirar el runtime actual.

- Ejecutar el flujo completo en repositorios de trabajo con Codex real.
- Validar al menos un segundo host MCP con configuración portable.
- Ejercitar nueva sesión, compactación, actualización, rollback y
  desinstalación.
- Mantener el paquete Node como canal de compatibilidad durante al menos una
  versión del binario estable.
- Documentar migración desde tarball Node y comunicar fecha de retiro del
  runtime TypeScript solo después de completar los criterios anteriores.

**Criterio de salida:** dos repositorios consumidores y dos hosts recuperan
memoria entre sesiones con el binario distribuido.

## Estrategia de distribución

La primera versión no tendrá autoactualización. El canal de release entrega un
artefacto por plataforma, checksums y firma; el usuario o la herramienta de TI
actualiza de manera explícita. Esto hace que upgrade y rollback sean auditables.

Artefactos iniciales:

```text
ytk-memory_<version>_windows_amd64.zip
ytk-memory_<version>_linux_amd64.tar.gz
ytk-memory_<version>_checksums.txt
ytk-memory_<version>_checksums.txt.sig
```

macOS arm64 se agrega cuando exista runner de CI y validación nativa. Gestores
como WinGet, Homebrew o un instalador corporativo son mejoras posteriores: no
deben retrasar el piloto ni sustituir checksums, firma y `doctor`.

## Riesgos y controles

| Riesgo                                     | Control                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| Diferencia semántica entre runtimes        | Suite de conformidad y fixtures compartidos.                    |
| Corrupción o migración incompleta          | Backup obligatorio, validación y rollback probado.              |
| Instalador que modifica archivos ajenos    | Bloques marcados, `dry-run`, detección de conflicto y rollback. |
| Binario sin soporte real en una plataforma | Pruebas nativas por artefacto y publicación gradual.            |
| Pérdida de consumidores Node               | Periodo de transición y configuración compatible.               |
| Scope creep hacia RAG                      | Módulo Go separado; RAG sigue en TypeScript.                    |

## Próximo incremento

La primera tarea es **Fase 0**: inventariar el contrato observable del runtime
TypeScript y generar fixtures de conformidad. No se debe crear el módulo Go
antes de completar esa línea base.
