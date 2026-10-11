import { describe, expect, it, vi } from "vitest";

import { KnowledgeHttpClient } from "../../src/index.js";

describe("KnowledgeHttpClient", () => {
  it("checks API health without requiring a token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("http://knowledge.test/health");
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    });

    const client = new KnowledgeHttpClient({
      baseUrl: "http://knowledge.test/",
      fetch: fetchMock,
    });

    await expect(client.health()).resolves.toEqual({ status: "ok" });
  });

  it("sends a bearer token and the language-neutral query contract", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("http://knowledge.test/v1/knowledge/query");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "content-type": "application/json",
        authorization: "Bearer client-token",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceId: "workspace",
        query: "deployment policy",
        limit: 3,
      });
      return new Response(JSON.stringify({ results: [], citations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = new KnowledgeHttpClient({
      baseUrl: "http://knowledge.test/",
      getToken: () => "client-token",
      fetch: fetchMock,
    });

    await expect(
      client.query({
        workspaceId: "workspace",
        query: "deployment policy",
        limit: 3,
      }),
    ).resolves.toEqual({ results: [], citations: [] });
  });

  it("exposes the HTTP status and error body", async () => {
    const client = new KnowledgeHttpClient({
      baseUrl: "http://knowledge.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: "Forbidden." }), {
          status: 403,
          headers: { "x-request-id": "request-403" },
        }),
    });

    await expect(
      client.query({ workspaceId: "workspace", query: "secret" }),
    ).rejects.toMatchObject({
      status: 403,
      body: { error: "Forbidden." },
      requestId: "request-403",
    });
  });
});
