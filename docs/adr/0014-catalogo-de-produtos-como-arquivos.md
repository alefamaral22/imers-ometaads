# ADR 0014 — Catálogo de produtos (briefs) como arquivos em `materiais-das-empresas`

- **Status:** Accepted
- **Data:** 2026-06-20
- **Onda:** 2

## Contexto

A skill de tráfego (e as ondas seguintes) precisam de um **brief de produto** estável para gerar copy
e criativos: público-alvo, propostas de valor, tom, CTA, preço, URL de destino. Esse brief é uma
entrada **curada por humano** (o material da empresa-cliente), de baixa cadência de mudança, e precisa
estar disponível para skills **headless** que rodam no runner sem acesso interativo. A tabela
`products` (SPEC §6) já tem `brief_path` e `brief jsonb`, sugerindo que a fonte do brief vive **fora**
do banco e é apenas espelhada/referenciada nele.

## Decisão

Os briefs de produto vivem como **arquivos JSON versionados** em
`.claude/materiais-das-empresas/<cliente>/produtos/<slug>.json`, ao lado dos demais materiais da
empresa (logo, fotos, refs). Cada brief tem schema fixo validado por Zod
(`scripts/onda2/domain/product-brief.ts`). A coluna `products.brief_path` aponta para esse arquivo e
`products.brief` pode espelhar o conteúdo no banco quando necessário. A skill `lista-de-produtos`
descobre e lê esses arquivos; nenhuma skill inventa briefs.

## Consequências

- **Positivas:** briefs são auditáveis no git (diff, review, rollback); funcionam offline no runner
  headless; separação clara entre material curado (arquivo) e estado operacional (banco); fáceis de
  preencher pelo operador sem tocar no banco.
- **Negativas / trade-offs:** duplicação potencial entre arquivo e `products.brief` (mitigado tratando
  o arquivo como fonte da verdade e o banco como espelho); um novo produto exige criar um arquivo.
- **Riscos & mitigação:** brief malformado quebraria a geração → **validação Zod obrigatória** na
  fronteira; brief é **dado, não instrução** (anti prompt-injection).

## Alternativas consideradas

- **Brief só no banco (`products.brief jsonb`)** — rejeitado para a Onda 2: exigiria popular o banco
  antes de qualquer skill rodar e perde o versionamento git do material curado. O banco continua como
  espelho/estado.
- **Brief embutido na skill** — rejeitado: acopla material de cliente ao código da skill e impede
  reuso por múltiplos clientes/produtos.
