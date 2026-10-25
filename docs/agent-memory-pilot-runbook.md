# Runbook del piloto de Agent Memory nativo

**Objetivo:** validar el binario Go empaquetado en dos repositorios consumidores y dos hosts MCP reales antes de promoverlo como runtime principal.

**No registrar:** secretos, tokens, credenciales, información personal innecesaria ni transcripciones completas. Los ejemplos de memoria deben ser datos de prueba.

## Criterio de aprobación

El piloto se aprueba cuando los dos repositorios y los dos hosts recuperan memoria tras reiniciar usando un artefacto de release verificado. En cada repositorio deben funcionar también backup, upgrade, rollback y desinstalación sin perder la memoria de prueba.

**Resultado reportado al 2026-10-25:** runbook completado correctamente en
Windows. La ejecución real en Linux queda pendiente por ahora. Los checks Linux
de GitHub Actions siguen siendo el gate automatizado de build e instalación;
no cuentan como una prueba con un host MCP real en Linux.

## Registro de ejecución

Completá una fila por combinación de repositorio y host.

| Repositorio | Host MCP      | Plataforma | Versión del binario | Fecha | Responsable | Resultado | Incidencias |
| ----------- | ------------- | ---------- | ------------------- | ----- | ----------- | --------- | ----------- |
|             | Codex         |            |                     |       |             |           |             |
|             | Segundo host: |            |                     |       |             |           |             |
|             | Codex         |            |                     |       |             |           |             |
|             | Segundo host: |            |                     |       |             |           |             |

## 1. Preparar y verificar el binario

1. Descargá el archivo de release aprobado para tu plataforma junto con su manifiesto, checksums, firma y clave pública.
2. Verificá que el hash, plataforma, arquitectura y versión del manifiesto coincidan con el archivo descargado.
3. Verificá la firma usando la herramienta aprobada por el canal interno. No uses para distribución un artefacto de CI con firma efímera.
4. Extraé el binario en un directorio incluido en `PATH` y confirmá la versión:

   ```powershell
   ytk-memory --version
   ```

En Windows, el hash del archivo se puede comprobar así:

```powershell
Get-FileHash .\ytk-memory_0.1.0_windows_amd64.zip -Algorithm SHA256
Get-Content .\ytk-memory_0.1.0_checksums.txt
```

En Linux:

```bash
sha256sum -c ytk-memory_0.1.0_checksums.txt
```

## 2. Instalar en el primer repositorio consumidor

Desde la raíz del repositorio:

```powershell
ytk-memory setup codex --dry-run
ytk-memory setup codex
ytk-memory doctor --json
```

Antes de aplicar `setup`, comprobá que el plan no sobrescribe configuración ajena. `doctor --json` debe incluir `"healthy": true` y checks `ok` para la base y el registro MCP de Codex. En la salida legible (sin `--json`), el equivalente es `Agent Memory · Todo en orden` y verificaciones marcadas con `✓`.

Confirmá que existen:

- `.ytk-memory.json`
- `.ytk-memory/ytk-memory.sqlite`
- el bloque administrado en `AGENTS.md`
- `.agents/skills/ytk-memory/SKILL.md`

## 3. Ejercitar el ciclo normal en Codex

1. Cerrá y abrí una sesión nueva de Codex en el repositorio.
2. Ejecutá `memory_session_start`.
3. Guardá una decisión de prueba con `subjectKey: "pilot/architecture"`.
4. Ejecutá `memory_search` con una consulta que encuentre esa decisión.
5. Guardá una actualización con la misma `subjectKey`.
6. Confirmá que la búsqueda devuelve la versión actualizada.
7. Ejecutá `memory_session_finish` con un resumen breve de prueba.
8. Intentá guardar texto que simule una credencial. La operación debe fallar y no debe persistir el contenido.

La herramienta MCP y el core usan `subjectKey`; SQLite lo almacena en la columna
`subject_key`. Repetir un guardado con la misma clave debe actualizar la memoria
activa existente.

El paso 7 también crea deliberadamente una memoria `summary` separada, con
`subjectKey` igual a `session/<sessionId>`. No reemplaza ni duplica la memoria
`pilot/architecture`: conserva el resumen de cierre bajo la identidad de esa
sesión. Si en una tarea no hace falta persistir un resumen, `summary` es
opcional; finalizá la sesión enviando solo `sessionId`.

Anotá el resultado y el tiempo aproximado de la tarea.

## 4. Comprobar persistencia tras reiniciar

1. Cerrá Codex por completo.
2. Volvé a abrirlo en el mismo repositorio.
3. Abrí una sesión nueva y ejecutá `memory_search` para `pilot/architecture`.

La memoria guardada antes del reinicio debe aparecer.

## 5. Comprobar backup, upgrade y rollback

Desde la raíz del repositorio:

```powershell
ytk-memory backup --to .ytk-memory/pilot-backup.sqlite
ytk-memory upgrade --backup-to .ytk-memory/pilot-pre-upgrade.sqlite
ytk-memory rollback `
  --from .ytk-memory/pilot-pre-upgrade.sqlite `
  --backup-current-to .ytk-memory/pilot-before-rollback.sqlite `
  --confirm
ytk-memory doctor
```

Después de cada operación, abrí una sesión MCP nueva y buscá `pilot/architecture`. La memoria debe permanecer disponible.

## 6. Comprobar desinstalación y reinstalación

Primero revisá el plan:

```powershell
ytk-memory uninstall codex --dry-run
```

Después ejecutá:

```powershell
ytk-memory uninstall codex
```

Confirmá que se retiraron sólo los bloques administrados, que la base SQLite permanece y que la configuración ajena no cambió. Ejecutá de nuevo `ytk-memory setup codex`, reiniciá Codex y verificá que `pilot/architecture` sigue disponible.

## 7. Validar un segundo host MCP

En el repositorio consumidor, generá el manifiesto portable:

```powershell
ytk-memory setup codex --portable
```

Registrá el comando y los argumentos de `.ytk-memory/mcp.json` en la configuración del segundo host compatible con MCP por `stdio`. Reiniciá ese host y repetí:

1. iniciar sesión;
2. guardar una memoria de prueba;
3. buscarla;
4. finalizar la sesión;
5. reiniciar el host y volver a buscarla.

## 8. Repetir en el segundo repositorio consumidor

Repetí las secciones 2 a 7 en otro repositorio real. Usá un `subjectKey` distinto, por ejemplo `pilot/<nombre-del-repositorio>/architecture`, para distinguir las evidencias.

## Cierre del piloto

Documentá para cada fallo: paso, versión del binario, plataforma, host, mensaje de error, si la base se mantuvo íntegra y cómo se recuperó. Si todos los criterios pasan, actualizá el estado del proyecto. Go es el único runtime de Agent Memory.
