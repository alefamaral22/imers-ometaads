// Onda 5 — Plano de campanha de vendas (application): reusa os top criativos vencedores (por compras)
// num plano puro OUTCOME_SALES PAUSED, pronto para a Meta (MCP) e persistência (REST). Sem I/O.

import type { ClientRecord } from '../../onda2/domain/client.ts';
import { ValidationError } from '../../onda2/domain/validation.ts';
import {
  buildSalesAdSetPayload,
  buildSalesCampaignPayload,
  PAUSED,
  SALES_OBJECTIVE,
  type SalesAdSetPayload,
  type SalesCampaignPayload,
} from '../domain/sales-payload.ts';
import { selectTopCreatives, type CreativePerformance } from '../domain/top-creatives.ts';
import { salesAdName, salesAdSetName, salesCampaignName } from '../domain/naming.ts';

export interface SalesAdItem {
  creativeId: string; // id no Supabase (reuso, não recria)
  metaCreativeId: string; // id na Meta (reuso direto)
  adName: string;
  status: typeof PAUSED;
}

export interface SalesPlan {
  clientSlug: string;
  stamp: string;
  objective: typeof SALES_OBJECTIVE;
  status: typeof PAUSED;
  pixelId: string;
  dailyBudgetCents: number;
  capCents: number;
  reusedCreativeIds: string[];
  campaign: SalesCampaignPayload;
  adSet: SalesAdSetPayload;
  ads: SalesAdItem[];
}

export interface BuildSalesPlanInput {
  client: ClientRecord;
  stamp: string;
  pixelId: string;
  topCreatives: CreativePerformance[];
  topN?: number;
  requestedDailyBudgetCents?: number;
  specialAdCategories?: string[];
  targeting?: Record<string, unknown>;
}

/**
 * Monta o plano de vendas PAUSED reusando os top-N criativos por compras. Aborta (lança) se:
 *  - não há criativo reutilizável (com meta_creative_id);
 *  - teto = 0 ou orçamento viola o teto (via clamp em buildSalesAdSetPayload);
 *  - pixel ausente.
 * Determinístico: mesma entrada (mesmo stamp) → mesmo plano (idempotência).
 */
export function buildSalesPlan(input: BuildSalesPlanInput): SalesPlan {
  const { client, stamp } = input;
  const n = input.topN ?? 3;
  const top = selectTopCreatives(input.topCreatives, n);
  if (top.length === 0) {
    throw new ValidationError(
      'topCreatives',
      'no reusable creative (with meta_creative_id) to reuse',
    );
  }

  const requested = input.requestedDailyBudgetCents ?? client.dailyBudgetCapCents;
  const adSet = buildSalesAdSetPayload({
    name: salesAdSetName(client.slug, stamp),
    requestedDailyBudgetCents: requested,
    capCents: client.dailyBudgetCapCents,
    pixelId: input.pixelId,
    ...(input.targeting !== undefined ? { targeting: input.targeting } : {}),
  });

  const ads: SalesAdItem[] = top.map((c) => {
    const metaCreativeId = c.meta_creative_id as string; // garantido não-nulo por selectTopCreatives
    return {
      creativeId: c.creative_id,
      metaCreativeId,
      adName: salesAdName(client.slug, metaCreativeId, stamp),
      status: PAUSED,
    };
  });

  return {
    clientSlug: client.slug,
    stamp,
    objective: SALES_OBJECTIVE,
    status: PAUSED,
    pixelId: input.pixelId,
    dailyBudgetCents: adSet.daily_budget,
    capCents: client.dailyBudgetCapCents,
    reusedCreativeIds: ads.map((a) => a.creativeId),
    campaign: buildSalesCampaignPayload(
      salesCampaignName(client.slug, stamp),
      input.specialAdCategories ?? [],
    ),
    adSet,
    ads,
  };
}
