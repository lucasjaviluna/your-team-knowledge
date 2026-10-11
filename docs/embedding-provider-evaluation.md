# Evaluación de proveedores de embeddings

> Documento vivo. La elección definitiva debe validarse con un pequeño dataset de consultas del dominio antes de fijar el esquema vectorial productivo.

## Criterios

- Calidad de recuperación en español y contenido potencialmente multilingüe.
- Huella de memoria y velocidad razonables en CPU.
- Licencia compatible con uso comercial.
- Integración sencilla con el núcleo TypeScript.
- Dimensión estable y adecuada para PostgreSQL/pgvector.
- Posibilidad de ejecutar sin depender de un servicio externo.

## Candidatos

| Opción                                                        | Dimensión | Cobertura                                                                         | Licencia                                        | Integración                       | Evaluación                                                                                                        |
| ------------------------------------------------------------- | --------: | --------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `intfloat/multilingual-e5-small`                              |       384 | Multilingüe, aproximadamente 100 idiomas; requiere prefijos `query:` y `passage:` | MIT                                             | Transformers.js, ONNX o FastEmbed | Mejor equilibrio para este proyecto. Multilingüe y orientado a retrieval, con vector pequeño.                     |
| `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |       384 | 50 idiomas                                                                        | Apache-2.0                                      | Transformers.js, ONNX o FastEmbed | Alternativa simple y liviana; más generalista y menos orientada específicamente a retrieval.                      |
| `BAAI/bge-small-en-v1.5`                                      |       384 | Inglés                                                                            | MIT                                             | Transformers.js, ONNX o FastEmbed | Muy buena línea base para corpus exclusivamente inglés; no es la opción principal si habrá español.               |
| `sentence-transformers/all-MiniLM-L6-v2`                      |       384 | Inglés                                                                            | Apache-2.0                                      | Transformers.js, ONNX o FastEmbed | La opción más pequeña/simple para prototipos en inglés; no recomendable como modelo corporativo multilingüe.      |
| `nomic-embed-text:v1.5` vía Ollama                            |       768 | Principalmente inglés                                                             | Revisar licencia del modelo antes de distribuir | HTTP/SDK contra Ollama            | Operacionalmente cómodo, pero requiere otro servicio y usa más almacenamiento/vector; no es la opción más ligera. |

Los modelos MiniLM y BGE tienen tarjetas oficiales con sus dimensiones y licencias en Hugging Face. `multilingual-e5-small` declara 12 capas, dimensión 384 y soporte multilingüe; además documenta el uso diferenciado de `query:` y `passage:`. `nomic-embed-text` se distribuye fácilmente mediante Ollama, pero su variante v1.5 usa vectores de 768 dimensiones y un artefacto local de aproximadamente 274 MB.

## Runtime recomendado

### Opción A — TypeScript + Transformers.js

Usar `@huggingface/transformers` con ONNX Runtime y `intfloat/multilingual-e5-small`.

Ventajas:

- Mantiene el contrato y la implementación en TypeScript.
- Evita un sidecar Python.
- Permite CPU local y modelos cacheados/locales.
- Encaja con el consumo posterior desde clientes TypeScript.

Costes:

- Añade una dependencia nativa de ONNX Runtime para Node.
- El primer arranque necesita descargar o tener cacheado el modelo.
- Debemos fijar cómo se deshabilitan modelos remotos en entornos cerrados.

### Opción B — FastEmbed como sidecar Python

Usar FastEmbed con ONNX Runtime, preferentemente con `multilingual-e5-small` o `bge-small-en-v1.5`.

Ventajas:

- Runtime ligero, sin PyTorch y con soporte de modelos ONNX.
- Buen camino para batching y procesamiento de grandes volúmenes.
- Aísla el modelo del proceso TypeScript mediante una API pequeña.

Costes:

- Introduce Python, empaquetado adicional y coordinación entre procesos.
- La API y observabilidad del sidecar pasan a ser parte de la plataforma.

### Opción C — Ollama

Usar el endpoint `/api/embed` con un modelo local.

Ventajas:

- Experiencia local muy sencilla para desarrollo.
- API HTTP y SDK JavaScript disponibles.
- Permite reemplazar el modelo sin cambiar el contrato de la aplicación.

Costes:

- Añade un servicio residente y una dependencia operativa.
- `nomic-embed-text:v1.5` usa 768 dimensiones y es más pesado que las alternativas de 384.
- La distribución del modelo debe revisarse por licencia y tamaño.

## Recomendación

Adoptar inicialmente `intfloat/multilingual-e5-small` detrás de un `EmbeddingProvider` en TypeScript, ejecutado con Transformers.js/ONNX Runtime.

La razón es que el proyecto tiene contenido en español, necesita seguir siendo distribuible desde TypeScript y todavía está en una etapa local-first. La dimensión 384 mantiene bajo el costo de almacenamiento y hace simple fijar `vector(384)` en PostgreSQL cuando validemos el modelo.

La implementación debe:

1. anteponer `query: ` a las consultas;
2. anteponer `passage: ` a los chunks;
3. normalizar los vectores;
4. verificar dimensión antes de persistir;
5. permitir reemplazar el runtime sin modificar `KnowledgeRepository`;
6. permitir cargar el modelo desde cache local y bloquear descargas remotas en producción.

## Siguiente validación

Antes de convertir la recomendación en decisión permanente, crear un dataset pequeño con consultas en español, documentos autorizados y casos de acceso denegado. Comparar `multilingual-e5-small` con `paraphrase-multilingual-MiniLM-L12-v2` usando recall@k, precisión de citas y latencia CPU.

## Fuentes oficiales

- [multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)
- [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- [BAAI/bge-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [Transformers.js](https://huggingface.co/docs/transformers.js/en/index)
- [FastEmbed](https://github.com/qdrant/fastembed)
- [Ollama embeddings](https://github.com/ollama/ollama/blob/main/docs/capabilities/embeddings.mdx)
