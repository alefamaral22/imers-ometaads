# 0035 — Token Meta por tenant substitui o MCP compartilhado na escrita de campanhas

- **Status:** Accepted
- **Data:** 2026-07-02
- **Onda:** feature/super-admin-completo
- **Contexto relacionado:** ADR 0026 (multi-tenancy app-layer), ADR 0027 (segredos por tenant
  cifrados), ADR 0028 (acesso à Meta por token manual do tenant — decisão original, nunca
  implementada na escrita), ADR 0032 (leitura Meta ao vivo via job — não afetada por esta decisão).

## Contexto

O ADR 0028 (Onda 12) já decidiu que cada tenant deveria conectar sua própria conta de anúncio Meta
via token manual (System User), cifrado, com o runner chamando a Marketing API REST com esse token
em vez de depender só do MCP-connector compartilhado da agência. Essa decisão nunca foi implementada
no caminho de escrita: a skill `create-traffic-cliente-exemplo-campaign` cria campanha/ad
set/criativo/ad **exclusivamente via MCP** (`mcp__claude_ai_META_ADS__ads_*`), amarrado a uma única
identidade Meta conectada no runner via `claude login`. O token cifrado por tenant
(`ad_account_connections.access_token_cipher`) só era decifrado e usado em
`scripts/onda12/validate-connections.ts`, para health-check — nunca para criar/gerenciar campanha.

O usuário pediu explicitamente: cada cliente cadastra seu próprio token de API Meta, podendo
cadastrar **mais de um** (para gerenciar campanhas de contas de anúncio diferentes do mesmo
cliente).

## Decisão

1. **O MCP deixa de ser o caminho de escrita para tenants.** Skills que criam/gerenciam campanha
   passam a chamar a Meta Graph/Marketing API via REST direto, com o token decifrado da conexão do
   tenant (`ad_account_connections`), reaproveitando o padrão de decrypt já existente em
   `scripts/onda12/infrastructure/secrets-rest.ts::decryptConnectionToken`.
2. **Um cliente pode ter múltiplas conexões** (múltiplos tokens/contas de anúncio). O schema já
   suporta isso sem migration — a constraint única em `ad_account_connections` é por
   `meta_ad_account_id` (anti-hijack global), não por `account_id`; não há limite de linhas por
   `account_id`.
3. **Escolha da conta de anúncio é sempre explícita por job.** Quando o job é enfileirado (dashboard
   ou skill headless), ele carrega qual `meta_ad_account_id` usar. Se não vier, a skill **aborta**
   — nunca escolhe implicitamente (nem "primeira conexão", nem "conexão mais recente"). Evita criar
   campanha na conta de anúncio errada quando o cliente tem mais de uma.
4. **CLAUDE.md é atualizado**: a regra "Meta só via MCP mcp-meta-ads, sem token Meta em env" é
   substituída por "Meta via token de API por tenant, cifrado em repouso, decifrado só server-side
   no instante da chamada; nunca em env, nunca em log". O MCP compartilhado (`super_admin`/agência)
   deixa de ser usado para escrita; permanece disponível só para o caminho de leitura ao vivo do
   Nexus (ADR 0032), que não muda nesta decisão.

## Consequências

**Positivas:** cumpre o pedido do produto (cada cliente com seu próprio acesso Meta, múltiplas
contas por cliente); termina uma decisão já aprovada e parcialmente implementada (ADR 0028); reusa
100% da infra de cifra/decifra e da tabela existente, sem migration; remove a dependência de uma
única identidade MCP compartilhada para operações de clientes pagantes.

**Negativas / dívidas aceitas:** a skill de criação de campanha precisa ser reescrita (troca de
`allowed-tools` MCP por chamadas REST); cada chamada à Graph API precisa de tratamento de erro
próprio (rate limit, token revogado, permissão insuficiente) que o MCP abstraía; testes precisam de
mocks de `fetch` para a Graph API em vez de mocks de tool MCP.

**Riscos & mitigação:** token revogado no meio de uma execução → abort e `status='invalid'` na
conexão (já previsto no ADR 0028/cron de validação); campanha criada na conta de anúncio errada por
ambiguidade → mitigado pela decisão #3 (sempre explícito, aborta na dúvida, alinhado à regra geral
do projeto "aborta por padrão na dúvida").

## Alternativas consideradas

- **Manter MCP para escrita e só usar REST para leitura de saúde** — rejeitada: não atende o pedido
  de token por cliente com múltiplas contas; mantém uma única identidade Meta para todos os tenants.
- **Conexão "padrão" (`is_default`) por cliente, fallback implícito quando não especificado** —
  rejeitada: cria escolha implícita que pode direcionar uma campanha para a conta de anúncio errada
  silenciosamente. Contraria a regra geral do projeto de abortar na dúvida.
- **Associar conta de anúncio ao produto (coluna fixa)** — rejeitada por ora: adiciona uma
  amarração de dado (produto → conta de anúncio) que o usuário não pediu; a escolha explícita por
  job já resolve o caso sem precisar de nova coluna/migration.
