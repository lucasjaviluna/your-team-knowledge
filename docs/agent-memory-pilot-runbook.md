# Runbook de validación real de Agent Memory

**Objetivo:** medir la utilidad del briefing y la búsqueda en repositorios y
hosts MCP usados por el equipo, y comprobar persistencia y recuperación con el
release firmado.

**Release de referencia:** `v0.1.12`. Si se aprueba uno más reciente antes de
ejecutar el piloto, usá esa versión y anotala en el registro.

**No registrar:** claves, tokens, credenciales, datos personales innecesarios ni
transcripciones completas. Usá decisiones y ejemplos revisados o preparados
para la prueba.

## Criterios de aprobación

El piloto cubre dos repositorios consumidores y dos hosts MCP: cuatro
combinaciones repo-host. Se aprueba cuando:

- `doctor` informa `healthy: true` en las cuatro combinaciones.
- Cada host inicia el servidor MCP, guarda y encuentra memorias del repo
  correspondiente.
- Las memorias sobreviven al cierre completo y reinicio del host.
- No aparecen resultados de un repositorio al consultar desde el otro.
- Backup, upgrade, rollback y desinstalación/reinstalación conservan la memoria
  de prueba.
- La evaluación manual de relevancia y ruido cumple el umbral acordado antes
  de empezar. Como línea base sugerida, al menos 80% de las consultas positivas
  deben devolver una memoria esperada entre los primeros cinco resultados. El
  corpus y la cantidad de consultas deben quedar anotados junto con el resultado.

## 0. Elegir el alcance y preparar repositorios

Elegí dos repositorios reales en los que el equipo trabaje habitualmente y dos
hosts MCP que use. Por ejemplo, Codex y Claude Code. La tabla representa las
cuatro ejecuciones necesarias:

| ID | Repo consumidor | Host MCP | SO | Responsable | Estado |
| --- | --- | --- | --- | --- | --- |
| A1 | por completar | Codex | Windows x64 | | |
| A2 | por completar | segundo host | Windows x64 | | |
| B1 | por completar | Codex | Windows x64 | | |
| B2 | por completar | segundo host | Windows x64 | | |

Usá un checkout de piloto o una rama de trabajo en cada repositorio. Así las
pruebas de upgrade, rollback y desinstalación no interfieren con el trabajo
diario. Ejecutá las combinaciones de forma secuencial; este runbook no mide
escrituras simultáneas, cubiertas por el PR 01 del
[plan de implementación](implementation-plan.md).

Para cada repo, seleccioná entre 5 y 10 decisiones, convenciones o hallazgos
útiles como memorias iniciales. Prepará de 5 a 10 consultas positivas y al menos
2 controles negativos que no deberían encontrar nada. Guardá una lista privada
de `subjectKey` esperadas y relevancia, sin copiar conversaciones completas.

## 1. Descargar y verificar el release

Descargá del release aprobado el paquete de tu plataforma y sus archivos
`.manifest.json`, `.sig`, `.pub` y `.sha256`. En Windows x64, los nombres siguen
este patrón:

```text
ytk-memory_0.1.12_windows_amd64.zip
ytk-memory_0.1.12_windows_amd64.zip.manifest.json
ytk-memory_0.1.12_windows_amd64.zip.sig
ytk-memory_0.1.12_windows_amd64.zip.pub
ytk-memory_0.1.12_windows_amd64.zip.sha256
```

Desde el directorio donde descargaste los cinco archivos, compará el checksum
con el asset `.sha256`:

```powershell
$artifact = 'ytk-memory_0.1.12_windows_amd64.zip'
$expectedHash = ((Get-Content "$artifact.sha256") -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'El checksum del release no coincide.' }
```

Comprobá que el `.pub` corresponde a `YTK_MEMORY_SIGNING_PUBLIC_KEY`, la
variable pública del repositorio visible en **Settings → Secrets and variables
→ Actions → Variables**. No confíes únicamente en una clave descargada junto
con el artefacto. Después verificá manifiesto, hash y
firma con el binario verificador aprobado:

```powershell
ytk-memory release verify --artifact $artifact `
  --manifest "$artifact.manifest.json" `
  --signature "$artifact.sig" `
  --public-key "$artifact.pub"
```

El resultado esperado indica `Release verificado`. Extraé el ZIP, colocá
`ytk-memory.exe` en un directorio incluido en `PATH`, abrí una terminal nueva y
confirmá:

```powershell
ytk-memory --version
```

Debe devolver `0.1.12` (o la versión más nueva que hayas elegido). Para Linux,
usá el paquete `.tar.gz` con `linux_amd64`; para macOS arm64, el paquete
`.tar.gz` con `darwin_arm64`. Aplicá los mismos pasos de verificación con el
nombre del paquete correspondiente.

## 2. Instalar en cada repositorio y host

Desde la raíz del repo consumidor, reemplazá `codex` por el host de cada fila
(`claude`, `pi` u `opencode`):

```powershell
$provider = 'codex'
ytk-memory setup $provider --dry-run
```

Revisá el plan antes de aplicarlo. Debe tocar sólo los archivos administrados
por Agent Memory y su registro MCP; resolvé manualmente cualquier colisión que
muestre el dry-run. Luego ejecutá:

```powershell
ytk-memory setup $provider
ytk-memory doctor --host $provider --json
```

`doctor` debe devolver `"healthy": true` y checks satisfactorios para la base y
el registro del host. Confirmá que existen `.ytk-memory.json`,
`.ytk-memory/ytk-memory.sqlite` y las instrucciones/archivos administrados por
ese host. Si Codex, Claude Code, Pi u OpenCode pide confiar o aprobar el MCP,
hacelo y reiniciá el host antes de continuar.

Registrá una fila por ejecución en la tabla del paso 0. Para dos hosts dentro
del mismo repo, ambos deben acceder a la misma base local del proyecto. Ejecutá
un host a la vez.

## 3. Cargar memorias de prueba y comprobar la búsqueda

En el primer host de cada repo, iniciá una sesión nueva y pedile que guarde de
5 a 10 memorias revisadas. Usá claves distintas por repo, por ejemplo:

```text
pilot/repo-a/architecture
pilot/repo-a/testing
pilot/repo-a/deployment
```

Para cada memoria, registrá el `subjectKey`, el hecho esperado y qué consultas
deberían recuperarla. No uses identificadores de host en la clave: ambos hosts
del mismo repo deben poder leer la misma memoria.

Ejecutá la lista de consultas positivas y controles negativos en sesiones
nuevas. Incluí consultas con frase exacta, paráfrasis y términos relacionados.
Para cada consulta anotá los `subjectKey` recuperados en los primeros cinco
resultados, cuáles eran relevantes, si faltó la memoria esperada y la latencia
aproximada.

Repetí las mismas consultas con el segundo host del repo. Debe recuperar las
memorias guardadas por el primero, ya que ambos usan la base del proyecto.
Anotá también si el host inicia bien, muestra las herramientas MCP y puede
completar inicio, búsqueda, guardado y cierre de sesión.

## 4. Medir utilidad en tareas reales

Elegí al menos cinco tareas recientes por repo en las que una decisión o
convención guardada debería cambiar la respuesta. Escribí el objetivo de cada
tarea sin incluir la respuesta esperada en el prompt. En una sesión limpia del
host:

1. Ejecutá la tarea con Agent Memory habilitado.
2. Anotá qué memoria usó el agente y si la respuesta respetó el contexto.
3. Calificá el resultado: `2` correcto y útil, `1` parcialmente útil, `0`
   incorrecto o sin utilidad.
4. Si es viable, repetí la misma tarea en un checkout de control sin MCP,
   también en sesión limpia, y calificá con la misma escala.

Compará calidad, tiempo aproximado y resultados irrelevantes. El control sirve
para ver si el recuerdo cambia la respuesta; no reemplaza el criterio humano.
No concluyas que una respuesta fue mejor sólo porque el agente citó una memoria:
debe haber aplicado correctamente el hecho al trabajo.

## 5. Comprobar persistencia y aislamiento

En cada repo y host:

1. Cerrá el host por completo.
2. Volvé a abrir el mismo repo y el host.
3. Iniciá una sesión nueva y buscá los `subjectKey` de prueba.
4. Confirmá que los resultados siguen allí.

Luego, desde el repo A, buscá un término único guardado sólo en el repo B y
viceversa. Ninguna consulta debe exponer memorias del otro proyecto. Registrá
cualquier filtración como fallo bloqueante del piloto.

## 6. Comprobar backup, upgrade y rollback

Hacé este paso sólo en los checkouts de piloto, después de guardar las memorias.
Desde la raíz del repo:

```powershell
ytk-memory backup --to .ytk-memory/pilot-backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pilot-pre-upgrade.sqlite
ytk-memory doctor --json
```

Abrí una sesión nueva y confirmá que las memorias de prueba siguen disponibles.
Después probá rollback con el backup creado por upgrade; esto reemplaza el
estado activo de la base y por eso el comando genera una copia de seguridad
adicional antes de hacerlo:

```powershell
ytk-memory rollback `
  --from .ytk-memory/pilot-pre-upgrade.sqlite `
  --backup-current-to .ytk-memory/pilot-before-rollback.sqlite `
  --confirm
ytk-memory doctor --json
```

Abrí otra sesión y buscá de nuevo las memorias. Deben permanecer disponibles.
Guardá los nombres/rutas de los backups en el registro, pero no subas bases que
contengan datos reales al repositorio.

## 7. Comprobar desinstalación y reinstalación

Revisá primero el plan:

```powershell
ytk-memory uninstall $provider --dry-run
```

Si sólo retira configuración administrada por el host, aplicá la
desinstalación:

```powershell
ytk-memory uninstall $provider
```

Confirmá que se retiraron sus entradas/bloques administrados, que la base
`.ytk-memory/ytk-memory.sqlite` permanece y que la configuración ajena no
cambió. Reinstalá y validá:

```powershell
ytk-memory setup $provider
ytk-memory doctor --host $provider --json
```

Reiniciá el host y comprobá que las memorias previas siguen disponibles.

## 8. Registrar resultados y cerrar

Usá una fila por repo-host en la tabla inicial. Para cada consulta agregá una
fila con este formato:

| Repo | Host | Caso | Tipo (positiva/control/tarea) | Esperado | Top 5 | Relevancia | Latencia | Nota |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

Para cada incidencia registrá paso, versión, SO, host, resultado esperado,
resultado observado, integridad de la base y recuperación aplicada. No copies
transcripciones ni contenido confidencial.

El piloto queda aprobado si las cuatro combinaciones superan los criterios del
inicio. Si una falla, corregí el problema, repetí el caso y actualizá la
evidencia. Al cerrar, actualizá `docs/current-status.md` con el alcance real de
la validación; los checks Linux de GitHub Actions no cuentan como uso real en
un host Linux.
