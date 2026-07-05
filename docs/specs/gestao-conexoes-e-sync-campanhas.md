# SPEC — Gestão de conexões Meta e sincronização de campanhas

- **Status:** Draft
- **Onda:** pós-super-admin (gestão de conexões + import de campanhas)
- **ADR relacionado:** [0036](../adr/0036-gestao-de-conexoes-e-sync-campanhas-no-dashboard.md)

## 1. Problema

Em `/settings` e `/accounts/[id]` o operador conecta um token Meta, mas:

1. As campanhas que já existem na conta de anúncio **não aparecem** na Visão geral — só campanhas
   criadas pelo próprio sistema entram em `campaigns`.
2. Não há botão para **sincronizar** manualmente e ver o resultado na hora.
3. Não há como **editar** uma conexão (trocar token revogado, corrigir a conta de anúncio, mudar o
   rótulo) — só criar novas.
4. Não há como **apagar** uma conexão cadastrada por engano ou desativada.

## 2. Objetivo (vertical slice)

1. **Apagar conexão** — botão na tabela de conexões (`/settings`, `/accounts/[id]`), com confirmação.
   `DELETE /api/data/connections/:id`, escopado por account.
2. **Editar conexão** — botão que reabre o formulário preenchido (token em branco). Permite trocar
   `meta_ad_account_id`, `token_label` e, opcionalmente, o token. `PATCH /api/data/connections/:id`.
   Trocar o token volta `status` para `unverified`.
3. **Sincronizar campanhas** — botão "Sincronizar campanhas" por conexão. Lê `GET
   /act_<id>/campaigns` na Graph API com o token decifrado da conexão, faz upsert em `public.campaigns`
   pelo cliente resolvido, e devolve quantas campanhas foram importadas/atualizadas.
   `POST /api/data/connections/:id/sync-campaigns`.

## 3. Resolução do cliente no sync

Campanhas pertencem a um `client_id` (`campaigns.client_id`), não a uma conexão. Regra de resolução,
sempre explícita (nunca fallback silencioso):

1. Se `ad_account_connections.client_id` está preenchido → usa esse cliente.
2. Senão, lista os clientes da `account_id` da conexão. Exatamente 1 → usa esse.
3. Senão (0 ou 2+) → aborta com erro `client_ambiguous` (0) ou `client_required` (2+); a UI explica
   e pede para vincular a conexão a um cliente antes de sincronizar.

## 4. Contrato dos campos importados

Cada campanha da Graph API (`id`, `name`, `objective`, `status`, `daily_budget` opcional) é dado de
fronteira — validado por schema antes do upsert. Mapeamento:

| Campo Meta         | Coluna `campaigns`       | Nota                                             |
| ------------------- | ------------------------ | ------------------------------------------------ |
| `id`                 | `meta_campaign_id`        | chave do upsert (`on_conflict=meta_campaign_id`) |
| `name`               | `name`                     |                                                  |
| `objective`          | `objective`                |                                                  |
| `status`             | `status`                   | mapeado para o enum local (ACTIVE/PAUSED/…)      |
| `daily_budget`       | `daily_budget_cents`       | já vem em centavos da Graph API; null se ausente |

Campanhas sem `daily_budget` nem `lifetime_budget` (orçamento no ad set) entram com
`daily_budget_cents = null` — nunca `0` (dinheiro ausente é `null`, nunca zero, por convenção do
projeto).

## 5. Critérios de aceite

- Apagar: conexão desaparece da tabela; `cliente_usuario` só apaga conexões da própria account.
- Editar: token novo re-cifrado, `status` volta a `unverified`; editar só rótulo/ad account não pede
  token.
- Sincronizar: campanhas existentes na Meta aparecem em `campaigns` e na Visão geral após o refresh;
  token revogado → erro claro e conexão marcada `invalid`; 0 ou 2+ clientes na account sem vínculo
  explícito → aborta sem gravar nada.
- Todas as três ações exigem sessão autenticada e respeitam o escopo de account (RLS deny-by-default
  + `service_role` server-side).

## 6. Fora de escopo

- Sincronização automática/periódica (é sempre manual, por clique).
- Importar ad sets/ads/criativos (só o nível de campanha).
- OAuth oficial da Meta (continua fora, como no ADR 0028/0035).
