# Contrato provider-neutral de Agent Memory

`AgentMemoryProvider` es la frontera estable entre un agente y la memoria. No conoce herramientas, hooks, modelos, proveedores de IA ni detalles de SQLite. Un runtime puede implementar o consumir esta interfaz mediante MCP, SDK local u otro transporte.

## Alcance

Toda operación recibe un `AgentMemoryContext` con un `projectId` obligatorio y un área opcional. La implementación debe impedir que una lectura, sesión o revisión atraviese ese alcance.

Las capacidades mínimas son:

- comprobar disponibilidad;
- buscar memoria relevante con límites de cantidad y caracteres;
- recuperar una entrada completa por ID;
- crear o actualizar por `topicKey`;
- iniciar y finalizar una sesión;
- guardar el resumen durable de una sesión;
- listar y completar revisiones pendientes.

`AgentMemoryProtocol` compone esas primitivas en tres operaciones de alto nivel:

- `bootstrap`: abre una sesión y recupera contexto opcional;
- `remember`: persiste conocimiento durable y reutilizable;
- `finish`: cierra la sesión y guarda un resumen idempotente cuando existe.

## Idempotencia y seguridad

`topicKey` identifica un tema estable dentro del proyecto. Repetir un guardado con la misma clave actualiza la entrada activa en lugar de crear memorias competidoras.

El borde de persistencia rechaza contenido con patrones sensibles. Los consumidores no deben guardar credenciales, secretos, datos personales innecesarios, transcripciones completas ni output crudo. Los límites de entrada pertenecen al adaptador de transporte; la autorización y el aislamiento pertenecen al proveedor.

## Implementación incluida

`SqliteAgentMemoryProvider` adapta este contrato a `MemoryService` y `SqliteAgentMemoryRepository`. El entrypoint liviano `@corporate-knowledge/platform/memory` publica el contrato, la fachada y la implementación local sin cargar el subsistema RAG.
