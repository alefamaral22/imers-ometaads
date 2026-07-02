import Link from 'next/link';
import { requireRole } from '../../../lib/auth/server';
import { getBusinessDashboard } from '../../../lib/services/admin-metrics';
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
import { formatDate } from '../../../lib/domain/format';

export const dynamic = 'force-dynamic';

export default async function AdminBusinessPage() {
  await requireRole(['super_admin', 'socio']);

  let error: string | null = null;
  let dashboard: Awaited<ReturnType<typeof getBusinessDashboard>> | null = null;
  try {
    dashboard = await getBusinessDashboard(new Date());
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Negócio"
        subtitle="Visão de negócio da agência: contas por status, vencimentos próximos e lacunas de credenciais."
      />

      {error || !dashboard ? (
        <EmptyState>Dados indisponíveis: {error}</EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Contas" value={dashboard.counts.total} tone="accent" />
            <Stat label="Ativas" value={dashboard.counts.active} tone="pos" />
            <Stat label="Em trial" value={dashboard.counts.trialing} tone="accent2" />
            <Stat label="Bloqueadas" value={dashboard.counts.blocked} tone="danger" />
          </div>

          <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Vencendo em 7 dias</h2>
          {dashboard.expiringSoon.length === 0 ? (
            <EmptyState>
              Nenhuma conta com trial ou período vencendo nos próximos 7 dias.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Conta</Th>
                  <Th>Status</Th>
                  <Th>Trial expira</Th>
                  <Th>Período até</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {dashboard.expiringSoon.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.name}</Td>
                    <Td>
                      <Badge value={a.subscription_status} />
                    </Td>
                    <Td>{formatDate(a.trial_ends_at)}</Td>
                    <Td>{formatDate(a.current_period_end)}</Td>
                    <Td>
                      <Link href={`/accounts/${a.id}`} className="text-accent hover:underline">
                        Ver detalhe
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Contas sem credenciais</h2>
          {dashboard.withoutCredentials.length === 0 ? (
            <EmptyState>Todas as contas têm ao menos uma credencial cadastrada.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Conta</Th>
                  <Th>Status</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {dashboard.withoutCredentials.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.name}</Td>
                    <Td>
                      <Badge value={a.subscription_status} />
                    </Td>
                    <Td>
                      <Link href={`/accounts/${a.id}`} className="text-accent hover:underline">
                        Cadastrar credencial
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <h2 className="mt-8 mb-3 text-sm font-semibold text-ink/80">Atividade recente</h2>
          {dashboard.recentActivity.length === 0 ? (
            <EmptyState>Nenhuma atividade registrada ainda.</EmptyState>
          ) : (
            <Card>
              <CardTitle>Últimas operações</CardTitle>
              <ul className="space-y-2 text-sm text-ink/80">
                {dashboard.recentActivity.map((log) => (
                  <li
                    key={log.id}
                    className="flex justify-between gap-4 border-b border-edge/30 pb-2"
                  >
                    <span>{log.summary ?? `${log.action} em ${log.entity_type}`}</span>
                    <span className="whitespace-nowrap text-xs text-dim">
                      {formatDate(log.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}
