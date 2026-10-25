# ADR 0007: Runtime nativo de Go para Agent Memory

## Estado

Aceptada; Fases 0–4 implementadas y verificadas en CI. El usuario confirmó
que la Fase 5 se completó en Windows. La validación manual de Linux queda
aplazada y los checks de GitHub Actions son suficientes por ahora. Go es el
runtime principal; el paquete TypeScript permanece temporalmente como canal de
compatibilidad y se retirará al completar la transición.

## Contexto

Agent Memory funciona hoy como un paquete TypeScript privado. Requiere Node.js
22, npm y un addon nativo de SQLite para instalarse en un repositorio
consumidor. Esa distribución es útil para desarrollo, pero no es el canal
objetivo para una herramienta que debe instalarse y mantenerse con poca
fricción en repositorios de trabajo.

Node SEA permitiría empaquetar parte de la aplicación, pero sigue en desarrollo
activo y el addon `better-sqlite3` tendría que extraerse a disco antes de
cargarse. No se adopta como base del canal principal de distribución.

## Decisión

Agent Memory evolucionará a un runtime local nativo escrito en Go y distribuido
como artefactos versionados por plataforma. El binario concentrará:

- almacenamiento SQLite y FTS5;
- lifecycle, revisión, retención, compactación y backup;
- servidor MCP por `stdio`;
- configuración de consumidores, diagnóstico, actualización, rollback y
  desinstalación.

El runtime usará una implementación SQLite sin cgo que incluya FTS5. Los
artefactos iniciales se producirán para Windows x64 y Linux x64; macOS arm64 se
agregará después de una validación equivalente.

La migración conserva como contratos versionados:

- el formato y la semántica de la base SQLite existente;
- los nombres, esquemas y aislamiento de las herramientas MCP;
- `.ytk-memory.json`, `.ytk-memory/` y los bloques administrados de los
  consumidores;
- las reglas de contenido sensible, `subjectKey`, lifecycle y ownership de
  sesión.

Corporate Knowledge RAG, la API HTTP corporativa, embeddings y sus adaptadores
permanecen en TypeScript. No forman parte de esta migración.

## Consecuencias

- Los repositorios consumidores podrán usar Agent Memory sin Node ni npm.
- Se agrega una segunda base de código y una suite de conformidad entre el
  runtime TypeScript actual y Go durante la transición.
- El paquete Node se mantiene como compatibilidad hasta completar una versión
  de transición y una migración de base demostrada.
- El estado final de Agent Memory tendrá Go como único runtime; el runtime
  TypeScript se elimina al completar la transición de consumidores.
- El nuevo canal necesita artefactos firmados, checksums, política de versiones
  y validación en máquinas limpias por plataforma.

## Referencias

- [Plan de migración y distribución](../agent-memory-go-migration-plan.md)
- [Guía de consumo nativo](../agent-memory-native-consumer-guide.md)
- [Contrato de Agent Memory](../agent-memory-contract.md)
