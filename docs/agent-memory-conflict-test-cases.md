# Corpus sintético: candidatos a conflicto v1

**Estado:** casos propuestos; no son resultados de una ejecución. Textos
ficticios sin datos sensibles. Cada caso se ejecuta en una base nueva y aislada.
Usar `type: decision`, sin `subjectKey` y sin etiquetas de área, salvo que
se indique lo contrario. Cargar la base primero y cada candidato después con
`memory_save`; registrar el `entryId` asignado para cada alias. No pasar el
alias como ID de la herramienta: `memory_save` genera sus propios IDs.

**Etiquetas humanas:** R = merece revisión conjunta por posible incompatibilidad;
C = compatible, no relevante para esta evaluación; N = tema no relacionado.
Las etiquetas son juicios del corpus, no resultados garantizados. La herramienta
puede devolver C o N porque recupera similitud, y puede omitir R. Se evalúan los
IDs devueltos, no se exige que los candidatos sean clasificados por la herramienta.

## C01 — Negación explícita

- Base B: título «Retención de backups»; contenido «Los backups de Aurora se conservan 30 días.»
- R1: título «Retención de backups»; contenido «Los backups de Aurora se conservan 90 días.» **R**: dos duraciones para el mismo alcance.
- C1: título «Retención de backups»; contenido «Los backups de Aurora se conservan durante 30 días.» **C**.
- N1: título «Tipografía del portal»; contenido «El portal utiliza fuente serif.» **N**.

## C02 — Switch booleano

- B: «Database encryption»; «Production database encryption is enabled.»
- R1: «Database encryption»; «Production database encryption is disabled.» **R**.
- C1: «Database encryption»; «Production database encryption is enabled at rest.» **C**.
- N1: «Office temperature»; «Keep the meeting room cool.» **N**.

## C03 — Alcance distinto

- B: «Autenticación de servicios»; «Las solicitudes públicas usan autenticación obligatoria.»
- C1: «Autenticación de servicios»; «Las solicitudes internas no requieren autenticación.» **C**: ámbitos distintos.
- C2: «Autenticación de servicios»; «Las solicitudes públicas usan autenticación obligatoria.» **C**.
- N1: «Almacenamiento de imágenes»; «Las fotografías usan formato PNG.» **N**.

## C04 — Parafraseo sin vocabulario común

- B: «Caducidad de credenciales»; «Las claves de acceso dejan de valer después de una jornada.»
- R1: «Vigencia de tokens»; «Cada token permanece válido durante siete semanas.» **R**: para este caso ambos textos se refieren a la misma credencial; esa premisa no está expresada en el texto y puede causar una omisión legítima.
- N1: «Riego de jardines»; «La manguera funciona siete minutos.» **N**.

## C05 — Variantes de acentuación

- B: «Configuración del módulo»; «La región estándar del módulo es Córdoba.»
- R1: «Configuracion del modulo»; «La region estandar del modulo es Mendoza.» **R**.
- C1: «Configuración del módulo»; «La región estándar del módulo es Córdoba.» **C**.

## C06 — Español e inglés

- B: «Deployment region»; «The service runs only in Europe.»
- R1: «Región de despliegue»; «El servicio funciona solamente en Asia.» **R**: ambos describen el mismo servicio por definición del caso.
- C1: «Deployment region»; «The service runs only in Europe.» **C**.

## C07 — Cambio temporal compatible

- B: «Plan de despliegue 2026»; «Durante 2026 el despliegue es semanal.»
- C1: «Plan de despliegue 2027»; «Durante 2027 el despliegue es diario.» **C**: intervalos distintos.
- R1: «Plan de despliegue 2026»; «Durante 2026 el despliegue es diario.» **R**.

## C08 — Números y operadores

- B: «Retry policy»; «The gateway allows at most 3 retries.»
- R1: «Retry policy»; «The gateway allows at least 5 retries.» **R**.
- C1: «Retry policy»; «The gateway allows up to 3 retries.» **C**.

## C09 — Ruido léxico

- B: «Cache invalidation»; «The cache refreshes every hour.»
- R1: «Cache invalidation»; «The cache refreshes every day.» **R**.
- C1: «Cache invalidation»; «The cache refreshes every hour.» **C**.
- C2: «Cache invalidation»; «The cache refreshes every hour and records metrics.» **C**.
- N1: «Cache of paintings»; «The gallery stores a cache of paintings.» **N**: homónimo; no describe software.

## C10 — Sin términos útiles

- B: «Y o»; «En el y la.»
- N1: «Mensajería»; «El servicio envía correos.» **N**.
- No hay R; se espera salida vacía para esta base sin términos de tres o más
  letras fuera de la lista de exclusión. Usar este caso como prueba funcional,
  no incluirlo en el promedio de recall.

## C11 — Contexto adicional y sesgo de posición

- B: «Política de publicación»; «Alfa bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike noviembre oscar papa. El artefacto se firma con Ed25519.»
- R1: «Firma Ed25519»; «El artefacto se publica sin firma Ed25519.» **R**.
- C1: «Política de publicación»; «Alfa bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike noviembre oscar papa.» **C**.
- La base contiene más de 16 términos; registrar si la señal aparece dentro o
  fuera del conjunto examinado, sin suponer que R1 será recuperada.

## C12 — Misma entidad, afirmaciones compatibles

- B: «Política de backup Atlas»; «El backup Atlas se ejecuta cada noche.»
- C1: «Política de backup Atlas»; «El backup Atlas se conserva 30 días.» **C**: frecuencia y retención pueden coexistir.
- C2: «Política de backup Atlas»; «El backup Atlas se ejecuta cada noche.» **C**.
- N1: «Calendario lunar»; «La luna aparece por la noche.» **N**.
- No hay R; registrar propuestas irrelevantes y no calcular recall de este caso.
