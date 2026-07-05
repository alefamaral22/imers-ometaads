'use client';

import { useEffect, useState } from 'react';
import type { LiveOpsData } from './live-ops-console';

interface AdAccountOption {
  metaAdAccountId: string;
  label: string;
  clientId: string | null;
  status: string;
}

interface OverviewMetricsResponse {
  metrics: {
    kpis: { spendCents: number; campaigns: number; impressions: number; results: number };
    hasData: boolean;
  };
}

/**
 * Seletor de conta de anúncio Meta na Visão geral. Ao trocar, busca as métricas "estado atual"
 * (campaign_insights) dessa conta e repassa pro callback do console — os cards de cima atualizam
 * na hora, sem depender de uma análise ter rodado.
 */
export function AdAccountSelector({
  onChange,
}: {
  onChange: (kpis: LiveOpsData['kpis'] | null) => void;
}) {
  const [accounts, setAccounts] = useState<AdAccountOption[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/data/ad-accounts')
      .then((res) => (res.ok ? res.json() : { adAccounts: [] }))
      .then((data: { adAccounts: AdAccountOption[] }) => {
        if (alive) setAccounts(data.adAccounts ?? []);
      })
      .catch(() => {
        /* mantém a lista vazia — seletor só não aparece */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSelect(metaAdAccountId: string) {
    setSelected(metaAdAccountId);
    if (!metaAdAccountId) {
      onChange(null); // "todas as contas" → volta pro agregado padrão
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data/overview-metrics?metaAdAccountId=${encodeURIComponent(metaAdAccountId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as OverviewMetricsResponse;
      onChange(data.metrics.kpis);
    } finally {
      setLoading(false);
    }
  }

  if (accounts.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="ad-account-selector"
        className="text-[10px] tracking-wider text-dim uppercase"
      >
        Conta de anúncio
      </label>
      <select
        id="ad-account-selector"
        value={selected}
        onChange={(e) => void handleSelect(e.target.value)}
        disabled={loading}
        className="max-w-[14rem] rounded-md border border-edge/70 bg-bg/60 px-2 py-1 text-[11px] text-ink outline-none focus:border-accent disabled:opacity-50"
      >
        <option value="">Todas as contas</option>
        {accounts.map((a) => (
          <option key={a.metaAdAccountId} value={a.metaAdAccountId}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
