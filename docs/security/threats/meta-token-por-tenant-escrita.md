# Threat model STRIDE — Token Meta por tenant como vetor de escrita (ADR 0035)

- **Onda:** feature/super-admin-completo
- **Superfície:** `scripts/onda2/infrastructure/meta-graph-client.ts` (REST à Graph API com token do
  tenant), skill `create-traffic-cliente-exemplo-campaign` (consumidor), `ad_account_connections`
  (múltiplas conexões por tenant), páginas `/accounts/[id]`, `/accounts/[id]/onboarding`,
  `/admin/business`, `/admin/my-keys`.
- **Confiança:** o token decifrado só existe em memória do runner, no instante da chamada REST.
  Escolha de `meta_ad_account_id` é sempre explícita por job (nunca fallback implícito). Mutação de
  credencial exige `super_admin`; leitura de detalhe/negócio aceita `super_admin`/`socio`.
- **Specs/ADRs:** `SPEC-super-admin-completo.md`, ADR 0035, ADR 0028 (base), ADR 0027 (cifra).

## Ativos

- Token Meta (System User) de cada tenant — confidencial; se vazado, permite gasto/ação na conta de
  anúncio do cliente.
- Chaves de provedor por conta (`api_keys_clientes`) — mesma classe de segredo.
- Integridade de qual conta de anúncio recebe a campanha (evitar campanha na conta errada).

## STRIDE

### Spoofing
- **Ameaça:** um job forjado ou um `account_id` incorreto usar o token de outro tenant.
- **Mitigação:** a skill busca a conexão por `(account_id, meta_ad_account_id)` vindos do job
  validado (`assertSafeArgs`, charset restrito); `ad_account_connections` é sempre filtrada por
  `account_id` do job, nunca por texto livre do usuário final.

### Tampering
- **Ameaça:** manipular `AGENT_ARGS.metaAdAccountId` para apontar a uma conta de anúncio de outro
  tenant.
- **Mitigação:** a query de resolução do token exige `account_id = job.accountId` **e**
  `meta_ad_account_id = args.metaAdAccountId` — mesmo que o valor do arg seja adulterado, só resolve
  se existir uma conexão viva para aquela combinação exata; sem casar as duas, aborta.

### Repudiation
- **Ameaça:** criar campanha via token do tenant sem rastro de qual conexão foi usada.
- **Mitigação:** `operation_logs` por mutação (`action='create'`, `actor='skill'`); o manifest da
  skill grava o `meta_ad_account_id` usado.

### Information Disclosure
- **Ameaça:** vazar o token em log, erro da Graph API, ou na resposta ao dashboard.
- **Mitigação:** `MetaGraphError` nunca inclui o token na mensagem (só o corpo de erro da própria
  Meta, que não o contém); `ad_account_connections`/`api_keys_clientes` projetam só colunas de
  DISPLAY (`last4`) em toda leitura server-side voltada ao dashboard; o token decifrado nunca é
  passado por env nem por argumento de linha de comando (só em memória, dentro do processo Node do
  runner).

### Denial of Service
- **Ameaça:** token revogado/rate-limited causando falhas repetidas de job.
- **Mitigação:** cron `validate-connections-tick` (existente, ADR 0027) marca `status=invalid` cedo;
  a skill aborta antes de gastar tempo/créditos em uma conexão já sabida inválida.

### Elevation of Privilege
- **Ameaça:** um `cliente_usuario` cadastrar/ver conexão de outra conta; ou o onboarding wizard
  mutar credencial sem ser `super_admin`.
- **Mitigação:** `/accounts/[id]`, `/accounts/[id]/onboarding` exigem `requireRole(['super_admin'])`
  para qualquer mutação (`canManageAccount` no serviço); `/admin/my-keys` usa `getCurrentScope()` —
  sempre a própria conta da sessão, nunca um `accountId` arbitrário do payload.

## Resíduo aceito

- **Sem probe síncrono para Meta/Minimax no onboarding** — validação real só acontece no ciclo do
  cron de validação (minutos/horas de atraso), não no momento do cadastro. Aceito: reduz superfície
  de chamada de rede síncrona nova a partir do dashboard (ADR 0035 §2).
- **Múltiplas conexões por cliente sem UI de "qual está em uso agora"** — o operador vê a lista, mas
  a escolha de qual `meta_ad_account_id` usar em cada campanha depende de quem enfileira o job
  (Nexus/skill) passar o valor certo. Mitigado por abort-on-doubt (nunca fallback implícito), mas o
  erro humano de escolher o ad account errado no momento de pedir a campanha não é bloqueado pelo
  sistema — é uma decisão consciente de manter o controle explícito em vez de inferir.
