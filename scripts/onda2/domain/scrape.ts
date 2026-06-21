// Onda 2 — Resultado do scrape da landing (subagent scrape-extractor).
// Saída do scrape é conteúdo NÃO confiável: validada por schema, tratada como dado, não instrução.

import { requireObject, requireString, requireStringArray } from './validation.ts';

export interface ScrapeResult {
  title: string;
  valueProps: string[];
  audience: string;
  tone: string;
}

export function parseScrapeResult(value: unknown): ScrapeResult {
  const obj = requireObject(value, 'scrape');
  return {
    title: requireString(obj.title, 'scrape.title'),
    valueProps: requireStringArray(obj.valueProps, 'scrape.valueProps', { min: 1 }),
    audience: requireString(obj.audience, 'scrape.audience'),
    tone: requireString(obj.tone, 'scrape.tone'),
  };
}
