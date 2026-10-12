# API de transporte HTTP

La primera capa de transporte usa `node:http` y delega toda la lógica en los servicios de aplicación. El servidor se crea con `createKnowledgeHttpServer`, por lo que el proceso que lo hospeda conserva el control sobre puerto y ciclo de vida. La fábrica recibe un autenticador/autorizador y un `AuditSink`.

## Seguridad

Las rutas de escritura y consulta requieren `Authorization: Bearer <token>`. El token se resuelve a un principal con `actorId`, equipos y workspaces permitidos. El `actorId` y los equipos del cuerpo no se utilizan para autorizar la consulta: se toman del principal autenticado. Las operaciones fuera del workspace autorizado responden `403`.

Todas las respuestas incluyen `X-Request-Id`. El servidor conserva el valor enviado por el consumidor cuando no supera 200 caracteres y genera uno cuando no se proporciona. Ese identificador se persiste en los eventos de auditoría.

Los consumidores TypeScript pueden usar `KnowledgeHttpClient`, que ofrece `health()`, `query()` e `ingestMarkdown()`. El cliente admite token asíncrono, timeout configurable y expone el `requestId` del servidor en `KnowledgeApiError`.

Las respuestas HTTP incluyen `X-Request-Id` y `Server-Timing: app;dur=<milisegundos>`. Los eventos de auditoría exitosos y fallidos conservan la misma duración en `metadata.durationMs`, sin registrar payloads, tokens ni credenciales.

## Rutas

### `GET /health`

Liveness del proceso. No requiere autenticación ni consulta dependencias; devuelve `{ "status": "ok" }` cuando el servidor puede atender requests.

### `GET /ready`

Readiness operacional. No requiere autenticación. En el servidor ejecutable consulta PostgreSQL y el almacén de auditoría; devuelve `200` con `status: "ready"` o `503` con `status: "not_ready"`. La fábrica permite inyectar un check de readiness para otros despliegues.

Respuesta:

```json
{ "status": "ok" }
```

### `POST /v1/knowledge/query`

Solicitud:

```json
{
  "workspaceId": "workspace-checkout",
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

La respuesta devuelve el documento y los chunks sin exponer los vectores internos. La operación requiere autorización sobre el workspace.

### `POST /v1/context`

Solicitud:

```json
{
  "workspaceId": "workspace-checkout",
  "query": "¿Qué decidimos sobre despliegues?",
  "maxTokens": 1200,
  "maxChars": 4800,
  "includeMemory": true,
  "includeKnowledge": true
}
```

El servidor obtiene `actorId` y `teamIds` del principal autenticado. El `ContextOrchestrator` clasifica la intención, combina memoria local y conocimiento autorizado, y devuelve `ContextBundle` con `contextText`, citas, intención, `estimatedTokens` y `truncated`. `maxTokens` usa una estimación conservadora; `maxChars` continúa disponible como límite superior.

## Auditoría

Las consultas, resoluciones de contexto, ingestas exitosas, denegaciones y errores pueden persistirse mediante `PostgresAuditLog` en la tabla `audit_events`. El evento incluye acción, resultado, actor, workspace, recurso, `requestId` y metadatos mínimos como cantidad de resultados, citas, memorias, tokens estimados o chunks.

## Errores

Los errores de validación o rutas no soportadas se devuelven inicialmente como JSON con `{ "error": "..." }`. El transporte actual usa `400` para errores de entrada o de aplicación, `401` sin autenticación, `403` sin autorización, `404` para rutas desconocidas y `405` para métodos no soportados.
