'use client';

import { useEffect, useState } from 'react';
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

/**
 * KPIs + WhatsApp da Visão Geral com seletor de conta de anúncio. Ao trocar a conta, busca as
 * métricas "estado atual" (campaign_insights) dessa conta e atualiza os cards na hora.
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
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState(initialKpis);
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);

  // Carrega lista de contas de anúncio conectadas
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

  async function handleSelect(metaAdAccountId: string) {
    setSelected(metaAdAccountId);
    if (!metaAdAccountId) {
      // "Todas as contas" → volta pro agregado padrão
      setKpis(initialKpis);
      setWhatsapp(initialWhatsapp);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data/overview-metrics?metaAdAccountId=${encodeURIComponent(metaAdAccountId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as OverviewMetricsResponse;
      setKpis(data.metrics.kpis);
      setWhatsapp(data.metrics.whatsapp);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Seletor de conta — só aparece se há contas conectadas */}
      {accounts.length > 0 && (
        <div className="rise-in mb-4 flex items-center gap-3" style={{ animationDelay: '50ms' }}>
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
          {loading && <span className="text-[10px] text-dim animate-pulse">carregando...</span>}
        </div>
      )}

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
