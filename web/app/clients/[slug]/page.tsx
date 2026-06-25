import { notFound } from 'next/navigation';
import { requireOperator } from '../../../lib/auth/server';
import { scopeFromClaims } from '../../../lib/multitenant/scope';
import { getClientBySlug } from '../../../lib/services/clients';
import { listCampaignsByClient } from '../../../lib/services/campaigns';
import { listAnalysesByClient } from '../../../lib/services/analyses';
import { listLandingPagesByClient } from '../../../lib/services/landing-pages';
import { listOperationLogsByClient } from '../../../lib/services/logs';
import { Shell } from '../../../components/shell';
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
} from '../../../components/ui';
import { formatCents, formatDate } from '../../../lib/domain/format';

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const scope = scopeFromClaims(await requireOperator());
  const { slug } = await params;

  // Escopado: um cliente_usuario que tente abrir /clients/<outro> recebe notFound (não 403, p/ não
  // confirmar a existência do recurso de outra account).
  const client = await getClientBySlug(scope, slug).catch(() => null);
  if (!client) notFound();

  let error: string | null = null;
  let campaigns: Awaited<ReturnType<typeof listCampaignsByClient>> = [];
  let analyses: Awaited<ReturnType<typeof listAnalysesByClient>> = [];
  let pages: Awaited<ReturnType<typeof listLandingPagesByClient>> = [];
  let logs: Awaited<ReturnType<typeof listOperationLogsByClient>> = [];
  try {
    [campaigns, analyses, pages, logs] = await Promise.all([
      listCampaignsByClient(client.id),
      listAnalysesByClient(client.id, 10),
      listLandingPagesByClient(client.id),
      listOperationLogsByClient(client.id, 10),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader title={client.name} subtitle={`Cliente · ${client.slug}`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Teto diário"
          value={formatCents(client.daily_budget_cap_cents, client.currency)}
        />
        <Stat label="Moeda" value={client.currency} />
        <Stat label="Campanhas" value={campaigns.length} />
        <Stat label="Landing pages" value={pages.length} />
      </div>

      {error ? (
        <div className="mt-6">
          <EmptyState>Dados indisponíveis: {error}</EmptyState>
        </div>
      ) : null}

      <div className="mt-8">
        <CardTitle>Campanhas</CardTitle>
        {campaigns.length === 0 ? (
          <EmptyState>Nenhuma campanha para este cliente.</EmptyState>
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
              {campaigns.map((c) => (
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
          <CardTitle>Análises recentes</CardTitle>
          {analyses.length === 0 ? (
            <p className="text-sm text-dim">Nenhuma análise.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {analyses.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3">
                  <Badge value={a.overall_verdict} />
                  <span className="truncate text-ink/80">{a.summary ?? a.objective ?? '—'}</span>
                  <span className="shrink-0 text-dim">{formatDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Operações</CardTitle>
          {logs.length === 0 ? (
            <p className="text-sm text-dim">Sem operações.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink/80">
                    <span className="text-dim">{log.action}</span> {log.entity_type}
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
