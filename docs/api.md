# API de transporte HTTP

La primera capa de transporte usa `node:http` y delega toda la lógica en los servicios de aplicación. El servidor se crea con `createKnowledgeHttpServer`, por lo que el proceso que lo hospeda conserva el control sobre puerto, autenticación y ciclo de vida.

## Rutas

### `GET /health`

Respuesta:

```json
{ "status": "ok" }
```

### `POST /v1/knowledge/query`

Solicitud:

```json
{
  "workspaceId": "workspace-checkout",
  "actorId": "actor-alice",
  "teamIds": ["team-platform"],
  "query": "¿Cómo se aprueba un despliegue?",
  "limit": 10
}
```

El servicio genera el embedding de la consulta, aplica los filtros de acceso dentro de PostgreSQL y devuelve resultados junto con `SourceCitation`.

### `POST /v1/knowledge/documents`

Solicitud:

```json
{
  "source": {
    "id": "engineering-handbook",
    "kind": "markdown",
    "name": "Engineering Handbook"
  },
  "document": {
    "sourceId": "engineering-handbook",
    "externalId": "deployments/approval",
    "workspaceId": "workspace-checkout",
    "title": "Aprobación de despliegues",
    "content": "...",
    "accessPolicy": {
      "workspaceId": "workspace-checkout",
      "teamIds": ["team-platform"]
    }
  }
}
```

La respuesta devuelve el documento y los chunks sin exponer los vectores internos. La autenticación, autorización de la operación de escritura, rate limiting y auditoría de transporte quedan pendientes para la etapa de gobernanza.

## Errores

Los errores de validación o rutas no soportadas se devuelven inicialmente como JSON con `{ "error": "..." }`. El transporte actual usa `400` para errores de entrada o de aplicación, `404` para rutas desconocidas y `405` para métodos no soportados.
