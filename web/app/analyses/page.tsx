import { requireOperator } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { listAnalyses } from '../../lib/services/analyses';
import { Shell } from '../../components/shell';
import { Badge, EmptyState, PageHeader, Table, Td, Th } from '../../components/ui';
import { formatDate, formatInteger } from '../../lib/domain/format';

export const dynamic = 'force-dynamic';

export default async function AnalysesPage() {
  const scope = scopeFromClaims(await requireOperator());

  let error: string | null = null;
  let analyses: Awaited<ReturnType<typeof listAnalyses>> = [];
  try {
    analyses = await listAnalyses(scope, 100);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler o banco';
  }

  return (
    <Shell>
      <PageHeader title="Análises" subtitle="Diagnósticos de performance gravados pelas skills." />
      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}
      {!error && analyses.length === 0 ? (
        <EmptyState>Nenhuma análise registrada ainda.</EmptyState>
      ) : null}
      {analyses.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Veredito</Th>
              <Th>Objetivo</Th>
              <Th>Janela</Th>
              <Th>Entidades</Th>
              <Th>Resumo</Th>
              <Th>Quando</Th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((a) => (
              <tr key={a.id}>
                <Td>
                  <Badge value={a.overall_verdict} />
                </Td>
                <Td>{a.objective ?? '—'}</Td>
                <Td>
                  {a.window_start ? formatDate(a.window_start) : '—'} →{' '}
                  {a.window_stop ? formatDate(a.window_stop) : '—'}
                </Td>
                <Td>{formatInteger(a.entities_analyzed)}</Td>
                <Td>{a.summary ?? '—'}</Td>
                <Td>{formatDate(a.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Shell>
  );
}
