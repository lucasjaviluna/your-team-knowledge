# Informe de evaluación de candidatos a conflicto — test2

**Ejecución:** 2026-11-09, Windows amd64, Go 1.27.0. **Commit base:**
`8a51f0c4397af88887d08beb388d1683eb81fe91`; documentos del corpus y guía
estaban presentes como cambios locales sin confirmar. **Reloj del core:**
2026-01-15T12:00:00Z. **Base:** `test2.sqlite` en la raíz del repositorio.
Corpus sintético v1; no contiene datos reales.

## Método y límites

Se cargaron los 12 casos en una misma base con un proyecto distinto por caso
(C01–C12), para asegurar aislamiento por proyecto. La guía proponía una base
por caso: esta adaptación conserva separación lógica, no aislamiento físico.
La carga se hizo con `Store.Save` e IDs deterministas, no con `memory_save`
MCP. Se consultó directamente `Store.ConflictCandidates` para k=1, 5 y 10,
`maxChars=4000`, dos veces por configuración: 36 consultas medidas y 36
repeticiones. Las respuestas completas, evidencia, IDs, banderas y tiempos
están en `test2-results.json`; la entrada en `test2-cases.json`. Los
controles funcionales usaron proyectos adicionales dentro de la misma base y su
salida se conserva en `test2-functional.json`.

No se ejecutó este corpus a través de MCP, por lo tanto no se valida aquí el
transporte, las anotaciones, `structuredContent` ni los defaults MCP. Los
IDs usados son del fixture y no los generados por `memory_save`. Los tiempos
individuales son observaciones locales sin calentamiento ni muestra suficiente;
no son un benchmark. El corpus y las etiquetas son sintéticos y no miden calidad
real ni prueban contradicciones semánticas.

## Resultados

| k | Recall macro (casos definidos) | Precisión macro (casos definidos) | Aciertos / relevantes | Aciertos / devueltos (micro) | Consultas vacías |
| --- | --- | --- | --- | --- | --- |
| 1 | 11,1 % (9) | 10,0 % (10) | 1/9 | 1/10 | C04, C10 |
| 5 | 55,6 % (9) | 22,5 % (10) | 5/9 | 5/21 | C04, C10 |
| 10 | 55,6 % (9) | 22,5 % (10) | 5/9 | 5/21 | C04, C10 |

Recall se calcula sólo para casos con R; precisión sólo para respuestas no
vacías, según la guía. En estos casos hay un relevante por consulta, por eso el
recall macro coincide con el micro. Las salidas C/N son sugerencias no
relevantes para la etiqueta humana, no clasificaciones falsas realizadas por
la herramienta. En k=5 y k=10 se devolvieron 16 sugerencias C/N y se omitieron
C04-R1, C05-R1, C06-R1 y C11-R1. A k=1 sólo se recuperó C07-R1; se omitieron
los otros ocho R. Las 36 repeticiones produjeron respuestas idénticas;
`explorationLimited` fue falso en todos los casos del corpus.

C04 y C06 requieren una premisa de identidad que el texto no expresa y se
informan por separado: ambos R fueron omitidos para todos los k; C04 no arrojó
candidatos, C06 sugirió C1. Excluyéndolos, recall macro es 14,3 % (1/7) para
k=1 y 71,4 % (5/7) para k=5 y 10; precisión macro es 11,1 % (9 casos con
salida) y 25,0 % (9 casos con salida), respectivamente.

### Resultados por caso

Alias según el corpus; «—» indica conjunto vacío. Los resultados son ordenados.

| Caso | R esperado | k=1 | k=5 | k=10 |
| --- | --- | --- | --- | --- |
| C01 | R1 | C1 | C1, R1 | C1, R1 |
| C02 | R1 | C1 | C1, R1 | C1, R1 |
| C03 | — | C2 | C2, C1, N1 | C2, C1, N1 |
| C04 | R1 | — | — | — |
| C05 | R1 | C1 | C1 | C1 |
| C06 | R1 | C1 | C1 | C1 |
| C07 | R1 | R1 | R1, C1 | R1, C1 |
| C08 | R1 | C1 | C1, R1 | C1, R1 |
| C09 | R1 | C1 | C1, C2, R1, N1 | C1, C2, R1, N1 |
| C10 | — | — | — | — |
| C11 | R1 | C1 | C1 | C1 |
| C12 | — | C2 | C2, C1, N1 | C2, C1, N1 |

La diferencia de acentos de C05 produjo una omisión. C11 expone la limitación
actual de 16 términos: el candidato relevante no apareció. C01, C02, C08 y C09
presentaron una sugerencia compatible antes del R; C09 también devolvió un
homónimo no relacionado. Las banderas de truncamiento por `limit=1` aparecen
en C01, C02, C03, C07, C08, C09 y C12. No se observó truncamiento en k=5/10.

## Controles funcionales

Se creó un fixture controlado con reloj fijo. «Parcial» indica que se comprobó
sólo la parte expresamente descrita; los controles no fueron un conjunto de
aserciones completas automatizadas, sino resultados booleanos inspeccionados.

| Caso | Resultado | Evidencia observada |
| --- | --- | --- |
| F01 | Pasa, core | Otro proyecto excluido; error de base ajena igual al inexistente. |
| F02 | Pasa, core | Backend y sin área elegibles; frontend excluida y base frontend rechazada con error genérico. |
| F03 | Pasa, core | Archivada, superseded, futura, expirada y con revisión vencida excluidas como candidatas y rechazadas como base. |
| F04 | Pasa, core | 205 coincidencias visibles y 10 de otra área: `explorationLimited=true`, 50 resultados y ninguna área oculta. |
| F05 | Parcial | Con texto del fixture se contaron 100 caracteres, truncamiento e IDs/códigos preservados; el texto largo Unicode específico no se comprobó. |
| F06 | Parcial | Rangos negativos/fuera de rango e ID vacío rechazados; defaults y errores mediante MCP no comprobados. |
| F07 | Pasa, core | Relación `supersedes` excluyó la pareja. |
| F08 | Parcial | Snapshot lógico de ID, estado y fecha de memorias sin cambios tras consultas normal y fallida; no se compararon todos los campos ni relaciones. |
| F09 | Parcial | Puntuación/comillas y acento aceptados; contexto cancelado devolvió error. No es cobertura exhaustiva de FTS. |
| F10 | Parcial | Respuestas repetidas iguales; no se verificó independientemente el desempate por ID. |

El fixture funcional ajustó directamente fechas/estados y una relación con el
store de prueba abierto únicamente para simular estados; no cambió contenido ni
el índice FTS. No se validaron concurrencia/snapshot bajo escritura simultánea,
uso de memoria, comportamiento MCP ni rendimiento representativo. Los fixtures
funcionales permanecen en `test2.sqlite` junto con el corpus.

## Próximo paso recomendado

Priorizar una evaluación reproducible en CI y ampliar los casos antes de ajustar
ranking. La evidencia apunta a tres oportunidades concretas: normalización
coherente de acentos entre recuperación y evidencia, selección de términos que
no descarte el final de memorias largas y reducción del ruido de candidatos
compatibles. Mantener revisión humana y comparar contra esta línea base;
ningún umbral de aceptación se fijó todavía.
