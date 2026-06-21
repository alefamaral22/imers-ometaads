# ADR 0012 — Landing pages como sites estáticos no Cloudflare Pages

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 8

## Contexto

Cada landing page (LP) precisa ser rápida, isolada das outras, indexável só quando o operador
decidir, e publicável por uma skill headless do runner. Não há lógica server-side por requisição na
LP — todo o conteúdo é conhecido no momento da publicação (vem do Supabase). Precisamos de um alvo de
deploy barato, com domínio próprio por LP (`<subdomain>.example.com`) e SSL automático.

## Decisão

A LP é um **Next.js com `output: 'export'` (static export)**: `next build` gera HTML/CSS/JS estáticos
em `out/`, publicados no **Cloudflare Pages** sob `<subdomain>.example.com`. O conteúdo entra no build
pelos artefatos `generated/` (`content-spec.json` + `messages/pt.json` + `theme.css`) emitidos pelo
serializer de [[0017-pacote-template-lp-render]]. Rascunhos nascem `noindex=true` (preview); tornar
indexável é passo manual. O deploy é feito por `wrangler` na skill `publish-landing-page-<cliente>`.

## Consequências

- **Positivas:** custo e latência mínimos (CDN estática); isolamento total entre LPs; sem superfície
  server-side para atacar; preview seguro via `noindex`.
- **Negativas / trade-offs:** nenhuma personalização por requisição (countdowns/forms são client-side);
  republicar exige rebuild; o estado de conteúdo vive no banco, não nos arquivos ([[0015-lp-editavel-no-supabase]]).
- **Riscos & mitigação:** ir ao ar sem querer → `noindex` default + go-live manual; SSRF no
  screenshotter de review restrito a `*.example.com` (Onda 9).

## Alternativas consideradas

- **SSR na Vercel por LP** — rejeitado: superfície server-side desnecessária e mais caro; o conteúdo é
  estático no momento do publish.
- **Gerador de site custom (sem Next)** — rejeitado: perderíamos o ecossistema React/build maduro.
