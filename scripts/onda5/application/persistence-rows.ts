// Onda 5 — Linhas snake_case exatas das tabelas (SPEC §6) para a campanha de vendas e para o patch
// de ativação. Pure/testável: sem rede. destination_type fica null em vendas (gotcha v25 = não usar).

import type { SalesAdItem, SalesPlan } from './sales-plan.ts';

export interface SalesCampaignRow {
  client_id: string;
  meta_campaign_id: string | null;
  name: string;
  objective: string;
  budget_mode: 'ABO';
  status: 'PAUSED';
  special_ad_categories: string[];
  raw_spec: unknown;
}

export interface SalesAdSetRow {
  campaign_id: string;
  meta_ad_set_id: string | null;
  name: string;
  optimization_goal: string;
  billing_event: string;
  destination_type: null; // OUTCOME_SALES: não usa destination_type
  daily_budget_cents: number;
  targeting: unknown;
  status: 'PAUSED';
  raw_spec: unknown;
}

export interface SalesAdRow {
  ad_set_id: string;
  creative_id: string; // reuso de um creative existente
  meta_ad_id: string | null;
  name: string;
  status: 'PAUSED';
  raw_spec: unknown;
}

export function toSalesCampaignRow(
  plan: SalesPlan,
  clientId: string,
  metaCampaignId: string | null,
): SalesCampaignRow {
  return {
    client_id: clientId,
    meta_campaign_id: metaCampaignId,
    name: plan.campaign.name,
    objective: plan.objective,
    budget_mode: 'ABO',
    status: 'PAUSED',
    special_ad_categories: plan.campaign.special_ad_categories,
    raw_spec: plan.campaign,
  };
}

export function toSalesAdSetRow(
  plan: SalesPlan,
  campaignId: string,
  metaAdSetId: string | null,
): SalesAdSetRow {
  return {
    campaign_id: campaignId,
    meta_ad_set_id: metaAdSetId,
    name: plan.adSet.name,
    optimization_goal: plan.adSet.optimization_goal,
    billing_event: plan.adSet.billing_event,
    destination_type: null,
    daily_budget_cents: plan.adSet.daily_budget,
    targeting: plan.adSet.targeting,
    status: 'PAUSED',
    raw_spec: plan.adSet,
  };
}

export function toSalesAdRow(
  item: SalesAdItem,
  adSetId: string,
  metaAdId: string | null,
): SalesAdRow {
  return {
    ad_set_id: adSetId,
    creative_id: item.creativeId,
    meta_ad_id: metaAdId,
    name: item.adName,
    status: 'PAUSED',
    raw_spec: { metaCreativeId: item.metaCreativeId },
  };
}
