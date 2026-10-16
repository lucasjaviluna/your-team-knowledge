# Desarrollo local

## Requisitos

- Node.js 22 o superior.
- npm 10 o superior.
- Docker Desktop, para ejecutar PostgreSQL con pgvector.

## Inicio rápido

1. Copiar `.env.example` como `.env` y ajustar valores si fuera necesario.
2. Ejecutar `npm install`.
3. Ejecutar `docker compose up -d postgres`.
4. Validar el contrato y el orden de las migraciones con `npm run migrations:check`.
5. Aplicar las migraciones con `docker compose exec -T postgres psql -U knowledge -d corporate_knowledge -f /migrations/001-knowledge-schema.sql`, luego `002-embedding-dimension-and-index.sql` y finalmente `003-audit-events.sql`.
6. Validar la base técnica con `npm run lint`, `npm run typecheck` y `npm test`.

Para validar el producto de Agent Memory sin PostgreSQL, ejecutar `npm run test:mcp-smoke`. Para probarlo manualmente, compilar y luego iniciar `node dist/mcp-server.js --project proyecto-prueba`; la base se crea por defecto en `.team-memory/agent-memory.sqlite`.

La instancia local de PostgreSQL habilita la extensión `vector` al inicializarse. Las migraciones se mantienen en `infrastructure/postgres/migrations` y se montan como solo lectura dentro del contenedor.

Si el puerto 5432 ya está ocupado, iniciar la instancia del proyecto en otro puerto. En PowerShell, por ejemplo: `$env:POSTGRES_PORT='55432'; docker compose up -d postgres`. Luego utilizar ese puerto en el `DATABASE_URL` del proceso local.

Para ejecutar también la prueba de integración PostgreSQL: `$env:DATABASE_URL='postgresql://knowledge:knowledge@localhost:55432/corporate_knowledge'; npm test`. Sin `DATABASE_URL`, esa prueba queda omitida y la suite usa únicamente dependencias locales.

El proveedor local de embeddings usa `Xenova/multilingual-e5-small` con Transformers.js. La primera ejecución descarga el modelo y lo deja en la caché del runtime. Para verificarlo después de compilar: `node --input-type=module -e "import { TransformersEmbeddingProvider } from './dist/infrastructure/embeddings/index.js'; const provider = new TransformersEmbeddingProvider({ dtype: 'q8' }); console.log((await provider.embedQuery('texto de prueba')).length);"`. El resultado esperado es `384`.

Para ejecutar el benchmark comparativo de modelos en PowerShell: `$env:RUN_EMBEDDING_BENCHMARK='1'; $env:EMBEDDING_BENCHMARK_RUNS='3'; npm run test:embedding-benchmark`. Descarga ambos modelos en la caché local y muestra `recallAtK`, precisión de la primera cita, latencias y RSS del proceso. `EMBEDDING_BENCHMARK_RUNS` permite separar la primera corrida en frío de las corridas posteriores en caliente. Sin `RUN_EMBEDDING_BENCHMARK=1`, el benchmark queda omitido.

## Límites actuales

La base técnica todavía no expone una API. Agent Memory ya persiste memorias en SQLite y Corporate Knowledge RAG cuenta con persistencia, búsqueda full-text, vectores de 384 dimensiones e índice HNSW en PostgreSQL; la API queda para las siguientes etapas.
