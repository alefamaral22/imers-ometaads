'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardTitle, EmptyState, Pill, Stat, Table, Td, Th } from './ui';
import { formatCents, formatInteger, formatRatioPercent } from '../lib/domain/format';

interface AdAccountOption {
  metaAdAccountId: string;
  label: string;
  clientId: string | null;
  status: string;
}

interface Kpis {
  spendCents: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number;
  cpcCents: number;
  cpmCents: number;
  campaigns: number;
}

interface WhatsAppCampaign {
  metaEntityId: string;
  name: string;
  spendCents: number;
  conversations: number;
  replies: number;
  costPerConversationCents: number;
  msgsPerConversation: number;
  ctr: number;
}

interface WhatsAppSummary {
  campaigns: number;
  conversations: number;
  replies: number;
  spendCents: number;
  costPerConversationCents: number;
  msgsPerConversation: number;
  pctOfTotalSpend: number;
  rows: WhatsAppCampaign[];
}

interface OverviewMetricsResponse {
  metrics: {
    kpis: Kpis;
    whatsapp: WhatsAppSummary;
    hasData: boolean;
  };
}

type PeriodPreset = 'today' | '7d' | '15d' | '30d' | 'custom';

interface DateRange {
  since: string;
  until: string;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: PeriodPreset): DateRange {
  const until = new Date();
  const since = new Date();
  switch (preset) {
    case 'today':
      break;
    case '7d':
      since.setDate(since.getDate() - 7);
      break;
    case '15d':
      since.setDate(since.getDate() - 15);
      break;
    case '30d':
      since.setDate(since.getDate() - 30);
      break;
    default:
      break;
  }
  return { since: formatDate(since), until: formatDate(until) };
}

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '15d', label: '15 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

/**
 * KPIs + WhatsApp da Visão Geral com seletor de conta de anúncio e filtro de data.
 * Ao trocar a conta ou período, busca métricas da API e atualiza os cards na hora.
 */
export function OverviewKpisWithSelector({
  initialKpis,
  initialWhatsapp,
}: {
  initialKpis: Kpis;
  initialWhatsapp: WhatsAppSummary;
}) {
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [selected, setSelected] = useState('');
  const [period, setPeriod] = useState<PeriodPreset>('30d');
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState(initialKpis);
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);

  useEffect(() => {
    let alive = true;
    fetch('/api/data/ad-accounts')
      .then((res) => (res.ok ? res.json() : { adAccounts: [] }))
      .then((data: { adAccounts: AdAccountOption[] }) => {
        if (alive) setAccounts(data.adAccounts ?? []);
      })
      .catch(() => {
        /* mantém a lista vazia — seletor não aparece */
      });
    return () => {
      alive = false;
    };
  }, []);

  const buildDateRange = useCallback((preset: PeriodPreset): DateRange | null => {
    if (preset === 'custom') {
      if (!customSince || !customUntil) return null;
      return { since: customSince, until: customUntil };
    }
    return rangeForPreset(preset);
  }, [customSince, customUntil]);

  const fetchMetrics = useCallback(
    async (metaAdAccountId: string, preset: PeriodPreset) => {
      const range = buildDateRange(preset);
      if (preset === 'custom' && !range) return;

      if (!metaAdAccountId && !range) {
        setKpis(initialKpis);
        setWhatsapp(initialWhatsapp);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (metaAdAccountId) params.set('metaAdAccountId', metaAdAccountId);
        if (range) {
          params.set('since', range.since);
          params.set('until', range.until);
        }
        const res = await fetch(`/api/data/overview-metrics?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as OverviewMetricsResponse;
        setKpis(data.metrics.kpis);
        setWhatsapp(data.metrics.whatsapp);
      } finally {
        setLoading(false);
      }
    },
    [buildDateRange, initialKpis, initialWhatsapp],
  );

  async function handleSelect(metaAdAccountId: string) {
    setSelected(metaAdAccountId);
    await fetchMetrics(metaAdAccountId, period);
  }

  async function handlePeriodChange(newPreset: PeriodPreset) {
    setPeriod(newPreset);
    if (newPreset !== 'custom') {
      await fetchMetrics(selected, newPreset);
    }
  }

  async function handleCustomApply() {
    if (!customSince || !customUntil) return;
    await fetchMetrics(selected, 'custom');
  }

  return (
    <>
      {/* Seletor de conta + filtro de data */}
      <div
        className="rise-in mb-4 flex flex-wrap items-center gap-3"
        style={{ animationDelay: '50ms' }}
      >
        {accounts.length > 0 && (
          <>
            <label
              htmlFor="overview-ad-account-selector"
              className="text-[10px] tracking-wider text-dim uppercase"
            >
              Conta de anúncio
            </label>
            <select
              id="overview-ad-account-selector"
              value={selected}
              onChange={(e) => void handleSelect(e.target.value)}
              disabled={loading}
              className="max-w-[16rem] rounded-md border border-edge/70 bg-panel/60 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="">Todas as contas (agregado por análise)</option>
              {accounts.map((a) => (
                <option key={a.metaAdAccountId} value={a.metaAdAccountId}>
                  {a.label}
                </option>
              ))}
            </select>
          </>
        )}

        <span className="ml-2 text-[10px] tracking-wider text-dim uppercase">Período</span>
        <div className="flex items-center gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => void handlePeriodChange(opt.value)}
              disabled={loading}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors disabled:opacity-50 ${
                period === opt.value
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-edge/70 bg-panel/40 text-ink/70 hover:border-accent/50 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customSince}
              onChange={(e) => setCustomSince(e.target.value)}
              disabled={loading}
              className="rounded-md border border-edge/70 bg-panel/60 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent disabled:opacity-50"
            />
            <span className="text-[10px] text-dim">→</span>
            <input
              type="date"
              value={customUntil}
              onChange={(e) => setCustomUntil(e.target.value)}
              disabled={loading}
              className="rounded-md border border-edge/70 bg-panel/60 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleCustomApply()}
              disabled={loading || !customSince || !customUntil}
              className="rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        )}

        {loading && <span className="text-[10px] text-dim animate-pulse">carregando...</span>}
      </div>

      {/* WhatsApp — resumo das campanhas de mensagem (SPEC-017). */}
      <Card className="rise-in mb-6" style={{ animationDelay: '60ms' }}>
        <div className="mb-4 flex items-center gap-2">
          <Pill tone="pos">WhatsApp</Pill>
          <CardTitle>Resumo geral das campanhas</CardTitle>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Campanhas WA" tone="pos" value={whatsapp.campaigns} hint="com conversas" />
          <Stat
            label="Conversas"
            tone="accent"
            value={formatInteger(whatsapp.conversations)}
            hint="iniciadas"
          />
          <Stat
            label="Custo / conversa"
            tone="warn"
            value={formatCents(whatsapp.costPerConversationCents)}
          />
          <Stat
            label="Msgs / conversa"
            tone="accent2"
            value={whatsapp.msgsPerConversation.toFixed(1)}
            hint="respostas ÷ conversas"
          />
          <Stat
            label="Gasto total WA"
            tone="purple"
            value={formatCents(whatsapp.spendCents)}
            hint={`${formatRatioPercent(whatsapp.pctOfTotalSpend, 0)} do gasto`}
          />
        </div>

        {whatsapp.rows.length === 0 ? (
          <EmptyState>
            Nenhuma campanha de WhatsApp ainda — aparece aqui quando uma campanha de mensagem rodar.
          </EmptyState>
        ) : (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>Campanha</Th>
                  <Th right>Gasto</Th>
                  <Th right>Conversas</Th>
                  <Th right>Custo/conv</Th>
                  <Th right>Respostas</Th>
                  <Th right>Msgs/conv</Th>
                  <Th right>CTR</Th>
                </tr>
              </thead>
              <tbody>
                {whatsapp.rows.map((r) => (
                  <tr key={r.metaEntityId}>
                    <Td>{r.name}</Td>
                    <Td num>{formatCents(r.spendCents)}</Td>
                    <Td num>{formatInteger(r.conversations)}</Td>
                    <Td num>{formatCents(r.costPerConversationCents)}</Td>
                    <Td num>{formatInteger(r.replies)}</Td>
                    <Td num>{r.msgsPerConversation.toFixed(1)}</Td>
                    <Td num>{formatRatioPercent(r.ctr)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* KPIs de performance */}
      <div
        className="rise-in grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"
        style={{ animationDelay: '120ms' }}
      >
        <Stat
          label="Gasto total"
          tone="accent"
          value={formatCents(kpis.spendCents)}
          hint={`${kpis.campaigns} campanha${kpis.campaigns === 1 ? '' : 's'}`}
        />
        <Stat label="Impressões" tone="accent2" value={formatInteger(kpis.impressions)} />
        <Stat label="Cliques" tone="accent2" value={formatInteger(kpis.clicks)} />
        <Stat label="CTR médio" tone="pos" value={formatRatioPercent(kpis.ctr)} />
        <Stat label="CPC médio" tone="warn" value={formatCents(kpis.cpcCents)} hint="por clique" />
        <Stat
          label="CPM médio"
          tone="purple"
          value={formatCents(kpis.cpmCents)}
          hint="por mil impr."
        />
        <Stat label="Resultados" tone="pos" value={formatInteger(kpis.results)} />
        <Stat
          label="Campanhas"
          tone="accent"
          value={kpis.campaigns}
          hint={selected ? 'desta conta' : 'na última análise'}
        />
      </div>
    </>
  );
}
