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
- Sólo el job de empaquetado del workflow de releases accede al secreto. En un
  runner Linux compila secuencialmente los objetivos Linux amd64, Windows amd64
  y macOS arm64, comprueba cada paquete y sube los quince archivos en una sola
  operación a un GitHub Release en borrador. El job final descarga los activos,
  verifica manifiestos, firmas y checksums, y publica el borrador sólo cuando
  están presentes los tres objetivos y todas las verificaciones pasan.
- La CI compara la clave pública emitida con la variable pública
  `YTK_MEMORY_SIGNING_PUBLIC_KEY` antes de publicar, y verifica cada firma.
- La custodia, rotación y revocación se rigen por la
  [política de releases](../release-policy.md).
