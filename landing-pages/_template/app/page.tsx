import type { ReactElement } from 'react';
import { contentSpec } from '../lib/spec';
import { renderSection } from '../components/sections';

// The whole landing page is the ordered list of enabled sections from the content-spec artifact.
// Server component, statically rendered at build time (output: 'export').
export default function Page(): ReactElement {
  const ctx = {
    ...(contentSpec.settings.checkoutUrl !== undefined && {
      checkoutUrl: contentSpec.settings.checkoutUrl,
    }),
    currency: contentSpec.settings.currency ?? 'BRL',
  };

  const ordered = [...contentSpec.sections].sort((a, b) => a.position - b.position);

  return (
    <main>
      {ordered.map((section) => (
        <div key={`${section.type}-${section.position}`}>{renderSection(section, ctx)}</div>
      ))}
    </main>
  );
}
