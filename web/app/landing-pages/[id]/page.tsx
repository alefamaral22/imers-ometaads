import { notFound } from 'next/navigation';
import { requireOperator } from '../../../lib/auth/server';
import { getLandingPage, listSections } from '../../../lib/services/landing-sections';
import { Shell } from '../../../components/shell';
import { Badge, EmptyState, PageHeader } from '../../../components/ui';
import { SectionEditor } from '../../../components/landing/section-editor';

export const dynamic = 'force-dynamic';

export default async function LandingPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await params;

  const lp = await getLandingPage(id).catch(() => null);
  if (!lp) notFound();

  let sections: Awaited<ReturnType<typeof listSections>> = [];
  let error: string | null = null;
  try {
    sections = await listSections(lp.id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'erro ao ler as seções';
  }

  return (
    <Shell>
      <PageHeader title={lp.subdomain} subtitle="Editor de landing page (rascunho)" />
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Badge value={lp.status} />
        <Badge value={lp.draft_status} />
        <span className="text-neutral-500">{lp.noindex ? 'noindex' : 'indexável'}</span>
      </div>

      {error ? (
        <EmptyState>Seções indisponíveis: {error}</EmptyState>
      ) : sections.length === 0 ? (
        <EmptyState>Esta landing page ainda não tem seções.</EmptyState>
      ) : (
        <SectionEditor
          landingPageId={lp.id}
          initialSections={sections.map((s) => ({
            id: s.id,
            type: s.type,
            position: s.position,
            enabled: s.enabled,
            version: s.version,
            fields: s.fields,
          }))}
        />
      )}
    </Shell>
  );
}
