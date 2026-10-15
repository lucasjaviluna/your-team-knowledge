# Protocolo reusable de Agent Memory

Este documento define el contrato que debe ejecutar un consumidor de la plataforma durante el trabajo normal de un agente. La extensión nativa de Pi sigue viviendo en `your-harness-v0`; este repositorio publica la fachada runtime-neutral `PiHarnessMemoryProtocol`.

## Flujo obligatorio

1. Al iniciar una tarea, el consumidor llama `bootstrap()` con `projectId` y, cuando existe una pregunta o decisión activa, una consulta de contexto. El método abre una sesión y devuelve memorias relevantes acotadas por `limit` y `maxChars`.
2. Antes de una decisión técnica o de producto, el consumidor recupera memoria con `bootstrap()`/`provider.search()` y usa esa evidencia junto con el estado actual del proyecto.
3. Cuando se confirma una decisión, bug, fix, patrón, preferencia o descubrimiento reutilizable, llama `remember()`. `subjectKey` habilita actualización idempotente; no se deben emitir comandos manuales por cada memoria.
4. El consumidor no guarda secretos, tokens, credenciales, contenido trivial ni output crudo de herramientas. El servicio rechaza contenido sensible y el hook debe tratar ese rechazo como una operación no persistida.
5. Al terminar la sesión, llama `finish()` con el resumen y el `sessionId` devuelto por `bootstrap()`. El resumen se conserva tanto en la sesión como en una memoria de tipo `summary`.
6. El consumidor conecta `observe` a su logger/métricas. Sólo debe registrar operación, proyecto, resultado, cantidad y duración; nunca contenido de memoria.

## Integración mínima

```ts
import {
  MemoryService,
  PiHarnessMemoryProtocol,
  SqliteAgentMemoryRepository,
} from "@corporate-knowledge/platform/memory";

const memory = new MemoryService(
  new SqliteAgentMemoryRepository(".harness/team-knowledge.sqlite"),
);
const protocol = new PiHarnessMemoryProtocol(memory, undefined, {
  observe: (event) => logger.info("agent_memory", event),
});

const context = { projectId: workspaceId, area: "backend" };
const session = await protocol.bootstrap(context, {
  query: taskDescription,
});

// El runtime del consumidor ejecuta el trabajo del agente aquí.
await protocol.remember(context, {
  type: "decision",
  subjectKey: "deployment/strategy",
  title: "Estrategia de despliegue",
  content: "Usar despliegues graduales con rollback validado.",
  tags: ["deployment", "rollback"],
});

await protocol.finish(context, {
  sessionId: session.sessionId,
  summary: "Se confirmó la estrategia de despliegue y su rollback.",
});
```

La extensión de `your-harness-v0` debe mapear sus hooks de inicio/cierre y sus tools de memoria a estos métodos, respetando la aprobación configurada para escrituras. La plataforma no registra `pi.registerTool` ni importa `ExtensionAPI`.
