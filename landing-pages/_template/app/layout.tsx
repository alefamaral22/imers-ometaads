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
      <body>{children}</body>
    </html>
  );
}
