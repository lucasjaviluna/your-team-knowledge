# ADR 0010: Canal confiable para releases nativos

## Estado

Aceptada e implementada inicialmente.

## Contexto

El binario Go debe poder descargarse, instalarse y verificarse sin confiar en
un archivo generado localmente o en un artefacto efímero de CI. El runtime no
debe incorporar servicios externos ni dependencias de Node para empaquetar.

## Decisión

`ytk-memory release package` construye el binario con `CGO_ENABLED=0`,
`-trimpath` y build id vacío, lo empaqueta como ZIP en Windows o tar.gz en
Linux/macOS y genera un manifiesto con versión, plataforma, formato, SHA-256,
versión de esquema y protocolo. El manifiesto se firma con Ed25519.

Los releases aprobados requieren `YTK_MEMORY_SIGNING_PRIVATE_KEY` persistente,
custodiada como secreto del job protegido. La opción `--ephemeral-key` existe
sólo para smoke tests y declara el manifiesto como efímero; esos artefactos no
son un canal de distribución aprobado. `ytk-memory release verify` valida
nombre, SHA-256, clave pública confiable y firma antes de instalar.

## Consecuencias

- Los consumidores pueden verificar un artefacto sin ejecutar el binario.
- El canal distingue una firma persistente de una firma temporal de CI.
- La rotación o revocación de la clave debe publicarse junto con la política de
  soporte del canal; no se acepta una clave nueva silenciosamente.
- El job de publicación debe ser el único que acceda al secreto y debe subir
  el artefacto, manifiesto, firma, clave pública y checksum juntos.
