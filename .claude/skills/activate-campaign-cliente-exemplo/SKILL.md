---
name: activate-campaign-cliente-exemplo
description: Ativa uma campanha PAUSED do cliente-exemplo (kind activate) APÓS revalidação de segurança — cliente correto, estado PAUSED, orçamento dentro do teto. Aborta por padrão na dúvida. Liga gasto real; só liga o que passou em TODAS as checagens. Loga action=activate. Headless.
allowed-tools: Read, Write, Bash(npx tsx:*), mcp__claude_ai_META_ADS__ads_get_ad_accounts, mcp__claude_ai_META_ADS__ads_get_ad_entities, mcp__claude_ai_META_ADS__ads_activate_entity, mcp__claude_ai_META_ADS__ads_update_entity
---

# activate-campaign-cliente-exemplo

Skill **headless** que coloca uma campanha **no ar (gasto real)**. Por isso o viés é **negar**: a
ativação só acontece se **todas** as checagens passarem (`evaluateActivation`). Persistência via
**REST + `SUPABASE_SECRET_KEY`** (nunca o MCP do Supabase). Ver ADR `0007-ativacao-com-revalidacao`.

## Regras invioláveis

- **Default deny:** qualquer ausência/ambiguidade → **aborta** sem tocar a Meta.
- Só ativa o que está **PAUSED**, do **cliente correto**, com **orçamento ≤ teto** e teto > 0.
- As `allowed-tools` de escrita são **apenas** `ads_activate_entity`/`ads_update_entity` (status). **Sem**
  `create`/`delete`. Least privilege.
- `operation_logs` (`action='activate'`) por mutação; manifest com o resultado das checagens.

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. MCP da Meta conectado. Args: `CAMPAIGN_ID` (uuid no
  Supabase). Aborte se faltar.

## Fluxo

1. **Cliente** — `lista-de-clientes` (`SLUG=cliente-exemplo`); extraia `id`, `daily_budget_cap_cents`.
2. **Ler a campanha + ad_sets do banco** (não da Meta, não de args livres) via `selectRows`
   (`scripts/onda2/infrastructure/supabase-rest.ts`):
   - `campaigns?id=eq.<CAMPAIGN_ID>&select=id,client_id,meta_campaign_id,status,daily_budget_cents`
   - `ad_sets?campaign_id=eq.<CAMPAIGN_ID>&select=id,meta_ad_set_id,status,daily_budget_cents`
3. **Revalidar** com a lógica pura:

   ```bash
   npx tsx -e "
   import { evaluateActivation } from './scripts/onda5/domain/activation.ts';
   import { buildActivationManifest, manifestPath } from './scripts/onda5/application/manifest.ts';
   // monte { clientId, capCents, campaign, adSets } a partir do JSON lido e imprima a decisão
   "
   ```

   Se `allowed === false`: **escreva o manifest** (com `checks`/`reasons`) e **pare** — nada na Meta.
4. **Ativar na Meta** (só se allowed): `ads_activate_entity`/`ads_update_entity` para `status=ACTIVE`
   na campanha e nos ad_sets/ads (use os `meta_*_id` lidos do banco).
5. **Refletir no banco** — `patchById` (`scripts/onda5/infrastructure/meta-rest.ts`) com
   `activationPatch()` (`{status:'ACTIVE'}`) em `campaigns`/`ad_sets`/`ads`; um `operation_logs`
   (`action='activate'`, `actor='skill'`) por entidade (`insertRow`).
6. **Manifest** — `tentativas-geracao-de-campanhas/<stamp>-activate.json`.

## Critérios de aceite

Só liga o que passou em **todas** as validações; recusa por padrão na dúvida (manifest registra o
porquê); `operation_logs action='activate'` por entidade ativada; sem PII.
