# Guía de pruebas: candidatos a conflicto

**Estado:** guía y corpus preparados; sin ejecución ni métricas registradas.
El [corpus v1](agent-memory-conflict-test-cases.md) es sintético y sus etiquetas
son expectativas humanas de revisión, no resultados reales.

## Preparación

1. Registrar fecha, commit exacto, versión/binario, SO, cliente MCP, configuración
   de proyecto/área y versión del corpus. Usar un binario que exponga
   `memory_conflict_candidates` y verificar su descubrimiento en el cliente.
2. Usar una base SQLite nueva y desechable **por caso**, en un directorio de
   prueba fuera de datos personales. Configurar el servidor MCP con proyecto
   propio y sin área; conectar el cliente a esa instancia. El servidor queda
   fijado a su proyecto y base al iniciar. Ver [configuración MCP](agent-memory-mcp.md).
   No usar el servidor ni la base de memoria habitual del proyecto.
3. Para cada texto del caso ejecutar `memory_save` con `type: decision`,
   `title` y `content` exactos, omitiendo `subjectKey` y `tags` salvo
   indicación explícita. Anotar el `entryId` devuelto y mapearlo al alias B,
   R1, C1, etc. Confirmar que todos los guardados tuvieron éxito. Evitar que
   persistencia, sesión de prueba y resumen contaminen la base habitual.
4. Llamar `memory_conflict_candidates` con el ID asignado a B, `limit: 10`
   y `maxChars: 4000`. Guardar la respuesta completa sin datos reales. Repetir
   la consulta y verificar que el orden, IDs y evidencia sean idénticos con los
   mismos datos. Registrar `truncated` y `explorationLimited`.
5. Repetir con `limit: 1` y `limit: 5` sobre la misma base sin modificar
   los datos; registrar cada salida por separado. No inferir las salidas de k=1
   o k=5 a partir de otra consulta si existe truncamiento o cambio de datos.

Ejemplo de argumento de la herramienta, sustituyendo el ID real:

```json
{"memoryId":"ID_DEVUELTO_PARA_B","limit":10,"maxChars":4000}
```

No existe actualmente un cargador automático para este corpus: el comando
`ytk-memory evaluate` evalúa búsqueda y briefing, no estos casos. La carga y
la invocación de arriba son manuales a través de un cliente MCP; automatizarlas
es trabajo futuro. Los casos C04 y C06 declaran una premisa de equivalencia de
entidad no contenida en los textos: son pruebas difíciles, no fallos obligatorios
para un detector léxico. Reportarlos por separado.

## Medición

Para cada caso y valor de k, traducir IDs a alias. Sean R el conjunto de
candidatos etiquetados R y D los IDs distintos devueltos entre los primeros k.
Un acierto es un ID de D que pertenece a R. Los IDs C y N devueltos son
sugerencias no relevantes para este corpus; no son una clasificación errónea
explícita de la herramienta. No contar B entre los candidatos.

- **Recall@k:** aciertos / cantidad de R, sólo en casos con al menos un R.
- **Precisión de sugerencias@k:** aciertos / cantidad devuelta, sólo si se
  devolvió al menos un candidato. No se divide por k si llegaron menos de k.
- **Sin sugerencias:** registrar cantidad de consultas con D vacío por separado;
  su precisión es «no definida», no 0 ni 1. En casos sin R, recall es «no definido».
- Reportar el **promedio macro** sobre casos con denominador válido y el número
  de casos incluidos; reportar por separado C04/C06. Registrar también aciertos,
  R esperados y candidatos devueltos para permitir agregación micro.
- Registrar cada R omitido y cada C/N sugerido. Si `explorationLimited` o
  `truncated` es verdadero, señalarlo; una omisión bajo esos límites no
  demuestra ausencia de coincidencias en toda la base.

Ejemplo: R={R1}, D=[C1,R1], k=2: recall=1/1=1; precisión=1/2=0,5.
Si D está vacío, recall=0 cuando R no está vacío y precisión no está definida.
Si R está vacío y D=[C1], recall no está definido y precisión=0/1=0.
La evaluación es sintética, pequeña y no estima calidad ni tasas de error en
producción. Establecer objetivos tras observar la línea base; no alterar etiquetas
para favorecer una implementación. Para comparar cambios, usar la misma versión
del corpus, reloj/datos, parámetros, entorno y métrica; anotar diferencias.

## Casos funcionales adicionales

Estos casos se ejecutan separadamente de las métricas y necesitan fixtures
controlados en pruebas Go o un entorno de prueba que permita establecer estados;
`memory_save` MCP por sí sola no permite fijar todas las fechas o estados.
No modificar SQLite directamente con el servidor conectado, porque se debe
mantener coherencia con FTS y relaciones.

| ID | Preparación | Comprobación |
| --- | --- | --- |
| F01 | Base y candidato con mismo tema, distinto proyecto. | El candidato no aparece; consultar base ajena produce el mismo error que un ID inexistente. |
| F02 | Servidor con área backend; candidato frontend, candidato backend y uno sin área. | Frontend no aparece; backend y sin área son elegibles. La base frontend se rechaza genéricamente. |
| F03 | Candidatos archivado, superseded, futuro, expirado y con revisión vencida; reloj fijo. | Ninguno se devuelve. Probar también cada uno como base y comparar el error con un ID inexistente. |
| F04 | Base con 201 o más coincidencias visibles y ordenadas, más coincidencias de otra área. | `explorationLimited` indica límite; la salida contiene sólo visibles y hasta `limit`; el filtro de área precede al límite. |
| F05 | Texto Unicode largo y múltiples coincidencias; `maxChars: 100`. | Suma de caracteres Unicode de títulos, contenidos y evidencia ≤100; IDs, códigos y marcas persisten; `truncated` indica recorte. |
| F06 | `limit` -1 y 51, `maxChars` 99 y 20001, ID vacío o inexistente. | Argumentos inválidos devuelven error; inexistente y fuera de alcance no revelan información. Cero usa valores por defecto en MCP. |
| F07 | Base y candidato activos con relación `supersedes` controlada. | No se propone como candidato esa pareja. |
| F08 | Snapshot de filas de memoria y relaciones antes y después, incluidas consultas fallidas. | Sin cambios lógicos en memoria, lifecycle ni relaciones. No confundir archivos WAL temporales con escritura lógica. |
| F09 | Textos con puntuación FTS, comillas y Unicode; contexto cancelado. | No hay error sintáctico FTS por texto válido; la cancelación devuelve error. |
| F10 | Dos consultas con mismos datos/reloj y candidatos empatados. | Orden y evidencia idénticos; ID desempata cuando corresponde. |

Para concurrencia, probar una escritura simultánea con sincronización
controlada en tests Go y verificar que una respuesta corresponda a un único
snapshot; registrar el método. Para rendimiento usar una base representativa,
fijar cantidad y tamaño de memorias, plataforma, número de ejecuciones, latencia
y memoria, y reportar límites observados. No prometer umbrales hasta fijar una
línea base.

## Plantilla de registro

- Fecha / responsable: …
- Commit / binario / SO / cliente MCP: …
- Corpus / proyecto temporal / área / reloj si aplica: …
- Guardados y mapa alias → ID: …

| Caso | k | R esperado | Devueltos en orden | Aciertos | Recall | Precisión | truncado / límite | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 10 | R1 | … | … | … | … | … | … |

| Caso funcional | Resultado (pasa/falla/no ejecutado) | Evidencia o incidencia |
| --- | --- | --- |
| F01–F10 | … | … |

- Macro recall y número de casos definidos: …
- Macro precisión y número de casos definidos: …
- Consultas sin sugerencias / falsos positivos / omitidos: …
- C04/C06 por separado y limitaciones: …
- Latencia, tamaño del fixture y metodología: …
- Hallazgos, riesgos, próximo cambio y enlace a evidencia: …

Los resultados reales sólo se registran después de ejecutar las pruebas. No
subir bases, respuestas o datos reales con información sensible al repositorio.
