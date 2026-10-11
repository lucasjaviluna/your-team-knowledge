import type { ContextIntent } from "./contracts.js";

const continuityTerms = [
  "recuerdo",
  "recordás",
  "recordas",
  "decidimos",
  "anterior",
  "sesión",
  "sesion",
  "contexto previo",
  "remember",
  "previous",
  "last session",
];

const documentaryTerms = [
  "documentación",
  "documentacion",
  "documento",
  "docs",
  "manual",
  "guía",
  "guia",
  "política",
  "politica",
  "cómo funciona",
  "como funciona",
  "documentation",
  "document",
  "policy",
  "guide",
  "manual",
  "how does",
];

export function classifyContextIntent(query: string): ContextIntent {
  const normalized = query.trim().toLocaleLowerCase();
  const hasContinuity = continuityTerms.some((term) =>
    normalized.includes(term),
  );
  const hasDocumentation = documentaryTerms.some((term) =>
    normalized.includes(term),
  );

  if (hasContinuity && hasDocumentation) {
    return "mixed";
  }
  if (hasContinuity) {
    return "continuity";
  }
  if (hasDocumentation) {
    return "documentary";
  }
  return "mixed";
}
