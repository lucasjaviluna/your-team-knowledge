# ADR 0012: transferencia portable local versionada

- **Estado:** aceptado
- **Fecha:** 2026-11-09

## Contexto

Agent Memory necesita transferir memorias seleccionadas entre proyectos sin
acoplar el archivo a SQLite ni habilitar sincronización automática. La
importación debe conservar el aislamiento y los controles previos a persistir.

## Decisión

Se usa un documento JSON v1 validado por el core, con namespace aleatorio
persistido por proyecto de origen y mapeos de identidades por destino. Las
copias y backups conservan ese namespace. La exportación selecciona IDs
explícitos vigentes y visibles; las relaciones se incluyen sólo cuando ambos
extremos están seleccionados. El CLI publica un archivo nuevo sin sobrescribir.

La vista previa abre la base sin migrar y devuelve estados y un token que
vincula los bytes del archivo, proyecto, área y estado lógico del destino. La
importación exige ese token y confirmación, recalcula el plan dentro de una
transacción de escritura y rechaza colisiones o un plan obsoleto. Inserta
memorias, mapeos, relaciones y FTS de forma atómica; no sobrescribe ni fusiona
entradas existentes. Un origen repetido sin cambios se omite. El parser valida
límites, referencias y contenido sensible antes de persistir.

## Consecuencias

Una base heredada se migra en apertura normal; el doctor de sólo lectura informa
las tablas faltantes y la vista previa requiere un esquema actualizado. El
namespace se crea en la primera exportación y se conserva en backups o clones;
la v1 no ofrece regenerarlo, ni importar a un destino con la misma identidad.
El archivo no es backup integral, ni está cifrado o autenticado; la huella del
preview no es una firma. Identidad, colisiones y diferencias se tratan de forma
conservadora; sincronización y resolución automática quedan fuera del alcance.
Los metadatos de fecha de origen viajan en el archivo; el destino usa sus
propias fechas de creación/actualización y conserva los límites de vigencia.
