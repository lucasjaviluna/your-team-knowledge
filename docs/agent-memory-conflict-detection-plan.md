# Plan: detección revisable de conflictos entre memorias

**Estado:** implementado parcialmente; falta evaluación cuantitativa y validación real. **Alcance:** Agent Memory local.

## Objetivo y límites

Ayudar al agente o a una persona a identificar memorias vigentes del mismo
proyecto que merecen una revisión conjunta. La similitud de tema no demuestra
una contradicción: la herramienta devuelve candidatos y evidencia, no un
veredicto. La primera versión es de sólo lectura; no crea relaciones, cambia
estados, corrige, consolida ni archiva. No utiliza modelos, embeddings, red ni
sincronización. La ausencia de candidatos tampoco demuestra consistencia.

## Contrato propuesto

Añadir una operación de dominio y exponerla como MCP
`memory_conflict_candidates`. Recibe `memoryId` obligatorio, `limit`
(opcional, por defecto 10, máximo 50) y `maxChars` (opcional, por defecto
4000, rango 100–20000, presupuesto total de texto). El proceso conserva su
proyecto y área configurados: no acepta un selector de proyecto del cliente.
La memoria base debe ser visible y vigente según las reglas de búsqueda; un ID
inexistente o fuera del alcance produce el mismo error genérico. Argumentos
inválidos se rechazan antes de consultar.

Devuelve la identificación y versión temporal de la base, una lista ordenada
de candidatos con ID, título, contenido acotado, `updatedAt`, y razones
estructuradas (códigos y evidencia concreta), más una indicación de truncamiento
y de si se alcanzó el límite de exploración. Los resultados se llaman
candidatos, no conflictos confirmados; no presentar puntuaciones como
probabilidades. Mantener el presupuesto total, incluyendo base, candidatos y
razones; nunca devolver texto de otra área o proyecto. Con `maxChars` pequeño,
conservar IDs, códigos y marcas de truncamiento aunque se omita texto.

## Selección y orden

1. Resolver la base con controles de proyecto, área y lifecycle equivalentes a
   `memory_list`/`memory_search`: activa, vigente, no expirada ni con
   revisión vencida. Las memorias sin etiqueta de área siguen la visibilidad
   existente. Filtrar ambas partes antes de producir evidencia o límites.
2. Obtener un conjunto acotado de memorias relacionadas por términos de título
   y contenido usando el índice léxico existente. Reutilizar la normalización
   y el escape de FTS; una consulta sin términos útiles devuelve lista vacía.
   Acotar explícitamente cantidad de términos y candidatos examinados; los
   valores concretos se fijan y prueban durante implementación. No explorar
   todos los pares ni depender de la posición dentro de una lista reciente.
3. Explicar las señales observables, por ejemplo términos significativos
   compartidos o claves de tema relacionadas si existen. Una clave idéntica
   puede representar un upsert y no garantiza la existencia de dos registros.
   No afirmar oposición semántica basándose sólo en negaciones o diferencias
   de texto. Excluir la propia base y duplicados; considerar relaciones de
   versiones existentes para evitar presentar una sucesión conocida como
   contradicción vigente.
4. Ordenar de forma determinista por fuerza de las señales documentadas, luego
   fecha de actualización e ID para desempatar. Mostrar sólo hasta `limit`;
   distinguir salida recortada de exploración limitada para que el consumidor
   no interprete la lista como exhaustiva.

El servicio define tipos y reglas sin exponer SQL o MCP. El almacenamiento
implementa la recuperación acotada y los filtros, sin filtrar por área después
de aplicar un límite global que pueda ocultar resultados visibles. Evitar
migraciones si los índices y campos actuales alcanzan; justificar cualquier
cambio de esquema por separado. Usar una vista coherente de lectura o detectar
cambios concurrentes; `updatedAt` permite al revisor advertir que debe volver
a consultar antes de actuar.

## Secuencia de implementación

1. **Fijar fixtures y contrato.** Preparar ejemplos deterministas: mismo tema
   con afirmaciones potencialmente incompatibles, textos similares compatibles,
   temas distintos, versiones históricas y casos en español e inglés. Definir
   qué señales se reportan y documentar sus limitaciones antes de ajustar el
   ranking. Incluir casos sin vocabulario compartido como falsos negativos
   conocidos, no como promesa de detección semántica.
2. **Core y almacenamiento.** Implementar selección y explicación acotadas;
   reutilizar visibilidad, normalización y relaciones existentes. Mantener
   sólo lectura y controlar cancelación de contexto, errores y orden estable.
3. **MCP.** Registrar la herramienta en `internal/surface` con esquema
   validado, anotación de sólo lectura y respuestas JSON/`structuredContent`
   coherentes con las herramientas existentes. Mantener `stdout` exclusivo
   del protocolo. Agregar el contrato abstracto y ejemplos a la documentación.
4. **Flujo de revisión.** Indicar al agente que lea las memorias completas y
   sus relaciones, evalúe contexto y vigencia y solicite un veredicto humano
   antes de aplicar cambios. Si corresponde, usar las operaciones existentes
   de corrección o consolidación con sus garantías; la detección no invoca
   ninguna de ellas. No introducir un registro de veredictos en v1.
5. **Evaluación y documentación.** Medir resultados sobre un corpus etiquetado
   de candidatos y negativos, separado de la validación funcional. Registrar
   recall de candidatos, precisión de las sugerencias y límites de exploración;
   los resultados sintéticos no representan precisión semántica ni uso real.
   Actualizar MCP, protocolo, arquitectura, estado, roadmap y portal cuando la
   implementación esté verificada. Un ADR sólo es necesario si se adopta una
   decisión arquitectónica duradera nueva.

El [corpus sintético de casos](agent-memory-conflict-test-cases.md) y la
[guía de ejecución y registro](agent-memory-conflict-test-guide.md) están
preparados; todavía no constituyen una evaluación ejecutada.

## Pruebas y criterios de aceptación

- Tests del core con reloj y datos deterministas: señales y evidencia,
  orden/desempates, sin coincidencias, acentos y consultas FTS adversariales,
  duplicados, límite de exploración, truncamiento y cancelación.
- Aislamiento: base y candidato de otro proyecto o área no se revelan; memorias
  archivadas, reemplazadas, futuras, expiradas o con revisión vencida se
  excluyen según las reglas vigentes; memorias sin área mantienen su semántica.
- Demostrar ausencia de escrituras, incluso con errores; resultados repetibles
  con los mismos datos y reloj; cambios concurrentes no producen evidencia
  mezclada silenciosamente.
- Pruebas MCP de descubrimiento, esquema, errores, roundtrip y presupuesto;
  verificar que IDs fuera de alcance e inexistentes son indistinguibles.
- Corpus con positivos y negativos etiquetados: informar métricas y falsos
  positivos/negativos; fijar umbrales explícitos a partir de una línea base
  antes de declarar la calidad aceptable. Medir tiempo y memoria en un fixture
  de tamaño representativo, verificando los límites de trabajo establecidos.
- Ejecutar `gofmt`, `go vet ./...`, `go test ./...` y
  `go build ./cmd/ytk-memory` desde `native/ytk-memory`. Documentar por
  separado cualquier validación manual real y cualquier check no ejecutado.

**Terminado** significa contrato y documentación coherentes, pruebas y checks
aprobados, evaluación registrada y ninguna mutación automática. No implica
que se hayan detectado todas las contradicciones ni que otros hosts se hayan
validado en uso real.
