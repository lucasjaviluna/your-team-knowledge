# Changelog

All notable changes to this internal package are documented here.

## [Unreleased]

### Added

- Read-only `memory_timeline` MCP tool with project/area isolation, RFC3339
  date bounds, current statuses and latest recorded activity timestamps.

## [0.1.12] — Current release

### Added

- Native Go runtime for local Agent Memory, backed by SQLite/FTS5 and without
  CGo.
- Twelve project-scoped MCP tools, including `memory_list` for browsing active
  memories without a search query.
- Lifecycle, scheduled review, versioned corrections, relations and confirmed
  consolidation of durable memories.
- CLI commands for search, list, get, stats, doctor, backup, upgrade and
  rollback; `doctor --read-only` inspects a database without migrating it.
- Idempotent project setup/uninstall for Codex, Claude Code, Pi and OpenCode.
- OpenCode support for JSON and JSONC syntax. Configuration is preserved
  semantically; modified JSONC is normalized to indented JSON.
- WAL-based multiprocess concurrency hardening, bounded retries and atomic FTS5
  migrations.
- Signed Windows x64, Linux x64 and macOS arm64 releases with SHA-256,
  manifests and Ed25519 verification.

### Validated

- The Go binary was validated by the user in Codex. Validation with Claude Code
  remains deferred until that host is available.

## [0.1.0] - 2026-10-12

### Added

- Local Agent Memory backed by SQLite with the `subjectKey` contract.
- PostgreSQL/pgvector knowledge retrieval with hybrid search and access filters.
- Context orchestration, HTTP transport, audit correlation and TypeScript consumer adapters.
- Internal package and migration contract checks in CI.
- Provider-neutral Agent Memory contract and session protocol.
- Native project-scoped MCP server with installable CLI, structured tools and end-to-end smoke coverage.
