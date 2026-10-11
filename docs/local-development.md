# Desarrollo local

## Requisitos

- Node.js 22 o superior.
- npm 10 o superior.
- Docker Desktop, para ejecutar PostgreSQL con pgvector.

## Inicio rápido

1. Copiar `.env.example` como `.env` y ajustar valores si fuera necesario.
2. Ejecutar `npm install`.
3. Ejecutar `docker compose up -d postgres`.
4. Validar la base técnica con `npm run lint`, `npm run typecheck` y `npm test`.

La instancia local de PostgreSQL habilita la extensión `vector` al inicializarse. Su uso funcional comienza en la etapa de Corporate Knowledge RAG.

## Límites actuales

La base técnica todavía no expone una API ni persiste memorias o documentos. Esos comportamientos se implementarán en las siguientes etapas.
