import { describe, expect, it } from "vitest";

import { loadServerConfig } from "../../src/server-config.js";

const validEnvironment = {
  DATABASE_URL: "postgres://knowledge:knowledge@localhost:5432/knowledge",
  API_TOKENS_JSON: JSON.stringify({
    "dev-token": {
      actorId: "developer",
      teamIds: ["platform"],
      workspaceIds: ["default"],
    },
  }),
};

describe("loadServerConfig", () => {
  it("loads defaults and normalized runtime settings", () => {
    const config = loadServerConfig({
      ...validEnvironment,
      PORT: "3040",
      HOST: " 127.0.0.1 ",
      AGENT_MEMORY_DATABASE: " ./memory.sqlite ",
      EMBEDDING_DTYPE: "q8",
      EMBEDDING_LOCAL_ONLY: "1",
    });

    expect(config.port).toBe(3040);
    expect(config.host).toBe("127.0.0.1");
    expect(config.agentMemoryDatabase).toBe("./memory.sqlite");
    expect(config.embeddingDtype).toBe("q8");
    expect(config.embeddingLocalOnly).toBe(true);
    expect(config.tokens.get("dev-token")?.actorId).toBe("developer");
  });

  it("rejects invalid startup configuration", () => {
    expect(() => loadServerConfig({ ...validEnvironment, PORT: "0" })).toThrow(
      "PORT must be an integer between 1 and 65535.",
    );
    expect(() =>
      loadServerConfig({ ...validEnvironment, API_TOKENS_JSON: "{" }),
    ).toThrow("API_TOKENS_JSON must be valid JSON.");
    expect(() =>
      loadServerConfig({
        ...validEnvironment,
        API_TOKENS_JSON: JSON.stringify({}),
      }),
    ).toThrow("API_TOKENS_JSON must define at least one token.");
  });
});
