import { requireRole } from '../../lib/auth/server';
import { listPlans } from '../../lib/services/plans';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatCents } from '../../lib/domain/format';
import { PlanForm } from '../../components/plans/plan-form';
import { PlanToggle } from '../../components/plans/plan-toggle';

export const dynamic = 'force-dynamic';

/** Limite null = ilimitado (∞). */
function limit(v: number | null): string {
  return v === null ? '∞' : String(v);
}

export default async function PlansPage() {
  // socio também vê (visibilidade global), mas só super_admin cria/edita/desativa.
  const claims = await requireRole(['super_admin', 'socio']);
  const isAdmin = claims.role === 'super_admin';

  let error: string | null = null;
  let plans: Awaited<ReturnType<typeof listPlans>> = [];
  try {
    plans = await listPlans();
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Planos"
        subtitle={
          isAdmin
            ? 'Catálogo comercial. Preço em R$/mês, limites por recurso (vazio = ilimitado). Desativar remove do cadastro de novas contas sem afetar quem já usa.'
            : 'Planos da plataforma (somente leitura).'
        }
      />

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      {isAdmin ? <PlanForm /> : null}

      {!error && plans.length === 0 ? (
        <EmptyState>Nenhum plano cadastrado ainda.</EmptyState>
      ) : null}

      {plans.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Plano</Th>
              <Th>Preço/mês</Th>
              <Th>Trial</Th>
              <Th>Clientes</Th>
              <Th>Landing pages</Th>
              <Th>Campanhas</Th>
              <Th>Usuários</Th>
              <Th>Status</Th>
              {isAdmin ? <Th> </Th> : null}
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <Td>{p.name}</Td>
                <Td num>{formatCents(p.price_cents, p.currency)}</Td>
                <Td num>{p.trial_days > 0 ? `${p.trial_days}d` : '—'}</Td>
                <Td num>{limit(p.max_clients)}</Td>
                <Td num>{limit(p.max_landing_pages)}</Td>
                <Td num>{limit(p.max_campaigns)}</Td>
                <Td num>{limit(p.max_users)}</Td>
                <Td>
                  <Badge value={p.is_active ? 'ativa' : 'inativa'} />
                </Td>
                {isAdmin ? (
                  <Td>
                    <PlanToggle id={p.id} isActive={p.is_active} />
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
