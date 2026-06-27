---
name: publish-landing-page-cliente-exemplo
description: Publica uma landing page do cliente-exemplo em preview — serializa o ContentDoc do banco (@template/lp-render) para o template, roda next build (static export) e faz wrangler deploy no Cloudflare Pages em <subdomain>.example.com. Patcha landing_pages (deployed). Headless e idempotente.
allowed-tools: Read, Write, Glob, Bash(npx tsx:*), Bash(bash scripts/publish-lp-launch.sh:*)
---

# publish-landing-page-cliente-exemplo

Skill **headless** que **serializa do banco → builda → publica**. Conteúdo vem de `landing_pages` +
`landing_page_sections` (fonte da verdade), não de arquivos. Persistência via **REST +
`SUPABASE_SECRET_KEY`**. Ver ADR 0012 (Cloudflare Pages) e SPEC-011.

## Regras invioláveis

- Publica em **preview** `<subdomain>.example.com`, mantendo **`noindex`** (go-live é manual).
- Serializa **a partir do banco** (não de arquivos soltos): single source of truth.
- Idempotente: re-publicar o mesmo subdomain atualiza o mesmo projeto Pages.
- Segredos (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`) só via env. Sem PII em logs/manifest.
- **Build assíncrono**: o `next build` leva ~10 min no VM, acima do timeout de 10 min da ferramenta
  Bash. Por isso a skill NÃO builda nem deploya: ela serializa, marca a LP `building` e lança o worker
  **destacado** (`scripts/publish-lp-launch.sh` → `scripts/publish-lp.sh`), que grava `deployed`+url
  (ou `failed`) sozinho. A skill termina em segundos; a UI mostra "Em construção" até o worker concluir.

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
  Args: `SUBDOMAIN` (ou `LANDING_PAGE_ID`). Aborte se faltar.

## Fluxo

1. **Ler a LP + seções** via `selectRows` (`scripts/onda2/infrastructure/supabase-rest.ts`):
   `landing_pages?subdomain=eq.<SUBDOMAIN>&select=*` e
   `landing_page_sections?landing_page_id=eq.<id>&order=position.asc&select=*`.
2. **Montar o ContentDoc** — `assembleContentDoc(lp, sectionRows)`
   (`scripts/onda8/application/publish-plan.ts`): ordena por position, valida invariantes. Valide
   também com `parseContentDoc` de `@template/lp-render` (deep). Inválido → **aborte**.
3. **Serializar para o template** — escreva `landing-pages/_template/content-doc.json` com o ContentDoc
   e rode o serializer (CLI do pacote):

   ```bash
   npx tsx packages/lp-render/src/serializer/cli.ts \
     --in landing-pages/_template/content-doc.json \
     --out landing-pages/_template/generated
   ```

   (gera `content-spec.json` + `messages/pt.json` + `theme.css`).
4. **Lançar build+deploy em background** — rode **exatamente** (uma única chamada, retorna em segundos):

   ```bash
   bash scripts/publish-lp-launch.sh <SUBDOMAIN>
   ```

   Isso marca a LP como `building` e dispara o worker **destacado** que builda o export estático e faz
   `wrangler pages deploy`, gravando ele mesmo `status='deployed'`+`url` (ou `failed`) ao terminar
   (~10 min depois). **NÃO** rode o build nem o deploy você mesmo, e **NÃO** fique esperando/poll — só
   confirme que o lançador retornou e **encerre relatando** que a publicação está em andamento (building).

## Critérios de aceite

A skill serializa do banco, marca `building` e retorna em segundos com o worker lançado; o worker
publica uma página acessível (200) em preview e patcha `landing_pages` para `deployed` com `url`
(ou `failed` em erro); re-publicar não duplica o projeto Pages.
