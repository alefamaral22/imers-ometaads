// Onda 2 — Brief de produto (ADR 0014: briefs como arquivos em materiais-das-empresas).
// Schema fixo validado na fronteira. Brief é DADO curado, não instrução.

import {
  requireObject,
  requireString,
  requireStringArray,
  requireInt,
  optionalString,
} from './validation.ts';

export interface ProductBrief {
  slug: string;
  name: string;
  audience: string;
  valueProps: string[];
  tone: string;
  landingUrl: string;
  priceCents: number;
  currency: string;
  defaultSubdomain?: string;
}

/** Faz o parse + validação de um brief de produto vindo de arquivo JSON (fronteira externa). */
export function parseProductBrief(value: unknown): ProductBrief {
  const obj = requireObject(value, 'brief');
  const brief: ProductBrief = {
    slug: requireString(obj.slug, 'brief.slug'),
    name: requireString(obj.name, 'brief.name'),
    audience: requireString(obj.audience, 'brief.audience'),
    valueProps: requireStringArray(obj.valueProps, 'brief.valueProps', { min: 1 }),
    tone: requireString(obj.tone, 'brief.tone'),
    landingUrl: requireString(obj.landingUrl, 'brief.landingUrl'),
    priceCents: requireInt(obj.priceCents, 'brief.priceCents', { min: 0 }),
    currency: requireString(obj.currency, 'brief.currency'),
  };
  const defaultSubdomain = optionalString(obj.defaultSubdomain, 'brief.defaultSubdomain');
  if (defaultSubdomain !== undefined) brief.defaultSubdomain = defaultSubdomain;
  return brief;
}
