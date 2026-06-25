import Link from 'next/link';
import { requireOperator } from '../lib/auth/server';
import { scopeFromClaims } from '../lib/multitenant/scope';
import { listClients } from '../lib/services/clients';
import { listAllCampaigns } from '../lib/services/campaigns';
import { listAnalyses } from '../lib/services/analyses';
import { listOperationLogs } from '../lib/services/logs';
import { Shell } from '../components/shell';
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '../components/ui';
import { formatCents, formatDate } from '../lib/domain/format';

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
  try {
    [clients, campaigns, analyses, logs] = await Promise.all([
      listClients(scope),
      listAllCampaigns(scope, 50),
      listAnalyses(scope, 1),
      listOperationLogs(scope, 8),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  const pausedCount = campaigns.filter((c) => c.status === 'PAUSED').length;
  const latestVerdict = analyses[0]?.overall_verdict ?? null;

  return (
    <Shell>
      <PageHeader
        title="Visão geral"
        subtitle="Estado da agência de tráfego operada por IAs (Nexus)."
      />

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      {/* Hero "Neural Core" — copiloto de voz com arc reactor (espelha o painel do Jarvis). */}
      <Card className="mb-6 overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px scan-top bg-gradient-to-r from-transparent via-accent to-transparent"
        />
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-dim uppercase">
              I.A. Copiloto · Neural Core
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[0.12em] text-ink uppercase">
              Ativar <span className="text-accent text-glow">Nexus</span>
            </h2>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-dim">
              Copiloto de voz com IA para operar campanhas em tempo real. Fale ou digite para
              analisar, criar, pausar e ajustar orçamentos — abra o Nexus no canto inferior direito.
            </p>
          </div>
          <span aria-hidden className="reactor h-24 w-24 shrink-0" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Clientes" value={clients.length} tone="accent2" />
        <Stat label="Campanhas" value={campaigns.length} tone="accent" />
        <Stat label="Pausadas" value={pausedCount} tone="warn" />
        <Stat
          label="Último veredito"
          tone="pos"
          value={latestVerdict ? <Badge value={latestVerdict} /> : '—'}
        />
      </div>

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
                <Th>Orçamento/dia</Th>
                <Th>Status</Th>
                <Th>Criada</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 12).map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td>{c.objective}</Td>
                  <Td>{formatCents(c.daily_budget_cents)}</Td>
                  <Td>
                    <Badge value={c.status} />
                  </Td>
                  <Td>{formatDate(c.created_at)}</Td>
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
            <ul className="space-y-2 text-sm">
              {clients.map((cl) => (
                <li key={cl.id} className="flex items-center justify-between">
                  <Link
                    href={`/clients/${cl.slug}`}
                    className="text-accent transition-colors hover:text-glow hover:underline"
                  >
                    {cl.name}
                  </Link>
                  <span className="text-dim">
                    teto {formatCents(cl.daily_budget_cap_cents, cl.currency)}
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
            <ul className="space-y-2 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink/80">
                    <span className="text-accent/70">{log.action}</span> {log.entity_type}
                    {log.summary ? ` — ${log.summary}` : ''}
                  </span>
                  <span className="shrink-0 text-dim">{formatDate(log.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
