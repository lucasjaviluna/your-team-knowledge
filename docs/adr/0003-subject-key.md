# ADR 0003: subjectKey como identificador estable de memoria

## Estado

Aceptada.

## Decisión

`subjectKey` identifica el asunto estable de una memoria para agruparla, actualizarla y deduplicarla.

## Consecuencias

- Las nuevas interfaces y persistencias usan `subjectKey`.
- No se introducen nombres alternativos para la misma responsabilidad.
