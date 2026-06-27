import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { contentSpec } from '../lib/spec';
import './globals.css';
// Design tokens emitted by @template/lp-render (themeToCss). Defines the CSS custom properties
// consumed by globals.css. Regenerated per LP at publish time.
import '../generated/theme.css';

// Drafts are noindex (preview). Going live (indexable) is a deliberate manual step. SPEC-000 §8.
export const metadata: Metadata = {
  title: contentSpec.settings.subdomain,
  ...(contentSpec.settings.noindex && { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang={contentSpec.settings.locale}>
      <head>
        {/* Platform type pairing: Bricolage Grotesque (display) + Figtree (body). Loaded at the
            visitor's browser (not build time) so the static export never depends on network
            during the headless build. preconnect + display=swap avoid FOIT/layout shift. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400..700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
