---
name: ytk-memory
description: Use YTK Memory for meaningful project work and questions about saved project memory. Start and finish sessions, search with focused terms, and treat empty results as no matches rather than an empty database.
---

<!-- Managed by ytk-memory-init:codex-skill -->

# YTK Memory workflow

## Scope

This workflow belongs to project `your-team-knowledge`. The configured MCP server is
already scoped to this project and its SQLite database. Do not try to use it to
read or write another project.

## Available tools

| Tool | Use |
| --- | --- |
| `memory_session_start` | Start a project session and optionally recall context for the current task. |
| `memory_search` | Search durable memory for the current project. |
| `memory_get` | Read one result in more detail when the search result is insufficient. |
| `memory_save` | Create or update a durable finding. A stable `topicKey` makes the write idempotent. |
| `memory_session_finish` | Close the active session and optionally persist its handoff summary. |

## When to use this workflow

Use it for meaningful coding or investigation work in this project, and whenever
the user asks what is saved in YTK Memory. Trivial conversation that does not
need project context does not require a memory session. Use the configured YTK
Memory MCP tools for memory questions; do not inspect the SQLite file directly
as a substitute.

## Start of work

1. Call `memory_session_start` once when a meaningful task begins. For a
   follow-up in the same task, keep using that session instead of starting a new
   one. Pass a short topic as `query` when one is clear.
2. Keep the returned `sessionId`. Pass it to every `memory_save` made during
   that task and to `memory_session_finish`.
3. Treat returned entries as evidence. An empty result means that the query
   found no relevant entries; it does not mean the database is empty.

## Search carefully

- Use a short, focused keyword or phrase, preferably one topic per
  `memory_search` call (for example, `Go` or `installer`). Avoid combining
  many synonyms or writing a long question as one query.
- If a search is empty, retry with a simpler or more distinctive term. Try
  alternate wording or language separately when useful, then report that no
  matching entry was found if those searches are also empty.
- Do not infer that the database is empty or count all entries from search
  results. These tools do not provide a full listing or total-count operation.
- Use `memory_get` to read a result by ID when its preview is insufficient.
- Keep `limit` between 1 and 100 and `maxChars` between 100 and 20000.

## Recover context before decisions

Before deciding about architecture, conventions, a bug, a recurring pattern, or a durable team constraint, call `memory_search` with focused terms for that topic.

Use `memory_get` only for a result whose full content is needed. Read only the evidence required for the current task. Distinguish recovered facts from your own inference and from information that still needs verification.

## Persist durable findings

Use `memory_save` after a reusable outcome, not after every message. Save:

- a technical or product decision and why it was chosen;
- a non-obvious discovery, root cause, fix, pattern, or anti-pattern;
- a durable team preference or project constraint;
- a concise handoff when work is paused and needs to be resumed.

Choose the closest supported type:

| Type | Use it for |
| --- | --- |
| `decision` | A choice and its reasoning. |
| `discovery` | A bug cause, fix, investigation result, or non-obvious fact. |
| `pattern` | A reusable convention, practice, or anti-pattern. |
| `preference` | A durable preference or constraint from the team. |
| `summary` | A handoff or session summary. |

Write a short, descriptive title and self-contained Markdown content. Add useful
tags. Use a stable `topicKey` for an evolving topic, for example
`architecture/authentication`, `bug/payment-timeout`, or
`convention/test-fixtures`. Reuse the same key when the new finding replaces
or extends the old one; `memory_save` will update it idempotently.

Do not save secrets, credentials, tokens, personal data that is not necessary,
full conversations, raw tool output, or trivial progress messages. Do not store
an unverified hypothesis as a fact.

## Finish or pause work

Before ending a meaningful task, call `memory_session_finish` with the same
`sessionId`. When there is useful handoff information, include a concise
summary with the objective, important decisions or discoveries, completed work,
remaining work, and relevant files. If there is nothing durable to hand off,
finish the session without a summary.

## Failures and safety

If a YTK Memory tool is unavailable or fails, continue the task without
memory and mention the limitation when it affects a decision. Do not retry a
failed write blindly. Never use memory to bypass project scope, permissions, or
the user's approval for destructive actions.
