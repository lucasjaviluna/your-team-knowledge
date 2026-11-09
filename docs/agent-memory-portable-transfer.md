# Transferencia portable v1

Permite transferir memorias seleccionadas entre proyectos locales mediante
JSON. No reemplaza el backup SQLite ni implementa sincronización. El archivo
contiene el texto de las memorias: protegé su almacenamiento y distribución.
No se cifra ni se firma, y el token de vista previa no autentica el origen.

## Flujo CLI

Ejecutar desde el proyecto correspondiente o fijar explícitamente `--project`,
`--database` y, cuando corresponda, `--area`. Primero listar IDs con
`ytk-memory list --json`. Seleccionar sólo memorias que corresponda compartir.

```text
ytk-memory portable-export --project origen --database origen.sqlite --ids id1,id2 --to export.json
ytk-memory portable-preview --project destino --database destino.sqlite --from export.json
ytk-memory portable-import --project destino --database destino.sqlite --from export.json --token TOKEN_DEL_PREVIEW --confirm
```

Los comandos devuelven JSON. Revisá las entradas y relaciones informadas en el
preview y el contenido del archivo antes de confirmar. `new` se insertará;
`unchanged` ya fue importada y sigue sin cambios; `blocked` requiere
revisión y bloquea toda la aplicación. No se corrige ni fusiona automáticamente.
Una modificación del archivo o del estado del proyecto destino invalida el token:
volver a pedir preview. El token no vence por tiempo, pero la elegibilidad de
lifecycle se comprueba nuevamente durante la aplicación.

El destino debe existir y tener el esquema migrado; el preview abre SQLite en
modo de sólo lectura y no ejecuta migraciones. Ejecutar doctor y el procedimiento
de upgrade respaldado si corresponde. El export crea la identidad de origen si
falta y no sobrescribe el destino; el archivo temporal se crea en el mismo
directorio, se sincroniza y se publica mediante enlace sin reemplazo. Si el
sistema de archivos no admite ese mecanismo, el comando falla sin sobrescribir.
Los permisos del archivo dependen también de la plataforma y de su directorio.

Se exportan sólo memorias activas, vigentes y visibles, y relaciones entre
memorias seleccionadas. Relaciones hacia fuera de la selección se omiten; la
salida no informa su cantidad. El archivo no contiene sesiones ni configuración.
Se preservan `validFrom`, `expiresAt` y `reviewAt` en el destino,
normalizados a UTC con precisión de milisegundos; fechas de creación y
actualización del archivo son de origen, las filas importadas reciben fechas
locales. La v1 limita el archivo a 8 MiB, 1000 memorias, 5000 relaciones y 16
niveles de JSON. Rechaza claves duplicadas, campos desconocidos, contenido
sensible detectado, referencias inválidas y versiones incompatibles.

Una copia/restauración conserva la identidad del origen. La v1 no dispone de un
comando para regenerar esa identidad ni importa a un destino con el mismo
namespace. Para un proyecto independiente, configurar una base/proyecto nuevo.
Al repetir la importación, cambios de origen o modificaciones locales bloquean
la operación; no se aplica un merge. Para recuperación integral seguir usando
`backup`, `upgrade` y `rollback`.
