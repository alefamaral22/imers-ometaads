# ADR 0015 — Conteúdo da LP (ContentDoc) editável no Supabase, não em arquivos

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 8

## Contexto

A LP é editada pelo dashboard (Onda 9) e gerada por skills (Onda 8). Se o conteúdo morasse em arquivos
no repo de cada LP, edições exigiriam commits/rebuilds e não haveria fonte única de verdade consultável
pelo dashboard. Já temos o Supabase como único canal entre planos (SPEC-000 §1, [[0002-supabase-persistence]]).

## Decisão

O conteúdo vive no **Supabase** como um **ContentDoc** = `{ settings, theme, sections[] }`, persistido
em `landing_pages` (`settings`/`theme`/`content_spec` jsonb) + `landing_page_sections` (`fields` jsonb,
uma linha por seção). O pacote [[0017-pacote-template-lp-render]] **serializa** o ContentDoc do banco
para os artefatos de build (`content-spec.json` + `messages/pt.json` + `theme.css`) com `tsx`, no momento
do publish. Editar = atualizar linhas (síncrono); publicar = job pesado enfileirado que serializa do
banco e faz `next build` + deploy.

## Consequências

- **Positivas:** fonte única de verdade consultável; edição sem rebuild; publish reproduz o estado do
  banco; validação por seção via Zod ([[0013-design-system-da-lp]]).
- **Negativas / trade-offs:** os artefatos de build são derivados (não editar à mão); divergência
  possível entre rascunho e publicado → `published_snapshot jsonb` registra o que foi ao ar.
- **Riscos & mitigação:** conteúdo não confiável no jsonb → re-validado por Zod na fronteira do
  serializer antes de gerar qualquer artefato.

## Alternativas consideradas

- **Conteúdo em MDX/JSON no repo da LP** — rejeitado: edição via dashboard ficaria por commit/rebuild.
- **CMS externo** — rejeitado: segundo canal/sistema; o Supabase já é a fonte da verdade.
