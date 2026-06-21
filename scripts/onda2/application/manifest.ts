// Onda 2 — Manifest da tentativa (SPEC §10): registro auditável por execução em
// tentativas-geracao-de-campanhas/<stamp>-<tipo>.json. Sem segredos, sem PII.

import type { CampaignPlan } from './campaign-plan.ts';
import { manifestFileName } from '../domain/naming.ts';

export type StepStatus = 'planned' | 'created' | 'reused' | 'failed';

export interface ManifestEntity {
  entity: 'campaign' | 'ad_set' | 'creative' | 'ad' | 'generated_image';
  name: string;
  status: StepStatus;
  metaId?: string;
  supabaseId?: string;
  error?: string;
}

export interface CampaignManifest {
  kind: 'traffic';
  clientSlug: string;
  productSlug: string;
  stamp: string;
  objective: string;
  status: string;
  dailyBudgetCents: number;
  capCents: number;
  withinCap: boolean;
  entities: ManifestEntity[];
}

/** Constrói o manifest inicial (tudo "planned") a partir do plano. O executor patcha os status. */
export function buildInitialManifest(plan: CampaignPlan): CampaignManifest {
  const entities: ManifestEntity[] = [
    { entity: 'campaign', name: plan.campaign.name, status: 'planned' },
    { entity: 'ad_set', name: plan.adSet.name, status: 'planned' },
  ];
  for (const c of plan.creatives) {
    entities.push({ entity: 'generated_image', name: c.imageStoragePath, status: 'planned' });
    entities.push({ entity: 'creative', name: c.creativeName, status: 'planned' });
    entities.push({ entity: 'ad', name: c.adName, status: 'planned' });
  }
  return {
    kind: 'traffic',
    clientSlug: plan.clientSlug,
    productSlug: plan.productSlug,
    stamp: plan.stamp,
    objective: plan.objective,
    status: plan.status,
    dailyBudgetCents: plan.dailyBudgetCents,
    capCents: plan.capCents,
    withinCap: plan.dailyBudgetCents >= 1 && plan.dailyBudgetCents <= plan.capCents,
    entities,
  };
}

export function manifestPath(stamp: string): string {
  return `tentativas-geracao-de-campanhas/${manifestFileName(stamp, 'traffic')}`;
}
