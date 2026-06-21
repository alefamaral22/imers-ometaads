import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acme — Dashboard',
  description: 'Painel do operador da agência de tráfego Meta Ads operada por IAs (Nexus).',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
