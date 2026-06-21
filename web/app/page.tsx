import Link from 'next/link';
import { requireOperator } from '../lib/auth/server';
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
  await requireOperator();

  // The dashboard degrades gracefully when the DB is unreachable (e.g. unconfigured env in preview).
  let error: string | null = null;
  let clients: Awaited<ReturnType<typeof listClients>> = [];
  let campaigns: Awaited<ReturnType<typeof listAllCampaigns>> = [];
  let analyses: Awaited<ReturnType<typeof listAnalyses>> = [];
  let logs: Awaited<ReturnType<typeof listOperationLogs>> = [];
  try {
    [clients, campaigns, analyses, logs] = await Promise.all([
      listClients(),
      listAllCampaigns(50),
      listAnalyses(1),
      listOperationLogs(8),
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Clientes" value={clients.length} />
        <Stat label="Campanhas" value={campaigns.length} />
        <Stat label="Pausadas" value={pausedCount} />
        <Stat
          label="Último veredito"
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
            <p className="text-sm text-neutral-400">Nenhum cliente.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {clients.map((cl) => (
                <li key={cl.id} className="flex items-center justify-between">
                  <Link href={`/clients/${cl.slug}`} className="text-sky-300 hover:underline">
                    {cl.name}
                  </Link>
                  <span className="text-neutral-500">
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
            <p className="text-sm text-neutral-400">Sem operações registradas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-neutral-300">
                    <span className="text-neutral-500">{log.action}</span> {log.entity_type}
                    {log.summary ? ` — ${log.summary}` : ''}
                  </span>
                  <span className="shrink-0 text-neutral-500">{formatDate(log.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
