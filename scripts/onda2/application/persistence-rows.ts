// Onda 2 — Mapeia o plano + IDs criados na Meta para as linhas snake_case exatas de cada tabela
// (nomes conforme as migrations da Onda 1). Pure/testável: nenhuma chamada de rede aqui.

import type { CampaignPlan, CreativePlanItem } from './campaign-plan.ts';

export interface CampaignRow {
  client_id: string;
  meta_campaign_id: string | null;
  name: string;
  objective: string;
  budget_mode: 'ABO';
  status: 'PAUSED';
  special_ad_categories: string[];
  raw_spec: unknown;
}

export interface AdSetRow {
  campaign_id: string;
  meta_ad_set_id: string | null;
  name: string;
  optimization_goal: string;
  billing_event: string;
  destination_type: string;
  daily_budget_cents: number;
  targeting: unknown;
  status: 'PAUSED';
  raw_spec: unknown;
}

export interface GeneratedImageRow {
  storage_bucket: string;
  storage_path: string;
  width: number;
  height: number;
  model: string;
  prompt: string;
  aspect: string;
  cost_usd_estimate: number;
  raw_spec: unknown;
}

export interface CreativeRow {
  client_id: string;
  meta_creative_id: string | null;
  name: string;
  headline: string;
  primary_text: string;
  description: string;
  call_to_action_type: string;
  link_url: string;
  image_url: string;
  page_id: string;
  generated_image_id: string | null;
  raw_spec: unknown;
}

export interface AdRow {
  ad_set_id: string;
  creative_id: string | null;
  meta_ad_id: string | null;
  name: string;
  status: 'PAUSED';
  raw_spec: unknown;
}

export function toCampaignRow(
  plan: CampaignPlan,
  clientId: string,
  metaCampaignId: string | null,
): CampaignRow {
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

export function toAdSetRow(
  plan: CampaignPlan,
  campaignId: string,
  metaAdSetId: string | null,
): AdSetRow {
  return {
    campaign_id: campaignId,
    meta_ad_set_id: metaAdSetId,
    name: plan.adSet.name,
    optimization_goal: plan.adSet.optimization_goal,
    billing_event: plan.adSet.billing_event,
    destination_type: plan.adSet.destination_type,
    daily_budget_cents: plan.adSet.daily_budget,
    targeting: plan.adSet.targeting,
    status: 'PAUSED',
    raw_spec: plan.adSet,
  };
}

export interface ImageMeta {
  width: number;
  height: number;
  model: string;
  prompt: string;
  aspect: string;
  costUsdEstimate: number;
}

export function toGeneratedImageRow(item: CreativePlanItem, meta: ImageMeta): GeneratedImageRow {
  return {
    storage_bucket: item.imageBucket,
    storage_path: item.imageStoragePath,
    width: meta.width,
    height: meta.height,
    model: meta.model,
    prompt: meta.prompt,
    aspect: meta.aspect,
    cost_usd_estimate: meta.costUsdEstimate,
    raw_spec: meta,
  };
}

export function toCreativeRow(
  plan: CampaignPlan,
  item: CreativePlanItem,
  clientId: string,
  generatedImageId: string | null,
  metaCreativeId: string | null,
): CreativeRow {
  const linkData = item.creativePayload.object_story_spec.link_data;
  return {
    client_id: clientId,
    meta_creative_id: metaCreativeId,
    name: item.creativeName,
    headline: item.copy.headline,
    primary_text: item.copy.primaryText,
    description: item.copy.description,
    call_to_action_type: item.copy.cta,
    link_url: plan.linkUrl,
    image_url: linkData.picture,
    page_id: plan.pageId,
    generated_image_id: generatedImageId,
    raw_spec: item.creativePayload,
  };
}

export function toAdRow(
  item: CreativePlanItem,
  adSetId: string,
  creativeId: string | null,
  metaAdId: string | null,
): AdRow {
  return {
    ad_set_id: adSetId,
    creative_id: creativeId,
    meta_ad_id: metaAdId,
    name: item.adName,
    status: 'PAUSED',
    raw_spec: item.adPayload,
  };
}
