# 0036 — Gestão de conexões Meta e sincronização de campanhas via dashboard

- **Status:** Accepted
- **Data:** 2026-07-04
- **Onda:** pós-super-admin (gestão de conexões + import de campanhas)
- **Contexto relacionado:** ADR 0027 (segredos por tenant cifrados), ADR 0028 (acesso Meta por
  token manual), ADR 0032 (leitura Meta ao vivo via job), ADR 0035 (token por tenant substitui MCP
  na escrita).

## Contexto

Ao conectar um token Meta pela tela `/settings`, o operador esperava ver as campanhas da conta de
anúncio aparecerem na Visão geral — mas nada acontecia. A tabela `campaigns` (fonte da Visão geral)
só é preenchida quando o próprio sistema **cria** uma campanha (skills `create-traffic`/
`create-sales`). Não existia nenhum caminho para **importar** as campanhas que já existem na conta
Meta do cliente. Além disso, as conexões cadastradas não podiam ser **editadas** (trocar token
revogado / conta de anúncio errada) nem **apagadas** pela UI.

Três lacunas, então: (1) apagar conexão, (2) editar conexão, (3) trazer as campanhas existentes da
Meta para o painel.

A questão estrutural é a #3: **onde** ler a Meta. O projeto tem duas convenções de acesso à Meta —
o runner headless (ADR 0035, escrita via REST com token do tenant) e a leitura ao vivo enfileirada
como job (ADR 0032). Nenhuma roda síncrona no dashboard.

## Decisão

1. **Import de campanhas roda síncrono no dashboard, não via runner.** O botão "Sincronizar
   campanhas" chama a Graph API na hora (`GET /act_<id>/campaigns`), faz upsert em `campaigns` e a
   página recarrega mostrando o resultado. Motivo: é leitura **read-only** e rápida; o valor de
   produto é justamente a resposta imediata ("na hora"), que o modelo desacoplado por job não
   entrega. Não liga gasto nem muta a Meta, então não precisa da confirmação em dois turnos nem da
   fila.

2. **O token é decifrado só em memória, no instante da chamada.** O dashboard passa a ter a metade
   de **leitura** da cripto (`decryptSecret` + `fromPgByteaHex`), espelhando exatamente o formato do
   runner (`scripts/onda12/domain/crypto.ts`). O dashboard já cifra com `AD_TOKEN_ENC_KEY` (ADR
   0027); agora também decifra com ela. A chave nunca sai do env; o token nunca é logado nem volta
   na resposta.

3. **O cliente que recebe as campanhas é resolvido, nunca escolhido implicitamente pela conta de
   anúncio errada.** Regra: se a conexão tem `client_id`, usa esse; senão, se a account tem
   exatamente 1 cliente, usa ele; com 0 ou 2+, **aborta** e pede ao operador que informe o cliente
   (respeita "aborta por padrão na dúvida" do CLAUDE.md e a mesma regra do ADR 0035).

4. **Editar conexão re-cifra o token novo (quando enviado) e volta o status para `unverified`.** O
   token em texto puro só transita para ser re-cifrado; o campo vem em branco na UI (não exibimos o
   segredo). Trocar a conta de anúncio ou o rótulo não exige reenviar o token.

5. **Apagar conexão é um DELETE físico**, escopado por account (um `cliente_usuario` só apaga as
   suas; `super_admin` apaga qualquer uma). Campanhas já importadas não são apagadas junto (o vínculo
   é por `client_id`, não pela conexão).

## Consequências

**Positivas:** cumpre o pedido do operador (ver campanhas na hora, gerenciar conexões); reusa 100% da
infra de cripto e do schema `campaigns` sem migration; mantém a Meta read-only nesse caminho (sem
risco de gasto). O status da conexão passa a `active` como efeito colateral de um sync bem-sucedido
(o probe já confirma que o token funciona).

**Negativas / dívidas aceitas:** o import roda no runtime da função Vercel (timeout de função) — para
contas com centenas de campanhas isso pode ficar lento; por ora paginamos e limitamos. O sync é
manual (botão), não contínuo — não há polling automático da Meta.

**Riscos & mitigação:** token revogado → o sync falha com erro claro e a conexão é marcada
`invalid` (mesma classificação do cron de validação); conta de anúncio ambígua para cliente →
mitigado pela decisão #3 (aborta e pede escolha); campos da Meta são **dado de fronteira** (anti
prompt-injection) → validados por schema Zod antes do upsert.

## Alternativas consideradas

- **Import via job no runner (como o live-snapshot, ADR 0032)** — rejeitada para este caso: adiciona
  latência (claim + subprocesso) e o histórico de travas de gasto/execução não-determinística do
  runner contraria o objetivo de resposta imediata. O live-snapshot continua sendo job porque narra
  via Nexus; o import só popula uma tabela.
- **Editar conexão trocando só o rótulo (sem token)** — rejeitada: não cobre o caso real de token
  revogado, que é o motivo mais comum para editar.
