# Runbook — deixar o app da Meta pronto para os CLIENTES usarem

Estado em 2026-07-30: o OAuth "Conectar com Facebook" **funciona** (3 conexões `oauth_meta` gravadas
com token cifrado), mas só para contas que têm papel no app. Este runbook é o que falta para um
cliente final conseguir conectar.

Identificadores públicos (não são segredos): app `AppCentraliza`, `META_APP_ID` `1996343860925429`,
`META_LOGIN_CONFIG_ID` `1499004845576722`.

## Por que hoje só funciona para você

O app está em **modo de desenvolvimento** (`app_type: 0`, lido via Graph API). Nesse modo a Meta só
autoriza quem tem papel no app — administrador, desenvolvedor ou testador. Qualquer outra conta do
Facebook é recusada **na página da Meta**, antes de chegar ao nosso servidor (por isso o log do
dashboard não registra callback nenhum nessas tentativas).

Foi exatamente isso que aconteceu no teste: a conta pessoal secundária foi barrada, a conta
administradora do app passou de primeira. Não era domínio, não era código.

## Os três bloqueios, na ordem

### 1. Verificação de Negócio (Business Verification)

Onde: business.facebook.com → Configurações do Negócio → Central de Segurança.

Pede documento da empresa (CNPJ), comprovante de endereço e confirmação de telefone/e-mail do
domínio. É a etapa mais lenta (dias). Sem ela a Análise do App nem aceita permissões de anúncios.

### 2. Análise do App (App Review) — Acesso Avançado

Onde: developers.facebook.com/apps/1996343860925429 → Análise do app → Permissões e recursos.

Pedir **Acesso Avançado** para as três permissões que o dashboard usa:

- `ads_management`
- `ads_read`
- `business_management`

Cada uma exige justificativa escrita e **screencast** mostrando o fluxo real: login no dashboard,
clique em "Conectar com Facebook", tela de consentimento, escolha das contas de anúncio, e a conexão
aparecendo conectada. Gravar isso com o app já em domínio fixo (ver item 3) — vídeo gravado em URL de
túnel que morreu é motivo comum de recusa.

Ponto de atenção: o revisor precisa conseguir reproduzir. Preparar uma conta de teste no dashboard e
informar as credenciais no formulário.

### 3. Modo Live + domínio fixo

Só depois das duas aprovações, virar a chave Desenvolvimento → **Ativo (Live)** no topo do painel.

Antes disso o app precisa estar num domínio estável. O túnel `trycloudflare` sorteia um hostname novo
a cada reinício, e quando ele muda o `redirect_uri` registrado deixa de valer — o fluxo quebra sem
nada ter mudado no código.

## Checklist de troca de domínio (usar quando sair do Vercel para o domínio real)

Três campos precisam mudar **juntos**. Esquecer um quebra o login com uma mensagem que parece bug de
código:

| Onde | Campo | Valor |
| --- | --- | --- |
| Configurações → Básico | URL do site | `https://<dominio>/` |
| Configurações → Básico | Domínios do app | `<dominio>` (só o host, sem `https://`, sem barra) |
| Login para Empresas → Configurações | URIs de redirecionamento do OAuth válidos | `https://<dominio>/api/oauth/meta/callback` (URL completa) |

Ordem obrigatória: **URL do site primeiro, salvar, depois Domínios do app, salvar.** O campo Domínios
do app só aceita domínio que já apareça em alguma URL de plataforma do app — se tentar o inverso, a
Meta recusa com a mensagem sobre "URL do site / URL do site móvel".

No dashboard, setar `META_OAUTH_REDIRECT_URI` no ambiente de produção com a URL completa do callback.
Ela vence qualquer derivação automática de host, o que elimina o risco de proxy montar o endereço
errado.

Pendência conhecida: hoje `website_url` e `app_domains` estão apontando para o slug do túnel
(`concord-pleased-imagine-fig.trycloudflare.com`), que é efêmero. Isso precisa ser substituído pelo
domínio real na troca.

## O que fazer enquanto a aprovação não sai

O **token manual de System User** continua sendo o caminho para cliente real — é o que o ADR 0028
define e já está implementado em `/settings`. Não depende de App Review e o token não expira sozinho.

Para um piloto com 2–3 clientes, dá para adicionar cada um como **testador** do app em Funções →
Funções. Funciona hoje, mas exige que a pessoa aceite o convite e não escala.

## Verificação rápida do estado do app

O script lê pela API o que a Meta realmente tem salvo (sem imprimir segredo): credencial válida,
`app_domains`, `website_url`.

```bash
cd web && node "$HOME/AppData/Local/hermes/skills/software-development/trafegante-meta-ads-dev/scripts/check-meta-app-config.mjs" .env.local <dominio-esperado>
```

Limite conhecido: "URIs de redirecionamento válidos" **não** é legível por app token (nenhuma edge do
Graph expõe) — esse campo só dá para conferir na tela.
