import { randomUUID } from "node:crypto";

import type { AccessPolicy, Document, DocumentChunk } from "../../domain/index.js";

export interface MarkdownIngestionInput {
  sourceId: string;
  externalId: string;
  workspaceId: string;
  title: string;
  content: string;
  version?: string;
  uri?: string;
  accessPolicy: AccessPolicy;
  maxChunkCharacters?: number;
}

export interface MarkdownIngestionResult {
  document: Document;
  chunks: readonly DocumentChunk[];
}

export function ingestMarkdown(input: MarkdownIngestionInput): MarkdownIngestionResult {
  const now = new Date();
  const document: Document = {
    id: randomUUID(),
    sourceId: requireText(input.sourceId, "sourceId"),
    externalId: requireText(input.externalId, "externalId"),
    workspaceId: requireText(input.workspaceId, "workspaceId"),
    title: requireText(input.title, "title"),
    ...(input.uri ? { uri: input.uri.trim() } : {}),
    version: input.version?.trim() || "1",
    status: "active",
    accessPolicy: input.accessPolicy,
    createdAt: now,
    updatedAt: now,
  };
  const chunks = chunkMarkdown(document.id, input.content, input.maxChunkCharacters ?? 1200);

  return { document, chunks };
}

function chunkMarkdown(
  documentId: string,
  content: string,
  maxChunkCharacters: number,
): readonly DocumentChunk[] {
  if (!Number.isInteger(maxChunkCharacters) || maxChunkCharacters < 100) {
    throw new Error("maxChunkCharacters must be an integer greater than or equal to 100.");
  }

  const paragraphs = content
    .trim()
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: DocumentChunk[] = [];
  let current = "";

  const flush = () => {
    if (!current) return;
    chunks.push({
      id: randomUUID(),
      documentId,
      ordinal: chunks.length,
      content: current,
      metadata: {},
    });
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    const candidate = `${current}\n\n${paragraph}`;
    if (candidate.length <= maxChunkCharacters) {
      current = candidate;
    } else {
      flush();
      current = paragraph;
    }
  }

  flush();
  return chunks;
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}
