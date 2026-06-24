---
name: validate-connections-tick
description: Valida periodicamente os tokens Meta manuais das conexões vivas (System User token não expira, mas pode ser revogado pelo cliente). Faz um probe barato à Graph API com o token decifrado, patcha status/last_validated_at em ad_account_connections e avisa o gestor por Telegram (log-only sem credencial) quando um token é revogado. Read-mostly, headless e idempotente.
allowed-tools: Bash(npx tsx:*)
---

# validate-connections-tick

Skill **headless** da Onda 12 (multi-tenant). Confere se os **tokens Meta manuais** ainda funcionam.
System User token **não expira sozinho**, mas pode ser **revogado** do lado do cliente — esta skill
detecta isso e avisa o gestor. Ver `docs/specs/SPEC-saas-multitenant.md` §5.4 e ADR 0027/0028.

## Regras invioláveis

- **Nunca loga o token.** O token é decifrado só em memória (server-side), no instante do probe.
- **Falha fechada na cripto:** se não decifrar (chave errada/cipher corrompido), registra
  `last_validation_error` e segue — **não** condena o token às cegas.
- **Erro transitório não condena:** rate limit / 5xx / falha de rede mantêm o status atual; só
  **erro de auth** (401/403 ou códigos 190/102/200/…) vira `revoked` + aviso.
- **Idempotente:** re-rodar só re-patcha status/last_validated_at; não cria linhas.
- **Telegram opcional:** sem `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, degrada para log-only (nunca
  derruba a skill por causa da notificação).

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `AD_TOKEN_ENC_KEY` (32 bytes, hex/base64).
  Opcional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Fluxo

Tudo já está implementado e testado no orquestrador. Execute-o **uma vez**:

```bash
npx tsx scripts/onda12/validate-connections.ts
```

O orquestrador (`scripts/onda12/validate-connections.ts`):

1. Lê `ad_account_connections` com `connection_method=manual_token` e `status ∈ (active, unverified)`.
2. Para cada conexão: decifra o token (`AD_TOKEN_ENC_KEY`), faz `GET act_<id>?fields=name`
   (token no header Bearer, nunca na URL), classifica a saúde (`classifyMetaProbe`) e aplica o patch
   (`planConnectionPatch`): `ok→active`, `auth_error→revoked`+aviso, `transient→` só registra o erro.
3. Avisa o gestor (Telegram ou log-only) quando uma conexão vira `revoked`.

## Critérios de aceite

- Conexão com token válido → `status=active`, `last_validated_at` atualizado.
- Conexão com token revogado → `status=revoked`, `last_validation_error` preenchido, aviso emitido.
- Erro transitório não muda o status. Re-rodar é idempotente. O token nunca aparece em log.
