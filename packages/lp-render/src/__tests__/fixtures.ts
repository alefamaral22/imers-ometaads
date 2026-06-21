// A representative, valid ContentDoc used across tests. Covers several of the 17 sections,
// optional settings, and array/object nested copy so the message-extraction is exercised.
import type { ContentDoc } from '../content-doc.js';
import { defaultTheme } from '../theme/theme.js';

export const sampleDoc: ContentDoc = {
  settings: {
    subdomain: 'curso-exemplo',
    locale: 'pt',
    noindex: true,
    checkoutUrl: 'https://pay.example.com/curso-exemplo',
    priceCents: 19700,
    currency: 'BRL',
    cartState: 'open',
    affiliateEnabled: true,
    consentRequired: true,
    utmDefaults: { source: 'facebook', medium: 'paid' },
    tracking: { metaPixelId: '123456789012345' },
  },
  theme: defaultTheme,
  sections: [
    {
      type: 'hero',
      position: 0,
      enabled: true,
      version: 1,
      fields: {
        eyebrow: 'Curso Exemplo',
        headline: 'Aprenda a gerar tráfego que converte',
        subheadline: 'Método validado em centenas de campanhas.',
        cta: { label: 'Quero começar agora', action: 'checkout' },
      },
    },
    {
      type: 'features',
      position: 1,
      enabled: true,
      version: 1,
      fields: {
        headline: 'O que você recebe',
        features: [
          { icon: 'check', title: 'Aulas práticas', description: 'Passo a passo aplicável.' },
          { icon: 'bolt', title: 'Templates', description: 'Pronto para usar.' },
        ],
      },
    },
    {
      type: 'footer',
      position: 2,
      enabled: true,
      version: 1,
      fields: {
        copyright: '© 2026 Acme',
        links: [{ label: 'Privacidade', href: '/privacidade' }],
      },
    },
  ],
};
