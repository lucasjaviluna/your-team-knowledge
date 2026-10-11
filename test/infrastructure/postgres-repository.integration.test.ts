import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { ingestMarkdown } from "../../src/application/index.js";
import { PostgresKnowledgeRepository } from "../../src/infrastructure/postgres/index.js";

const connectionString = process.env.DATABASE_URL;
const describeIntegration = connectionString ? describe : describe.skip;
const cleanupPool = connectionString
  ? new Pool({ connectionString })
  : undefined;

describeIntegration("PostgresKnowledgeRepository integration", () => {
  afterAll(async () => {
    await cleanupPool?.end();
  });

  it("persists Markdown and applies workspace/team access filters", async () => {
    const repository = new PostgresKnowledgeRepository(connectionString!);
    const sourceId = `source-${crypto.randomUUID()}`;
    const externalId = `document-${crypto.randomUUID()}`;
    const workspaceId = `workspace-${crypto.randomUUID()}`;
    const ingested = ingestMarkdown({
      sourceId,
      externalId,
      workspaceId,
      title: "Runbook de despliegue",
      content:
        "El despliegue requiere una aprobación antes de promover a producción.",
      accessPolicy: {
        workspaceId,
        teamIds: ["platform"],
      },
    });

    try {
      await repository.save(
        { id: sourceId, kind: "markdown", name: "integration-test" },
        ingested.document,
        ingested.chunks,
      );

      const embedding = Array.from({ length: 384 }, (_, index) =>
        index === 0 ? 0.1 : index === 1 ? 0.2 : index === 2 ? 0.3 : 0,
      );
      const embeddedChunks = ingested.chunks.map((chunk) => ({
        ...chunk,
        embedding,
      }));
      await repository.save(
        { id: sourceId, kind: "markdown", name: "integration-test" },
        ingested.document,
        embeddedChunks,
      );

      const allowed = await repository.search({
        workspaceId,
        actorId: "actor-allowed",
        teamIds: ["platform"],
        query: "aprobación producción",
      });
      const denied = await repository.search({
        workspaceId,
        actorId: "actor-denied",
        teamIds: ["sales"],
        query: "aprobación producción",
      });

      expect(allowed).toHaveLength(1);
      expect(allowed[0]?.chunk.content).toContain("aprobación");
      expect(denied).toHaveLength(0);

      const vectorOnly = await repository.search({
        workspaceId,
        actorId: "actor-allowed",
        teamIds: ["platform"],
        query: "",
        queryEmbedding: embedding,
      });
      expect(vectorOnly).toHaveLength(1);
    } finally {
      await repository.close();
      await cleanupPool?.query("DELETE FROM documents WHERE id = $1", [
        ingested.document.id,
      ]);
      await cleanupPool?.query("DELETE FROM knowledge_sources WHERE id = $1", [
        sourceId,
      ]);
    }
  });
});
