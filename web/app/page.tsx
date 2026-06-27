import Link from 'next/link';
import { requireOperator } from '../lib/auth/server';
import { scopeFromClaims } from '../lib/multitenant/scope';
import { listClients } from '../lib/services/clients';
import { listAllCampaigns } from '../lib/services/campaigns';
import { listAnalyses } from '../lib/services/analyses';
import { listOperationLogs } from '../lib/services/logs';
import { getOverviewMetrics } from '../lib/services/overview-metrics';
import { Shell } from '../components/shell';
import { SpendBarChart, CtrCpcChart } from '../components/overview-charts';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Pill,
  Stat,
  Table,
  Td,
  Th,
} from '../components/ui';
import {
  formatCents,
  formatDate,
  formatInteger,
  formatRatioPercent,
} from '../lib/domain/format';

// Reads use the request-time service_role client; never statically prerender.
export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const scope = scopeFromClaims(await requireOperator());

  // The dashboard degrades gracefully when the DB is unreachable (e.g. unconfigured env in preview).
  let error: string | null = null;
  let clients: Awaited<ReturnType<typeof listClients>> = [];
  let campaigns: Awaited<ReturnType<typeof listAllCampaigns>> = [];
  let analyses: Awaited<ReturnType<typeof listAnalyses>> = [];
  let logs: Awaited<ReturnType<typeof listOperationLogs>> = [];
  let metrics: Awaited<ReturnType<typeof getOverviewMetrics>> = {
    kpis: {
      spendCents: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      ctr: 0,
      cpcCents: 0,
      cpmCents: 0,
      campaigns: 0,
    },
    top: [],
    series: [],
    whatsapp: {
      campaigns: 0,
      conversations: 0,
      replies: 0,
      spendCents: 0,
      costPerConversationCents: 0,
      msgsPerConversation: 0,
      pctOfTotalSpend: 0,
      rows: [],
    },
    hasData: false,
  };
  try {
    [clients, campaigns, analyses, logs, metrics] = await Promise.all([
      listClients(scope),
      listAllCampaigns(scope, 50),
      listAnalyses(scope, 1),
      listOperationLogs(scope, 8),
      getOverviewMetrics(scope),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  const { kpis, top, series, whatsapp } = metrics;

  const pausedCount = campaigns.filter((c) => c.status === 'PAUSED').length;
  const latestVerdict = analyses[0]?.overall_verdict ?? null;

  return (
    <Shell>
      <PageHeader
        title="Visão geral"
        subtitle="Estado da agência de tráfego operada por IAs (Trafegante)."
      />

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      {/* Hero "Neural Core" — abre o console "Operação ao vivo" (painel Jarvis em tela cheia). */}
      <Link href="/operacao" className="group block rise-in">
        <Card className="holo-border mb-6 overflow-hidden p-7 transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:glow-strong">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px scan-top bg-gradient-to-r from-transparent via-accent to-transparent"
          />
          {/* brilho radial atrás do reactor */}
          <span
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative flex items-center justify-between gap-6">
            <div>
              <p className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-accent/70 uppercase">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-pos" />
                I.A. Copiloto · Neural Core · ao vivo
              </p>
              <h2 className="text-display mt-3 text-4xl leading-none font-bold tracking-[0.06em] text-ink uppercase">
                Ativar <span className="text-accent text-glow">Trafegante</span>
              </h2>
              <p className="mt-3 max-w-md text-xs leading-relaxed text-ink/70">
                Abra a <span className="text-accent">Operação ao vivo</span> — painel Jarvis em tela
                cheia com o arc reactor, métricas dos agentes e o copiloto de voz para analisar, criar
                e ajustar campanhas em tempo real.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-wider text-accent uppercase transition-colors group-hover:bg-accent/20">
                Entrar no console
                <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
            <span aria-hidden className="reactor h-32 w-32 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110" />
          </div>
        </Card>
      </Link>

      {/* WhatsApp — resumo das campanhas de mensagem (SPEC-017). Aparece sempre; vazio até haver dado. */}
      <Card className="rise-in mb-6" style={{ animationDelay: '60ms' }}>
        <div className="mb-4 flex items-center gap-2">
          <Pill tone="pos">WhatsApp</Pill>
          <CardTitle>Resumo geral das campanhas</CardTitle>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Campanhas WA"
            tone="pos"
            value={whatsapp.campaigns}
            hint="com conversas"
          />
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

      {/* KPIs de performance (SPEC-017) — agregados da última análise por cliente, escopados por account. */}
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
        <Stat label="CPM médio" tone="purple" value={formatCents(kpis.cpmCents)} hint="por mil impr." />
        <Stat label="Resultados" tone="pos" value={formatInteger(kpis.results)} />
        <Stat label="Campanhas" tone="accent" value={kpis.campaigns} hint="na última análise" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Clientes" value={clients.length} tone="accent2" />
        <Stat label="Campanhas (total)" value={campaigns.length} tone="accent" />
        <Stat label="Pausadas" value={pausedCount} tone="warn" />
        <Stat
          label="Último veredito"
          tone="pos"
          value={latestVerdict ? <Badge value={latestVerdict} /> : '—'}
        />
      </div>

      {metrics.hasData ? (
        <div className="rise-in mt-8 grid gap-4 lg:grid-cols-2" style={{ animationDelay: '180ms' }}>
          <Card>
            <CardTitle>Gasto por análise</CardTitle>
            <SpendBarChart series={series} />
          </Card>
          <Card>
            <CardTitle>CTR &amp; CPC por análise</CardTitle>
            <CtrCpcChart series={series} />
          </Card>
        </div>
      ) : null}

      {top.length > 0 ? (
        <div className="mt-8">
          <CardTitle>Top campanhas por gasto</CardTitle>
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Campanha</Th>
                <Th right>Gasto</Th>
                <Th right>Impressões</Th>
                <Th right>Cliques</Th>
                <Th right>CTR</Th>
                <Th right>CPC</Th>
                <Th right>CPM</Th>
                <Th right>Resultados</Th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => (
                <tr key={c.metaEntityId}>
                  <Td>
                    <Pill tone="accent">{i + 1}</Pill>
                  </Td>
                  <Td>{c.name}</Td>
                  <Td num>{formatCents(c.spendCents)}</Td>
                  <Td num>{formatInteger(c.impressions)}</Td>
                  <Td num>{formatInteger(c.clicks)}</Td>
                  <Td num>{formatRatioPercent(c.ctr)}</Td>
                  <Td num>{formatCents(c.cpcCents)}</Td>
                  <Td num>{formatCents(c.cpmCents)}</Td>
                  <Td num>{formatInteger(c.results)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      <div className="mt-8">
        <CardTitle>Campanhas recentes</CardTitle>
        {campaigns.length === 0 ? (
          <EmptyState>Nenhuma campanha ainda.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Objetivo</Th>
                <Th right>Orçamento/dia</Th>
                <Th>Status</Th>
                <Th right>Criada</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 12).map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td>{c.objective}</Td>
                  <Td num>{formatCents(c.daily_budget_cents)}</Td>
                  <Td>
                    <Badge value={c.status} />
                  </Td>
                  <Td num>{formatDate(c.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Clientes</CardTitle>
          {clients.length === 0 ? (
            <p className="text-sm text-dim">Nenhum cliente.</p>
          ) : (
            <ul className="divide-y divide-edge/30 text-sm">
              {clients.map((cl) => (
                <li key={cl.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <Link
                    href={`/clients/${cl.slug}`}
                    className="truncate text-accent transition-colors hover:text-glow hover:underline"
                  >
                    {cl.name}
                  </Link>
                  <span className="shrink-0 text-[11px] text-dim">
                    teto{' '}
                    <span className="text-display text-ink/80 tabular-nums">
                      {formatCents(cl.daily_budget_cap_cents, cl.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Atividade recente</CardTitle>
          {logs.length === 0 ? (
            <p className="text-sm text-dim">Sem operações registradas.</p>
          ) : (
            <ul className="divide-y divide-edge/30 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[9px] font-medium tracking-[0.14em] text-accent/80 uppercase">
                      {log.action}
                    </span>
                    <span className="truncate text-ink/80">
                      {log.entity_type}
                      {log.summary ? ` — ${log.summary}` : ''}
                    </span>
                  </span>
                  <span className="text-display shrink-0 text-xs text-dim tabular-nums">
                    {formatDate(log.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
