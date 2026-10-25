# Protocolo general de Agent Memory para `AGENTS.md`

Este bloque está pensado para incorporarse a las instrucciones de un repositorio y ser entendido por agentes que funcionen con cualquier proveedor o runtime. No presupone SDKs, herramientas, nombres de productos ni mecanismos concretos de integración.

El instalador mantiene el protocolo operativo en una única fuente y lo emite
como `.ytk-memory/YTK-MEMORY.md`. El adaptador Codex lo emite también como
`.agents/skills/ytk-memory/SKILL.md`; el bloque de `AGENTS.md` sólo activa la
skill. La implementación MCP expone cinco herramientas base para sesiones y
memorias, además de operaciones de revisión, corrección, relaciones/versiones
y consolidación confirmada.

## Instrucciones para el agente

### Inicio de una sesión

Al comenzar una tarea:

1. Identificá el proyecto, área de trabajo y objetivo actual.
2. Recuperá memoria relevante antes de tomar decisiones técnicas o de producto.
3. Usá sólo el contexto necesario para la tarea; no vuelques memoria completa sin motivo.
4. Si la memoria no está disponible, continuá con la tarea y declaralo cuando afecte una decisión.

### Durante el trabajo

Recuperá memoria antes de decidir sobre arquitectura, convenciones, bugs conocidos, patrones o restricciones del proyecto.

Guardá una memoria cuando ocurra algo reutilizable:

- una decisión técnica o de producto, junto con su motivo;
- un bug y su causa o solución;
- un patrón confirmado o un anti-patrón descubierto;
- un aprendizaje no obvio sobre el código, runtime o infraestructura;
- una preferencia o restricción durable del equipo.

Cuando una memoria existente describe el mismo tema, actualizala en vez de crear una entrada competidora. Usá una clave estable del tema cuando el sistema la soporte para que la operación sea idempotente.

No guardes secretos, tokens, credenciales, datos personales innecesarios, contenido trivial, conversaciones completas ni output crudo de herramientas. No inventes contexto ausente y distinguí entre evidencia recuperada, inferencia propia y dato todavía no verificado.

### Cierre de una sesión

Al finalizar o pausar una tarea:

1. Guardá un resumen breve con objetivo, restricciones, hallazgos, trabajo completado, próximos pasos y archivos relevantes.
2. Si queda trabajo incompleto, registrá también el estado pendiente.
3. No conviertas cada mensaje en una memoria; priorizá conocimiento durable y reutilizable.

### Seguridad y alcance

La memoria debe respetar el proyecto, workspace, permisos y área de la tarea actual. No mezcles contexto entre proyectos ni persistas información fuera del alcance autorizado. Las operaciones destructivas o de eliminación requieren confirmación explícita. Antes de consolidar memorias potencialmente contradictorias, inspeccioná las relaciones existentes y obtené una vista previa; aplicá la consolidación sólo después de un veredicto humano explícito.

## Contrato abstracto esperado

El runtime que ejecute estas instrucciones debería ofrecer capacidades equivalentes a:

```text
memory.context(project, area?)
memory.search(query, project, area?, limit?, maxChars?)
memory.save(type, title, content, project, area?, tags?, subjectKey?)
memory.update(existingId, content/title/tags/subjectKey)
memory.sessionSummary(goal, discoveries, completed, nextSteps, files)
```

El agente debe trabajar con ese contrato abstracto y no depender de la forma concreta en que el proveedor implemente almacenamiento, búsqueda, herramientas, hooks o transporte.
