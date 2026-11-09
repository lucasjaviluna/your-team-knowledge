# Plan: exportación portable versionada de Agent Memory

**Estado:** v1 implementada para CLI; ver [guía de uso](agent-memory-portable-transfer.md) y [ADR 0012](adr/0012-portable-memory-transfer.md). El cuerpo conserva el diseño y los criterios originales; ante diferencias
prevalecen la guía y el ADR. La siguiente prioridad operativa es PR 09. **Alcance:** transferencia local explícita entre
workspaces, sin sincronización automática ni servicios externos.

## Resultado buscado

Una persona puede exportar una selección de memorias, inspeccionar un archivo
portable, obtener una vista previa en otro proyecto e importar sólo después de
revisar el plan. El destino jamás cambia de proyecto por datos del archivo. No
se sobrescriben ni fusionan memorias existentes automáticamente. El archivo es
una transferencia de contenido potencialmente privado; no es un backup SQLite
integral y no preserva sesiones, historial completo ni configuración del host.

## Formato v1 propuesto

JSON UTF-8, un único documento con `format: "ytk-memory-export"`,
`version: 1`, `exportedAt` RFC3339, `source`, `memories` y
`relations`. El orden de campos no tiene significado; IDs dentro del archivo
son únicos. Se rechazan versiones desconocidas, campos desconocidos en v1,
claves JSON duplicadas, texto UTF-8 inválido y referencias inconsistentes. El
parser aplica límites explícitos de bytes, cantidad de memorias, relaciones,
profundidad y longitud antes de asignaciones grandes; documentar los valores
concretos y verificarlos con fixtures antes de declarar estable el formato.
La validación inicial limita el documento a 8 MiB, 1000 memorias, 5000
relaciones y profundidad 16; admite fechas RFC3339 con `validFrom` obligatorio
y `expiresAt`/`reviewAt` opcionales. Estos límites son provisionales.

Ejemplo ilustrativo, sin datos reales:

```json
{
  "format": "ytk-memory-export",
  "version": 1,
  "exportedAt": "2026-11-09T12:00:00Z",
  "source": {"namespace": "8afc8511-f9d2-4604-853c-d46d592292e1"},
  "memories": [{
    "id": "source-memory-1",
    "type": "decision",
    "title": "Usar WAL",
    "content": "Las escrituras locales usan WAL.",
    "subjectKey": "storage/journal-mode",
    "tags": ["area:backend"],
    "createdAt": "2026-11-01T12:00:00Z",
    "updatedAt": "2026-11-02T12:00:00Z",
    "validFrom": "2026-11-01T12:00:00Z"
  }],
  "relations": []
}
```

El origen no envía rutas, sessionId, nombre de usuario ni configuración de
host. Exportar sólo memorias activas, vigentes y visibles por proyecto/área;
no exportar memorias vencidas, archivadas, superseded o futuras en v1. La
selección explícita se valida completamente; un ID inexistente o fuera del
alcance produce error genérico. La selección no expande dependencias: sólo se
exportan relaciones cuyos dos extremos estén seleccionados y cuya clase esté
soportada. La CLI no informa la cantidad de relaciones omitidas. Fechas de creación y actualización son metadatos de origen; nunca se
interpretan como autorización para sobrescribir contenido local. `validFrom`, `expiresAt` y `reviewAt` se conservan en destino normalizados
a UTC con precisión de milisegundos. Validar tipo, campos,
etiquetas, claves, fechas y relaciones con las reglas existentes del core.

## Identidad y colisiones

La identidad portable es `(source.namespace, memory.id)`: el namespace debe
ser un UUID aleatorio estable para la identidad de origen, persistido de forma
transaccional y reutilizado entre exportaciones. No derivarlo sólo del nombre
editable del proyecto ni de una ruta. Definir su custodia al copiar/restaurar
bases y una migración compatible; restaurar un backup conserva identidad,
y los clones conservan el mismo namespace. La v1 no ofrece regenerarlo;
para un proyecto independiente se usa una base/proyecto nuevo. No prometer sincronización entre clones.

El destino asigna IDs locales nuevos y guarda un mapeo persistente y único por
proyecto de destino e identidad portable. Una repetición con contenido y
metadatos portables idénticos es `unchanged`; si el mismo origen llega con
contenido distinto es `changed-origin` y queda bloqueado para revisión. Una
`subjectKey` ya activa en destino, o repetida en el archivo, es una colisión,
no una autorización para el upsert existente. Una colisión de ID local nunca
se resuelve reutilizando el ID de origen. Cualquier igualdad o comparación usa
una representación canónica y versionada de todos los campos relevantes, no
sólo título y contenido. No usar la detección léxica de conflictos como prueba
de identidad ni veredicto.

En v1, la política de colisiones es conservadora: la vista previa las describe
sin incluir información de otro proyecto/área; la aplicación se rechaza si hay
cualquier elemento bloqueado. `unchanged` se omite y sólo se insertan
entradas nuevas. No hay sustitución, merge, corrección ni archivado. Una futura
resolución selectiva requerirá contrato explícito y nuevas pruebas.

## Exportación, preview e importación

1. **Exportación:** consultar snapshot coherente con scope local y validar el
   conjunto. Escribir a un archivo nuevo mediante temporal en el mismo
   directorio, permisos restrictivos donde el sistema los soporte y un enlace
   que publica sin reemplazo; no sobrescribir archivos existentes por defecto. Si falla, limpiar
   sólo el temporal creado por la operación. No emitir contenido por logs.
2. **Preview:** leer el archivo con límites; validar formato, relaciones,
   lifecycle y contenido sensible antes de cualquier persistencia. La salida
   identifica destino, entradas nuevas, sin cambios, bloqueadas, cantidad de relaciones incluidas y motivos, con texto acotado. No modifica memorias,
   relaciones, FTS, identidad ni archivos del destino. No incluir contenido
   sensible detectado en errores o resultados. La detección existente se aplica
   al menos a título y contenido y a todo otro campo persistido que cubran los
   contratos; no reducir su alcance.
3. **Aplicación:** exigir confirmación explícita de la vista previa. Vincularla
   al hash del contenido exacto del archivo, proyecto/área de destino, versión
   del algoritmo y estado relevante del destino. Al aplicar, reabrir el archivo
   una sola vez, verificar su hash y volver a validar el plan dentro de una
   transacción que proteja el estado frente a escrituras concurrentes. Si cambió
   cualquier precondición, abortar y solicitar una nueva vista previa; no usar
   un `confirm=true` aislado como prueba de que se revisó el mismo plan.
4. Insertar memorias nuevas, mapeos y relaciones válidas junto con su índice
   FTS en una sola transacción. Cualquier falla revierte todo. No importar una
   relación si su extremo no se puede mapear con certeza. Verificar que una
   importación repetida no duplique elementos ni relaciones. Preservar checks
   de secretos antes de cada escritura, incluso al volver a validar.

El hash es una huella de integridad y vinculación de vista previa, no una
firma de autenticidad. No se afirma cifrado ni procedencia confiable: quien
comparta el archivo debe controlar su almacenamiento y distribución. La exportación crea la identidad de origen en la base si todavía no existe;
por eso requiere apertura normal. El preview abre la base sin migrar.

## Integración y secuencia

1. **Diseño detallado y fixtures.** Resolver namespace, política de lifecycle,
   límites concretos y forma de representar la precondición de preview; aprobar
   ejemplos válidos e inválidos y matriz de compatibilidad v1. Consultar ADR
   0009/0011 y registrar ADR si se adopta la identidad persistente nueva.
2. **Core.** Separar modelo/validación del formato, decisión de importación y
   persistencia transaccional. Agregar migración de identidad y mapeos con
   rollback y pruebas de bases heredadas; mantener reglas independientes de
   MCP y de detalles SQLite donde los contratos lo permitan.
3. **Exportación y vista previa.** Primero entregar lectura, escritura segura
   de archivo y preview sin mutación. Usar rutas explícitas locales desde CLI;
   no aceptar rutas arbitrarias en MCP sin definir primero un contrato seguro.
4. **Importación confirmada.** Implementar revalidación y commit atómico, con
   idempotencia, colisiones bloqueantes y pruebas de estado cambiante. El
   transporte llama al core y no duplica las reglas. Evaluar exposición MCP
   sólo después de definir cómo se transmite el archivo y limita su tamaño.
5. **Documentación y release.** Añadir comandos reales y ejemplos sólo cuando
   existan; documentar privacidad, compatibilidad, límites, errores y
   recuperación. Actualizar arquitectura, ADR, MCP/CLI, estado y portal según
   el alcance realmente implementado.

## Pruebas y criterios de aceptación

- Fixtures deterministas de roundtrip a otro proyecto, selección parcial,
  relaciones internas, etiquetas/área y lifecycle; repetir importación sin
  duplicados y sin alterar entradas existentes.
- Rechazar JSON malformado, duplicados, referencias colgantes, versión
  desconocida, campos inválidos, contenidos sensibles y tamaños excesivos;
  verificar que ninguna escritura parcial ocurre, tampoco en FTS o mapeos.
- Confirmar aislamiento de proyecto/área en selección, preview, errores y
  aplicación; ninguna entrada oculta se revela por colisiones o relaciones.
- Probar archivo, destino o condiciones cambiados después del preview; rechazo
  de plan obsoleto, y escritura concurrente durante la aplicación. Inyectar
  fallos de validación, índice y relaciones y comprobar rollback integral.
- Probar colisiones de `subjectKey`, identidad repetida idéntica/cambiada,
  duplicados dentro del archivo y colisión de IDs; nunca sobrescribir.
- Probar migración heredada, backup/restore y estabilidad de identidad; probar
  que la salida no sobrescribe un archivo ajeno y que los temporales se limpian.
- Ejecutar `gofmt`, `go vet ./...`, `go test ./...` y build en
  `native/ytk-memory`, más roundtrip del transporte elegido y CI. Registrar
  cualquier prueba no ejecutada. No declarar completado el incremento mientras
  falte el flujo completo exportar → preview → confirmar → importar.
