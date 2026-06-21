# ADR 0017 — Pacote compartilhado `@template/lp-render`

- **Status:** Accepted
- **Data:** 2026-06-21
- **Onda:** 8

## Contexto

Três consumidores precisam falar a mesma língua sobre o conteúdo da LP: as **skills** (geram/validam o
ContentDoc), o **dashboard** (edita por seção, Onda 9) e o **`_template`** (renderiza). Duplicar tipos
e regras de validação levaria a divergência. Precisamos de um único contrato versionado de
ContentDoc → artefatos de build.

## Decisão

Criamos o pacote de workspace **`@template/lp-render`** (`packages/lp-render`), sem dependências de
runtime além de Zod. Ele exporta: tipos e schemas `ContentDoc`/`Theme`/`Settings`; o **catálogo de 17
seções** com schema por seção; o **serializer** puro e determinístico `serialize(doc)` →
`{ messages/pt.json, content-spec.json, theme.css }` (mesmo input ⇒ saída byte-idêntica, testável por
golden tests) + CLI `tsx` (`--in/--out`); e libs de runtime (`checkout`, `utm`, `consent`,
`affiliate`). O `_template` depende **apenas do formato dos artefatos** (não do runtime do pacote),
mantendo o build estático desacoplado.

## Consequências

- **Positivas:** contrato único e tipado; serializer determinístico (golden tests); fronteira pronta
  para as skills `create/publish-landing-page` e para o editor da Onda 9.
- **Negativas / trade-offs:** mudança de contrato toca um pacote central → versionar com cuidado;
  o `_template` reespelha o tipo do artefato (acoplamento por formato, não por código — proposital).
- **Riscos & mitigação:** conteúdo não confiável → toda entrada do serializer passa por `parseContentDoc`
  (Zod) antes de qualquer escrita.

## Alternativas consideradas

- **Tipos copiados em cada consumidor** — rejeitado: divergência inevitável.
- **Serializer com I/O embutido** — rejeitado: pureza permite golden tests e reuso em dashboard/skills.
