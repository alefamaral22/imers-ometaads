// Onda 2 — Cliente (linha de public.clients lida via REST). Campos lidos do banco, nunca de args livres.

import { requireObject, requireString, requireInt, optionalString } from './validation.ts';

export interface ClientRecord {
  id: string;
  slug: string;
  name: string;
  adAccountId?: string;
  facebookPageId?: string;
  defaultLandingUrl?: string;
  dailyBudgetCapCents: number;
  currency: string;
}

/** Faz o parse de uma linha de `clients` retornada pelo PostgREST (snake_case). */
export function parseClientRecord(value: unknown): ClientRecord {
  const obj = requireObject(value, 'client');
  const record: ClientRecord = {
    id: requireString(obj.id, 'client.id'),
    slug: requireString(obj.slug, 'client.slug'),
    name: requireString(obj.name, 'client.name'),
    dailyBudgetCapCents: requireInt(obj.daily_budget_cap_cents, 'client.daily_budget_cap_cents', {
      min: 0,
    }),
    currency: requireString(obj.currency, 'client.currency'),
  };
  const adAccountId = optionalString(obj.ad_account_id, 'client.ad_account_id');
  if (adAccountId !== undefined) record.adAccountId = adAccountId;
  const facebookPageId = optionalString(obj.facebook_page_id, 'client.facebook_page_id');
  if (facebookPageId !== undefined) record.facebookPageId = facebookPageId;
  const defaultLandingUrl = optionalString(obj.default_landing_url, 'client.default_landing_url');
  if (defaultLandingUrl !== undefined) record.defaultLandingUrl = defaultLandingUrl;
  return record;
}
