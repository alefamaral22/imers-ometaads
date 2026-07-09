import { requireOperator } from '../../lib/auth/server';
import { scopeFromClaims } from '../../lib/multitenant/scope';
import { listCreatives } from '../../lib/services/creatives';
import { listClients } from '../../lib/services/clients';
import { Shell } from '../../components/shell';
import { EmptyState, PageHeader } from '../../components/ui';
import { GenerateCreativeForm } from '../../components/creatives/generate-form';
import { CreativeCard } from '../../components/creatives/creative-card';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending_approval', label: 'Aguardando aprovação' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Rejeitados' },
  { value: 'draft', label: 'Rascunhos' },
] as const;

export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const claims = await requireOperator();
  const scope = scopeFromClaims(claims);
  const params = await searchParams;

  let error: string | null = null;
  let creatives: Awaited<ReturnType<typeof listCreatives>> = [];
  let clients: Awaited<ReturnType<typeof listClients>> = [];
  try {
    clients = await listClients(scope);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler clientes';
  }

  try {
    creatives = await listCreatives(scope, {
      ...(params.client ? { clientId: params.client } : {}),
      ...(params.status ? { status: params.status } : {}),
    });
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler criativos';
  }

  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <Shell>
      <PageHeader
        title="Criativos"
        subtitle="Peça pro Trafegante gerar imagens com IA, revise o que ele criou e aprove ou rejeite antes de ir pra campanha. Cada cliente usa a própria chave OpenAI."
      />

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink/80">Gerar novo criativo</h2>
        <GenerateCreativeForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {error ? <EmptyState>Dados indisponíveis: {error}</EmptyState> : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink/80">Criativos</h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <a
              key={f.value}
              href={f.value ? `/creatives?status=${f.value}` : '/creatives'}
              className={`rounded-full border px-2.5 py-1 text-[11px] tracking-wide uppercase transition-colors ${
                (params.status ?? '') === f.value
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-edge/60 text-dim hover:border-edge hover:text-ink/80'
              }`}
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>

      {!error && creatives.length === 0 ? (
        <EmptyState>
          Nenhum criativo ainda. Gere um acima ou peça pro Trafegante criar um pra revisão.
        </EmptyState>
      ) : null}

      {creatives.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {creatives.map((cr) => (
            <div key={cr.id}>
              {cr.client_id ? (
                <p className="mb-1 truncate text-[10px] tracking-wide text-dim uppercase">
                  {clientName.get(cr.client_id) ?? cr.client_id}
                </p>
              ) : null}
              <CreativeCard
                id={cr.id}
                name={cr.name}
                headline={cr.headline}
                primaryText={cr.primary_text}
                imageUrl={cr.image_url}
                status={cr.status}
                source={cr.source}
                prompt={cr.prompt}
                feedback={cr.feedback}
                createdAt={cr.created_at}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}
