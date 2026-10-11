# Despliegue

La plataforma se ejecuta como un proceso Node.js que expone la API HTTP y usa PostgreSQL para el conocimiento corporativo y los eventos de auditoría. El modelo de embeddings se carga mediante Transformers.js/ONNX en el proceso de la API.

## Ejecución local

1. Aplicar las migraciones SQL en orden (`001`, `002`, `003`).
2. Definir `DATABASE_URL` y `API_TOKENS_JSON` a partir de `.env.example`.
3. Ejecutar `npm run build` y luego `npm start`.

`API_TOKENS_JSON` es un adaptador de desarrollo. Su formato es un mapa de token a principal, por ejemplo:

```json
{
  "dev-token": {
    "actorId": "developer",
    "teamIds": ["platform"],
    "workspaceIds": ["default"]
  }
}
```

En un entorno corporativo, el servidor debe recibir una implementación de `BearerIdentityResolver` que valide el token contra el proveedor de identidad y devuelva el principal con sus equipos y espacios de trabajo. El núcleo de la API no depende de un proveedor específico.

## Variables principales

- `DATABASE_URL`: conexión a PostgreSQL.
- `AGENT_MEMORY_DATABASE`: ruta de la base SQLite de Agent Memory; por defecto `./agent-memory.sqlite`.
- `HOST` y `PORT`: interfaz y puerto HTTP; por defecto `0.0.0.0:3000`.
- `EMBEDDING_DTYPE`: tipo de cuantización aceptado por Transformers.js, por ejemplo `q8`.
- `EMBEDDING_LOCAL_ONLY=1`: evita descargas y requiere que el modelo ya exista en la caché local.
- `API_TOKENS_JSON`: tokens de desarrollo; no usar como mecanismo de identidad corporativa en producción.

## Contenedor

El `Dockerfile` compila la aplicación y crea una imagen runtime mínima. La caché del modelo no se incluye en la imagen; para despliegues sin salida a internet hay que precargarla en la imagen o montar una caché compatible y activar `EMBEDDING_LOCAL_ONLY=1`.

El consumidor TypeScript puede usar `KnowledgeHttpClient` desde `src/adapters`, por lo que una integración posterior con pi-harness no necesita compartir runtime ni lenguaje con el servidor.
