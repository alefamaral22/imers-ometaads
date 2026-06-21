// Onda 2 — Plano de campanha (application): orquestra domain em um plano puro e determinístico,
// pronto para ser executado contra a Meta (MCP) e persistido (REST). Sem I/O aqui.

import type { AdCopy, CopyAngle } from '../domain/angles.ts';
import { parseAngledCopy } from '../domain/angles.ts';
import type { ClientRecord } from '../domain/client.ts';
import type { ProductBrief } from '../domain/product-brief.ts';
import type { ScrapeResult } from '../domain/scrape.ts';
import {
  buildAdPayload,
  buildAdSetPayload,
  buildCampaignPayload,
  buildCreativePayload,
  PAUSED,
  TRAFFIC_OBJECTIVE,
  type AdPayload,
  type AdSetPayload,
  type CampaignPayload,
  type CreativePayload,
} from '../domain/meta-payload.ts';
import {
  adName,
  adSetName,
  campaignName,
  creativeName,
  imageStoragePath,
} from '../domain/naming.ts';

export const AD_INGEST_BUCKET = 'ad-ingest' as const;

export interface CreativePlanItem {
  angle: CopyAngle;
  copy: AdCopy;
  creativeName: string;
  adName: string;
  imageStoragePath: string;
  imageBucket: typeof AD_INGEST_BUCKET;
  creativePayload: CreativePayload;
  adPayload: AdPayload;
}

export interface CampaignPlan {
  clientSlug: string;
  productSlug: string;
  stamp: string;
  objective: typeof TRAFFIC_OBJECTIVE;
  status: typeof PAUSED;
  pageId: string;
  linkUrl: string;
  dailyBudgetCents: number;
  capCents: number;
  campaign: CampaignPayload;
  adSet: AdSetPayload;
  creatives: CreativePlanItem[];
}

export interface BuildCampaignPlanInput {
  client: ClientRecord;
  brief: ProductBrief;
  scrape: ScrapeResult;
  copyRaw: unknown; // saída não confiável do subagent copywriter; validada aqui
  stamp: string;
  publicBaseUrl: string; // base pública do bucket ad-ingest (ex.: https://<ref>.supabase.co/storage/v1/object/public/ad-ingest)
  requestedDailyBudgetCents?: number;
  specialAdCategories?: string[];
}

/**
 * Monta o plano completo de campanha de tráfego PAUSED, validando a copy e respeitando o teto.
 * Pure: dada a mesma entrada (mesmo stamp), produz o mesmo plano → idempotência.
 */
export function buildCampaignPlan(input: BuildCampaignPlanInput): CampaignPlan {
  const { client, brief, stamp } = input;
  const copies = parseAngledCopy(input.copyRaw);

  const pageId = client.facebookPageId;
  if (pageId === undefined || pageId.length === 0) {
    throw new Error('client.facebook_page_id is required to build creatives');
  }
  const linkUrl = brief.landingUrl || client.defaultLandingUrl || '';
  if (linkUrl.length === 0) throw new Error('no landing URL available (brief or client default)');

  const requested = input.requestedDailyBudgetCents ?? client.dailyBudgetCapCents;
  const adSet = buildAdSetPayload({
    name: adSetName(client.slug, brief.slug, stamp),
    requestedDailyBudgetCents: requested,
    capCents: client.dailyBudgetCapCents,
  });

  const base = input.publicBaseUrl.replace(/\/+$/, '');
  const creatives: CreativePlanItem[] = copies.map((copy) => {
    const path = imageStoragePath(client.slug, brief.slug, copy.angle, stamp);
    const imageUrl = `${base}/${path}`;
    return {
      angle: copy.angle,
      copy,
      creativeName: creativeName(brief.slug, copy.angle, stamp),
      adName: adName(brief.slug, copy.angle, stamp),
      imageStoragePath: path,
      imageBucket: AD_INGEST_BUCKET,
      creativePayload: buildCreativePayload({
        name: creativeName(brief.slug, copy.angle, stamp),
        pageId,
        linkUrl,
        imageUrl,
        copy,
      }),
      adPayload: buildAdPayload(adName(brief.slug, copy.angle, stamp)),
    };
  });

  return {
    clientSlug: client.slug,
    productSlug: brief.slug,
    stamp,
    objective: TRAFFIC_OBJECTIVE,
    status: PAUSED,
    pageId,
    linkUrl,
    dailyBudgetCents: adSet.daily_budget,
    capCents: client.dailyBudgetCapCents,
    campaign: buildCampaignPayload(
      campaignName(client.slug, brief.slug, stamp),
      input.specialAdCategories ?? [],
    ),
    adSet,
    creatives,
  };
}
