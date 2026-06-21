// Onda 2 — Montagem dos payloads da Meta Marketing API (lógica pura, testável).
// Gotchas críticos da Meta (SPEC §10): campanha SEMPRE nasce PAUSED; orçamento ≤ teto;
// imagem inline em link_data.picture (URL pública do bucket ad-ingest); OUTCOME_TRAFFIC.

import type { AdCopy } from './angles.ts';
import { clampDailyBudgetCents, isWithinBudgetCap } from './budget.ts';
import { ValidationError } from './validation.ts';

export const TRAFFIC_OBJECTIVE = 'OUTCOME_TRAFFIC' as const;
export const TRAFFIC_OPTIMIZATION_GOAL = 'LANDING_PAGE_VIEWS' as const;
export const TRAFFIC_BILLING_EVENT = 'IMPRESSIONS' as const;
export const PAUSED = 'PAUSED' as const;

export interface CampaignPayload {
  name: string;
  objective: typeof TRAFFIC_OBJECTIVE;
  status: typeof PAUSED;
  special_ad_categories: string[];
}

export interface AdSetPayload {
  name: string;
  optimization_goal: typeof TRAFFIC_OPTIMIZATION_GOAL;
  billing_event: typeof TRAFFIC_BILLING_EVENT;
  daily_budget: number; // centavos (inteiro), ≤ teto
  status: typeof PAUSED;
  destination_type: 'WEBSITE';
  targeting: Record<string, unknown>;
}

export interface CreativePayload {
  name: string;
  object_story_spec: {
    page_id: string;
    link_data: {
      link: string;
      message: string;
      name: string; // headline
      description: string;
      picture: string; // imagem inline (URL pública do bucket ad-ingest)
      call_to_action: { type: string; value: { link: string } };
    };
  };
}

export interface AdPayload {
  name: string;
  status: typeof PAUSED;
  // creative.creative_id é preenchido em runtime após criar o creative.
}

export function buildCampaignPayload(name: string, specialAdCategories: string[] = []): CampaignPayload {
  return {
    name,
    objective: TRAFFIC_OBJECTIVE,
    status: PAUSED, // NUNCA ACTIVE: campanha sempre nasce pausada (SPEC §10).
    special_ad_categories: specialAdCategories,
  };
}

export function buildAdSetPayload(args: {
  name: string;
  requestedDailyBudgetCents: number;
  capCents: number;
  targeting?: Record<string, unknown>;
}): AdSetPayload {
  const dailyBudget = clampDailyBudgetCents(args.requestedDailyBudgetCents, args.capCents);
  // Guarda final defensiva: jamais emitir um payload acima do teto.
  if (!isWithinBudgetCap(dailyBudget, args.capCents)) {
    throw new ValidationError('daily_budget', 'computed budget violates daily_budget_cap_cents');
  }
  return {
    name: args.name,
    optimization_goal: TRAFFIC_OPTIMIZATION_GOAL,
    billing_event: TRAFFIC_BILLING_EVENT,
    daily_budget: dailyBudget,
    status: PAUSED,
    destination_type: 'WEBSITE',
    targeting: args.targeting ?? { geo_locations: { countries: ['BR'] } },
  };
}

export function buildCreativePayload(args: {
  name: string;
  pageId: string;
  linkUrl: string;
  imageUrl: string;
  copy: AdCopy;
}): CreativePayload {
  if (!/^https:\/\//.test(args.imageUrl)) {
    // A Meta busca a imagem por URL pública (bucket ad-ingest). Exige https.
    throw new ValidationError('imageUrl', 'expected a public https URL (ad-ingest bucket)');
  }
  return {
    name: args.name,
    object_story_spec: {
      page_id: args.pageId,
      link_data: {
        link: args.linkUrl,
        message: args.copy.primaryText,
        name: args.copy.headline,
        description: args.copy.description,
        picture: args.imageUrl, // imagem inline (SPEC §10)
        call_to_action: { type: args.copy.cta, value: { link: args.linkUrl } },
      },
    },
  };
}

export function buildAdPayload(name: string): AdPayload {
  return { name, status: PAUSED };
}
