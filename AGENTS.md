# Project Guidelines

## Architecture

- Preserve the boundaries between `src/domain`, `src/application`, `src/infrastructure`, and transport/consumer adapters (`src/api`, `src/mcp`, `src/adapters`). Keep domain and application behavior independent of storage and transport details; use the existing contracts.
- Read [docs/architecture.md](docs/architecture.md) before changing subsystem boundaries, memory lifecycle, retrieval, access control, or embedding behavior. Record significant architecture changes there and add/update an ADR when a durable decision changes.
- Keep authorization filters in the retrieval query, and preserve sensitive-content checks before persistence or embedding. See [docs/api.md](docs/api.md) and the relevant architecture sections for the full contracts.

## TypeScript and Tests

- Use the existing strict TypeScript, ESM, and `NodeNext` conventions. Relative source imports use `.js` extensions; retain precise optional and indexed-access typing.
- Add or update Vitest tests under `test/`, mirroring the source area. Prefer fake providers/repositories for deterministic application tests; keep service-dependent integrations opt-in.
- Node.js 22+ is required. Common checks: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run build`, and `npm test`. Run the narrowest relevant test first; PostgreSQL and embedding benchmark checks require the setup described in [docs/local-development.md](docs/local-development.md).

## Project References

- [docs/local-development.md](docs/local-development.md): setup, local services, and integration-test prerequisites.
- [docs/agent-memory-mcp.md](docs/agent-memory-mcp.md) and [docs/agent-memory-protocol.md](docs/agent-memory-protocol.md): Agent Memory contracts and MCP behavior.
- [docs/implementation-plan.md](docs/implementation-plan.md): current implementation sequence.
- [docs/current-status.md](docs/current-status.md): verified project status and next work.
- [docs/agent-memory-go-migration-plan.md](docs/agent-memory-go-migration-plan.md): native Agent Memory migration and distribution plan.
- [docs/adr/](docs/adr/): durable architecture decisions; consult the relevant ADR before changing a documented decision.

<!-- BEGIN ytk-memory-init:codex -->

## YTK Memory

Project: `your-team-knowledge`. Apply the `ytk-memory` skill for every meaningful coding session. It defines the required memory workflow for start, retrieval, durable writes, and session handoff. If the skill is unavailable, follow `.ytk-memory/YTK-MEMORY.md`. Never store secrets.
<!-- END ytk-memory-init:codex -->
