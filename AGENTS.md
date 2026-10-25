# Project Guidelines

## Architecture

- Preserve the boundaries in `native/ytk-memory` between core storage and rules, MCP transport, and consumer setup. Keep Agent Memory behavior independent of transport and SQLite details where the existing contracts permit it.
- Read [docs/architecture.md](docs/architecture.md) before changing subsystem boundaries or memory lifecycle. Record significant architecture changes there and add/update an ADR when a durable decision changes.
- Preserve sensitive-content checks before persistence. See [docs/architecture.md](docs/architecture.md) and the relevant Agent Memory contracts for the full scope.

## Go and Tests

- Use the Go conventions already established under `native/ytk-memory`. Keep MCP `stdout` protocol-only and diagnostics on `stderr`.
- Add or update Go tests beside the affected package. Prefer deterministic stores and fixtures for Agent Memory tests.
- Go 1.27+ is required. Common checks from `native/ytk-memory`: `gofmt -w`, `go vet ./...`, `go test ./...`, and `go build ./cmd/ytk-memory`.

## Project References

- [docs/local-development.md](docs/local-development.md): setup, local services, and integration-test prerequisites.
- [docs/agent-memory-mcp.md](docs/agent-memory-mcp.md) and [docs/agent-memory-protocol.md](docs/agent-memory-protocol.md): Agent Memory contracts and MCP behavior.
- [docs/implementation-plan.md](docs/implementation-plan.md): current implementation sequence.
- [docs/current-status.md](docs/current-status.md): verified project status and next work.
- [docs/agent-memory-go-migration-plan.md](docs/agent-memory-go-migration-plan.md): native Agent Memory migration and distribution plan.
- [docs/adr/](docs/adr/): durable architecture decisions; consult the relevant ADR before changing a documented decision.

<!-- BEGIN ytk-memory-init:codex -->

## YTK Memory

Project: `your-team-knowledge`. Apply the `ytk-memory` skill for meaningful project work and whenever the user asks about saved YTK Memory. It defines the required memory workflow for start, retrieval, durable writes, and session handoff. If the skill is unavailable, follow `.ytk-memory/YTK-MEMORY.md`. Never store secrets.
<!-- END ytk-memory-init:codex -->
