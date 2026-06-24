/**
 * Onda 16 — Diagnóstico rápido de campanhas (heurísticas portadas do protótipo Jarvis), em domínio
 * PURO e testável (sem I/O). Recebe os vitals de cada campanha (já achatados pela skill a partir dos
 * insights da Meta) e devolve alertas acionáveis. Dinheiro SEMPRE em centavos inteiros; "sem dado" é
 * `null`, nunca 0 (um custo_por_resultado 0 é diferente de "ninguém converteu"). Números da Meta são
 * dado de fronteira: quem chama valida tipos antes — aqui só calculamos.
 */

export type AlertLevel = 'critical' | 'attention';

export interface CampaignVitals {
  id: string;
  name: string;
  /** effective_status da Meta (ACTIVE, PAUSED, WITH_ISSUES, DISAPPROVED, ...). */
  delivery_status: string;
  spend_cents: number;
  impressions: number;
  /** CTR em pontos percentuais (ex.: 1.8 = 1,8%). null = sem dado. */
  ctr: number | null;
  cpc_cents: number | null;
  /** Frequência média (impressões/alcance). null = sem dado. */
  frequency: number | null;
  /** Resultados do objetivo (conversas, leads, compras…). */
  results: number;
  /** Custo por resultado em centavos. null = sem resultado (não 0). */
  cost_per_result_cents: number | null;
}

export interface Alert {
  level: AlertLevel;
  campaign_id: string;
  campaign: string;
  message: string;
}

// Limiares (do Jarvis, convertidos p/ centavos). Centralizados para auditoria e teste.
export const ALERT_THRESHOLDS = {
  spendNoResultCents: 1500, // gastou > R$15 e zero resultado → desperdício
  saturatedFrequency: 3.5, // público saturado
  saturatedMinSpendCents: 500, // só alerta saturação se já houve gasto relevante
  weakCtrPct: 0.5, // CTR < 0,5% = criativo provavelmente fraco
  weakCtrMinImpressions: 2000, // com volume suficiente p/ ser significativo
  highCostPerResultCents: 10000, // custo por resultado > R$100 = ineficiente
  highCpcCents: 800, // CPC > R$8
  highCpcMinSpendCents: 1000, // com gasto relevante
} as const;

// effective_status que indicam que a entrega está travada/reprovada.
const DELIVERY_ISSUE_STATES = new Set(['WITH_ISSUES', 'DISAPPROVED', 'ERROR', 'PENDING_REVIEW']);

const reais = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

/** Avalia UMA campanha e retorna seus alertas (pode ser vazio). Puro e determinístico. */
export function alertsForCampaign(c: CampaignVitals): Alert[] {
  const out: Alert[] = [];
  const T = ALERT_THRESHOLDS;
  const at = (level: AlertLevel, message: string): void => {
    out.push({ level, campaign_id: c.id, campaign: c.name, message });
  };

  if (DELIVERY_ISSUE_STATES.has(c.delivery_status)) {
    at('critical', `Problema de entrega (${c.delivery_status}) — verificar no Gerenciador.`);
  }
  if (c.spend_cents > T.spendNoResultCents && c.results === 0) {
    at('critical', `Gastou R$${reais(c.spend_cents)} sem nenhum resultado.`);
  }
  if (
    c.frequency != null &&
    c.frequency >= T.saturatedFrequency &&
    c.spend_cents > T.saturatedMinSpendCents
  ) {
    at(
      'attention',
      `Frequência alta (${c.frequency.toFixed(1)}x) — público saturado. Ampliar a segmentação ou pausar.`,
    );
  }
  if (c.ctr != null && c.ctr < T.weakCtrPct && c.impressions > T.weakCtrMinImpressions) {
    at(
      'attention',
      `CTR baixo (${c.ctr.toFixed(2)}%) com ${c.impressions.toLocaleString('pt-BR')} impressões — criativo provavelmente fraco.`,
    );
  }
  if (c.cost_per_result_cents != null && c.cost_per_result_cents > T.highCostPerResultCents) {
    at('attention', `Custo por resultado elevado: R$${reais(c.cost_per_result_cents)}.`);
  }
  if (
    c.cpc_cents != null &&
    c.cpc_cents > T.highCpcCents &&
    c.spend_cents > T.highCpcMinSpendCents
  ) {
    at('attention', `CPC alto: R$${reais(c.cpc_cents)} por clique.`);
  }
  return out;
}

export interface AlertReport {
  critical: number;
  attention: number;
  alerts: Alert[];
}

/** Diagnostica a conta inteira: concatena os alertas e resume a contagem por nível. */
export function buildAlertReport(campaigns: readonly CampaignVitals[]): AlertReport {
  const alerts = campaigns.flatMap(alertsForCampaign);
  return {
    critical: alerts.filter((a) => a.level === 'critical').length,
    attention: alerts.filter((a) => a.level === 'attention').length,
    alerts,
  };
}
