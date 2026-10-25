# Política de firma, rotación y revocación

Esta política gobierna el canal aprobado de distribución del binario nativo
`ytk-memory`. Los artefactos de smoke tests firmados con `--ephemeral-key` no
pertenecen a este canal.

## Material de firma

- `YTK_MEMORY_SIGNING_PRIVATE_KEY` es una clave Ed25519 privada, de 64 bytes
  codificados en hexadecimal. Se guarda únicamente como secreto de Actions con
  acceso limitado al workflow de releases. No se copia al repositorio, issues,
  logs ni documentación.
- `YTK_MEMORY_SIGNING_PUBLIC_KEY` es la clave pública correspondiente, de 32
  bytes codificados en hexadecimal. Se configura como variable de repositorio.
  Es pública y permite que el workflow rechace una firma emitida con otra clave.
- Una persona autorizada genera y conserva una copia de recuperación cifrada de
  la clave privada fuera de GitHub. El acceso y la recuperación se registran en
  el sistema operativo de la organización, sin incluir el secreto en este repo.

## Publicación aprobada

1. Configurar primero el secreto y la variable pública correspondiente.
2. Ejecutar un tag semántico `vMAJOR.MINOR.PATCH` desde un commit validado.
3. La CI valida Windows, Linux y macOS arm64, empaqueta cada artefacto y compara
   la clave pública emitida con la variable configurada.
4. Antes de publicar, la CI verifica checksum y firma de cada artefacto.
5. El release publica juntos el archivo, manifiesto, firma, clave pública y
   checksum. La nota del release declara la huella SHA-256 de la clave pública.

Quien instala debe usar una clave pública obtenida de un canal confiable del
proyecto y ejecutar `ytk-memory release verify` antes de instalar. La clave que
acompaña un artefacto sirve para la verificación técnica; la confianza inicial
proviene de la clave pública publicada por el proyecto.

## Rotación

La rotación es obligatoria ante cambio de responsables, sospecha de exposición
o cada doce meses como máximo. Para rotar:

1. Generar un nuevo par Ed25519 fuera del repositorio.
2. Actualizar secret y variable pública en el mismo cambio administrativo.
3. Publicar un release con la nueva clave y una nota que incluya las huellas de
   la clave anterior y la nueva, la fecha de transición y el motivo.
4. Mantener disponible la clave pública anterior para verificar releases ya
   publicados. No se vuelven a firmar artefactos históricos.

## Revocación

Ante compromiso confirmado o probable, se detiene la publicación y se revoca la
clave afectada. Se publica un aviso de seguridad con su huella, el rango de
releases afectado, instrucciones para verificar instalaciones y la clave nueva.
El secreto comprometido se elimina de GitHub después de reemplazarlo. Los
releases afectados se marcan como retirados; no se eliminan sus metadatos de
verificación sin dejar una referencia al aviso.

## Primer release

El workflow de tags no puede configurar por sí mismo la custodia de claves. Antes
del primer tag aprobado, una persona responsable debe:

1. Generar el par Ed25519 fuera del repositorio y verificar que la clave pública
   corresponda a la clave privada.
2. Guardar una copia de recuperación cifrada fuera de GitHub y limitar quién
   puede acceder al secreto de Actions.
3. En **Settings → Secrets and variables → Actions** del repositorio, crear el
   secret `YTK_MEMORY_SIGNING_PRIVATE_KEY` (64 bytes hex) y la variable
   `YTK_MEMORY_SIGNING_PUBLIC_KEY` (32 bytes hex). La privada no debe colocarse
   en archivos del repo, variables públicas, logs, issues ni conversación.
4. Revisar que la huella pública coincide con la nota prevista del release.
   El job compara automáticamente la clave pública del artefacto con la
   variable y falla si difieren.
5. Crear un tag semántico `vMAJOR.MINOR.PATCH` desde un commit revisado. La CI
   valida tests/build, empaqueta las tres plataformas, verifica la firma y el
   smoke test de versión; sólo después publica GitHub Release.
6. Descargar los artefactos publicados y ejecutar `ytk-memory release verify`
   antes de distribuirlos a repos consumidores.

El workflow y el código de empaquetado ya están implementados. La activación
real sólo se completa cuando el secret, la variable y el primer tag aprobado
existen en el repositorio. No registrar material privado en este documento.
