import Link from 'next/link';
import { requireRole } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { listClients } from '../../lib/services/clients';
import { Shell } from '../../components/shell';
import { EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatCents, formatDate } from '../../lib/domain/format';
import { ClientForm } from '../../components/clients/client-form';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const claims = await requireRole(['super_admin', 'socio']);

  let error: string | null = null;
  let clients: Awaited<ReturnType<typeof listClients>> = [];
  try {
    clients = await listClients(scopeFromClaims(claims));
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Clientes"
        subtitle="Cadastre clientes e seus produtos. O cliente vira opção ao criar landing pages e campanhas."
      />

      <ClientForm />

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}
      {!error && clients.length === 0 ? (
        <EmptyState>Nenhum cliente cadastrado ainda.</EmptyState>
      ) : null}

      {clients.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Slug</Th>
              <Th>Ad Account</Th>
              <Th>Teto diário</Th>
              <Th>Moeda</Th>
              <Th>Criado</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/clients/${c.slug}`} className="text-accent hover:underline">
                    {c.name}
                  </Link>
                </Td>
                <Td>{c.slug}</Td>
                <Td>{c.ad_account_id ?? '—'}</Td>
                <Td>{formatCents(c.daily_budget_cap_cents, c.currency)}</Td>
                <Td>{c.currency}</Td>
                <Td>{formatDate(c.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
