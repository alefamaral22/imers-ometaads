import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acme — Dashboard',
  description: 'Painel do operador da agência de tráfego Meta Ads operada por IAs (Trafegante).',
  robots: { index: false, follow: false },
};

// CSP por nonce exige renderização DINÂMICA: o nonce é gerado por requisição no middleware, então
// uma página estática (HTML cacheado no build) carregaria scripts inline sem o nonce do request →
// o `strict-dynamic` os bloquearia e a página não hidrataria. Forçar dynamic em todo o app (que é um
// dashboard de dados ao vivo, sem ganho real de estático) garante que o Next aplique o nonce.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
