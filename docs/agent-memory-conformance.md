# Conformidad de Agent Memory

Este documento define la línea base observable que deben respetar el runtime
TypeScript actual y la futura implementación nativa en Go. La conformidad se
evalúa desde el contrato de aplicación y no desde clases o consultas internas.

## Cómo ejecutar

```text
npm run test:agent-memory-conformance
```

El comando compila el runtime TypeScript, ejecuta el escenario JSON compartido
en `test/fixtures/agent-memory-conformance.json` y falla si alguna operación
produce un resultado o error distinto del esperado. El runner escribe un
reporte JSON en stdout para que otro runtime pueda producir la misma forma de
salida y compararse sin depender de Node.

## Contrato cubierto por la primera línea base

- sesiones: inicio, owner y cierre con resumen;
- memorias: creación, tags normalizados y actualización idempotente por
  `subjectKey`;
- búsqueda: alcance por workspace, FTS con semántica `AND` y límite;
- relaciones: creación idempotente y rechazo entre workspaces;
- lifecycle: fechas de vigencia, expiración, archivado e inspección;
- governance: rechazo de contenido sensible antes de persistir;
- errores: mensaje estable para errores de contrato esperados.

Los identificadores y el reloj son deterministas en el runner. Las fechas se
serializan en ISO 8601 UTC y los resultados se reducen a campos observables,
para que el fixture pueda ser ejecutado por Go sin replicar la estructura
privada de TypeScript.

## Formato del fixture

Cada operación tiene un `id`, un `op` y los argumentos de la operación. Los
resultados pueden referenciar valores anteriores con `$session.<id>` o
`$memory.<id>`. `expectError` convierte un error esperado en parte del contrato;
si la operación no falla o cambia su mensaje, el escenario falla.

El runner Go deberá aceptar el mismo fixture y emitir un reporte equivalente.
Durante la transición se compararán ambos reportes. Las diferencias deben
resolverse en el contrato o registrarse mediante un ADR antes de cambiar la
semántica.

## Fuera de esta primera línea base

MCP wire-level, backup nativo, instalación de hosts y compactación se validan
en escenarios adicionales de las fases 2 y 3. La primera línea base se limita
al comportamiento durable del core para mantener el fixture pequeño y
portable.
