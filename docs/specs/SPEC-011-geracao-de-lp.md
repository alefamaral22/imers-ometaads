# SPEC-011 — Geração de landing page (pacote `@template/lp-render` + `_template`)

> Feature spec da Onda 8 (parte de pacote/render). Escopo: o contrato ContentDoc → artefatos e o
> template static-export. As skills `create/publish-landing-page-<cliente>` (runner/Cloudflare) são a
> continuação da Onda 8 e ficam fora desta entrega. Ver ADRs [[0012-landing-no-cloudflare-pages]],
> [[0013-design-system-da-lp]], [[0015-lp-editavel-no-supabase]], [[0017-pacote-template-lp-render]].

## Objetivo

Transformar o **ContentDoc** persistido no Supabase em uma landing page estática, com um contrato único
e tipado compartilhado por skills, dashboard e template.

## Contrato (ContentDoc)

`ContentDoc = { settings, theme, sections[] }`:

- **settings** — `subdomain`, `locale: 'pt'`, `noindex` (default true), `cartState` (open/closed),
  `affiliateEnabled`, `consentRequired`, opcionais `checkoutUrl`, `priceCents`, `currency`,
  `utmDefaults`, `tracking`. Mapeia `landing_pages.settings`.
- **theme** — tokens de design (cores hex, fontes, raio, largura), charset restrito por regex.
  Mapeia `landing_pages.theme`. Serializado para `theme.css` (CSS custom properties) por `themeToCss`.
- **sections[]** — `{ type, position, enabled, version, fields }`, uma por linha de
  `landing_page_sections`. `type` ∈ catálogo fechado de **17 seções**; `fields` validado por schema
  Zod estrito da seção.

Toda entrada é **dado não confiável**: validada por Zod na fronteira (`parseContentDoc`) e renderizada
como texto/JSX escapado — nunca HTML cru.

## Serializer

`serialize(doc)` (puro, determinístico, sem I/O) → artefatos:

- `content-spec.json` — settings + seções habilitadas ordenadas por `position` (com seus `fields`).
- `messages/pt.json` — bag i18n plano: toda string vira `"<sectionKey>.<path>"`.
- `theme.css` — `:root { --color-*; --font-*; --radius; --max-width }`.

CLI `tsx src/serializer/cli.ts --in content-doc.json --out ./generated` (lê arquivo ou stdin). É a
fronteira pronta para a skill `publish-landing-page` (busca ContentDoc no Supabase → pipe → `next build`).

## Template (`landing-pages/_template`)

Next.js 15 `output: 'export'`. Consome **apenas** `generated/content-spec.json` (+ `theme.css`),
renderiza as seções por componentes dedicados (registry exaustivo das 17). `noindex` vira `<meta>` de
robots em rascunho. Build: `next build` → `out/` estático → Cloudflare Pages `<subdomain>.example.com`.

## Critérios de aceite (desta entrega)

- `@template/lp-render` com 17 seções, serializer determinístico e libs — `typecheck`/`test` verdes
  (golden tests do serializer).
- `_template` builda (`next build`) verde e exporta `out/index.html` a partir dos artefatos.
- Nenhuma entrada renderizada sem passar por validação Zod; `theme.css` não injeta CSS arbitrário.
