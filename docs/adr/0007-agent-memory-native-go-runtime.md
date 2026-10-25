# ADR 0007: Runtime nativo Go como única implementación de Agent Memory

## Estado

Aceptada e implementada.

## Contexto

Agent Memory necesita operar localmente en repositorios de trabajo con SQLite,
MCP por `stdio` y operaciones de mantenimiento seguras. El runtime anterior en
TypeScript y sus dependencias Node se retiraron tras completar el piloto de
Windows y validar los checks de Windows y Linux en GitHub Actions.

## Decisión

Agent Memory se implementa y distribuye exclusivamente mediante el binario Go
`ytk-memory`. El binario concentra SQLite y FTS5, lifecycle, revisión,
retención, compactación, backup, servidor MCP, configuración de consumidores,
diagnóstico, actualización, rollback y desinstalación.

El runtime usa SQLite sin cgo con FTS5. Las plataformas soportadas son Windows
x64, Linux x64 y macOS arm64; cada una se valida en CI antes de publicar.

Los contratos que se preservan son el formato y la semántica de SQLite, los
nombres y esquemas MCP, `.ytk-memory.json`, `.ytk-memory/`, los bloques
administrados de consumidores y las reglas de contenido sensible,
`subjectKey`, lifecycle y ownership de sesión.

## Consecuencias

- Los repositorios consumidores no requieren Node.js ni npm.
- Las pruebas, el empaquetado y la CI se basan en Go.
- Cualquier cambio de comportamiento se cubre con pruebas del módulo Go.
- Los artefactos siguen necesitando checksums, firma, política de versiones y
  validación en máquinas limpias por plataforma.

## Referencias

- [Guía de consumo nativo](../agent-memory-native-consumer-guide.md)
- [Contrato de Agent Memory](../agent-memory-contract.md)
