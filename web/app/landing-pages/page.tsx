import { requireOperator } from '../../lib/auth/server';
import { listLandingPages } from '../../lib/services/landing-pages';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatCents, formatDate } from '../../lib/domain/format';

export const dynamic = 'force-dynamic';

export default async function LandingPagesPage() {
  await requireOperator();

  let error: string | null = null;
  let pages: Awaited<ReturnType<typeof listLandingPages>> = [];
  try {
    pages = await listLandingPages(200);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader
        title="Landing pages"
        subtitle="Páginas geradas e publicadas. Rascunhos nascem noindex (preview)."
      />
      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}
      {!error && pages.length === 0 ? <EmptyState>Nenhuma landing page ainda.</EmptyState> : null}

      {pages.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Subdomínio</Th>
              <Th>Status</Th>
              <Th>Rascunho</Th>
              <Th>Preço</Th>
              <Th>Carrinho</Th>
              <Th>Index</Th>
              <Th>Atualizada</Th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <Td>
                  {p.url ? (
                    <a href={p.url} className="text-sky-300 hover:underline">
                      {p.subdomain}
                    </a>
                  ) : (
                    p.subdomain
                  )}
                </Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td>{p.draft_status}</Td>
                <Td>{formatCents(p.price_cents)}</Td>
                <Td>{p.cart_state}</Td>
                <Td>{p.noindex ? 'noindex' : 'indexável'}</Td>
                <Td>{formatDate(p.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
