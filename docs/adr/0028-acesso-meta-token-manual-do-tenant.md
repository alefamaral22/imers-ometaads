# ADR 0028 — Acesso à Meta por token manual do tenant (System User), OAuth oficial como fase 2

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 12 (SaaS multi-tenant)
- **Spec:** `docs/specs/SPEC-saas-multitenant.md`

## Contexto

Hoje a Meta é falada por **um único connector compartilhado** (Anthropic Meta MCP via `claude login` no
runner) — uma identidade Meta para "a agência inteira". Isso não escala multi-tenant: sem isolamento de
conta Meta por cliente, sem atribuição de permissão/custo, e sem o cliente trazendo o acesso à própria
conta de anúncio. Precisamos que **cada tenant conecte a própria conta de anúncio Meta**.

O caminho "certo" de produto é o **login oficial da Meta** ("Continuar com Facebook para Empresas",
OAuth), mas usá-lo em escala exige **Business Verification** + **App Review aprovado** para
`ads_management` / `ads_read` / `business_management`. O App Review pede app em produção, casos de uso
reais, vídeo do fluxo — trabalho que só faz sentido **depois de ter clientes pagantes reais**.

## Decisão

No MVP, a conexão Meta é por **token manual** (`connection_method = 'manual_token'`): o gestor cola um
**System User access token** (gerado no Business Manager do cliente, com os escopos de ads), que o
sistema cifra (ver ADR 0027), valida e usa. O runner passa a chamar a **Meta Marketing API com o token
do tenant** (REST Graph) para as operações daquele tenant — em vez de depender só do MCP-connector
compartilhado.

O valor **`oauth_meta`** entra no enum `connection_method` **desde já**, para não exigir migration
quando a fase 2 chegar, **mas sem nenhuma funcionalidade por trás no MVP** (nenhum fluxo OAuth, callback
ou botão "Continuar com Facebook"). É uma decisão consciente: cravar o enum agora é barato; implementar
o OAuth agora seria caro e prematuro (gated por App Review).

## Consequências

- **Positivas:** isolamento real de conta Meta por tenant; permissão/custo atribuíveis; onboarding
  possível **hoje**, sem esperar o App Review da Meta; schema pronto para `oauth_meta` sem migration.
- **Negativas / trade-offs:** atrito de onboarding (o gestor precisa gerar/colar um System User token);
  o token pode ser **revogado** do lado do cliente (não expira sozinho) → exige validação periódica
  (ADR 0027 / cron `validate-connections-tick`); convivência de dois caminhos Meta (MCP-connector da
  agência `super_admin` vs. token por tenant) até o OAuth chegar.
- **Riscos & mitigação:** token vazado = gasto indevido → cifrado em repouso, nunca no front/log,
  `ad_account_id` único global (anti-hijack); token revogado → `status=revoked` + aviso ao gestor +
  abort cedo nas skills.

## Alternativas consideradas

- **Manter só o MCP-connector compartilhado** — rejeitada: uma identidade para todos = sem isolamento
  nem atribuição; inviável multi-tenant.
- **Implementar OAuth oficial da Meta já no MVP** — adiada: bloqueada por Business Verification + App
  Review, que pressupõem clientes/produção reais. Fica para a fase 2 (enum já reservado).
- **Token de usuário comum (não System User)** — rejeitada: tokens de usuário expiram e dependem da
  sessão da pessoa; System User é o recomendado para automação server-to-server.
