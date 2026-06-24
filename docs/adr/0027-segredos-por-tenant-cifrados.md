# ADR 0027 — Segredos por tenant cifrados em repouso (tokens Meta + API keys)

- **Status:** Accepted
- **Data:** 2026-06-24
- **Onda:** 12 (SaaS multi-tenant)
- **Spec:** `docs/specs/SPEC-saas-multitenant.md`

## Contexto

Cada tenant traz segredos próprios: o **token Meta** (System User access token) em
`ad_account_connections` e as **chaves de provedor** (Anthropic/OpenAI/…) em `api_keys_clientes`. Esses
segredos dão acesso a gasto de mídia e a contas de LLM pagas — não podem ficar em texto puro no banco,
nem voltar para o frontend depois de salvos, nem aparecer em logs/dumps. O runner (Node) e o dashboard
(server-side) precisam decifrá-los no instante de uso.

## Decisão

Os segredos ficam **cifrados em repouso com AES-256-GCM app-level** (Node), nunca em texto puro. O DB
guarda só `iv||authTag||ciphertext` em colunas `bytea` (`access_token_cipher`, `key_cipher`). Usamos
**chaves de criptografia separadas por tipo de segredo**: `AD_TOKEN_ENC_KEY` (tokens Meta) e
`API_KEY_ENC_KEY` (keys de provedor), cada uma com 32 bytes, **em env (`fly secrets`/Vercel), nunca no
banco**. `key_version` (smallint) acompanha cada linha para permitir rotação. A leitura exposta ao
frontend **exclui** as colunas `*_cipher` e mostra só `*_last4` ("••••abcd") + datas
(`connected_at`/`last_validated_at`). Decifrar só acontece server-side no momento de chamar a Meta/o
provedor.

**Resolução de chave de provedor por job** (`resolveProviderKey(account_id, provider)`): se o tenant
tem chave própria (status ≠ `invalid`) → usa a dele, **nunca a global do `.env`**; se não tem →
`super_admin` cai na global, **qualquer outro role aborta o job** ("configure sua chave"). Para o
Anthropic/OpenAI, o `run-skill.sh` lança o subprocesso `claude -p` com as chaves do tenant no env
(resolvidas no claim, nunca logadas) → custo atribuído a quem usou a chave.

**Saúde do segredo:** `status` (`unverified→active→invalid/revoked`) + `last_validated_at` +
`last_validation_error`; validação na escrita e por cron 1×/dia (`validate-connections-tick`,
read-only), mais revalidação imediata quando um job falha por auth (pega revogação do lado do cliente,
já que System User token não expira sozinho).

## Consequências

- **Positivas:** a chave de cripto nunca transita para o Postgres → dump/backup/admin do banco nunca
  veem texto puro; blast radius menor (chaves separadas) + rotação independente via `key_version`;
  custo de LLM/mídia isolado por tenant; segredo nunca volta ao front.
- **Negativas / trade-offs:** o app precisa gerenciar/rotacionar 2 chaves de cripto; perder uma chave
  torna os ciphertexts daquele tipo irrecuperáveis (segredos precisam ser recadastrados); decifrar a
  cada uso adiciona custo pequeno de CPU.
- **Riscos & mitigação:** vazamento de `AD_TOKEN_ENC_KEY`/`API_KEY_ENC_KEY` → segredo fora do código,
  só em `fly secrets`/Vercel env, `NEXT_PUBLIC_*` nunca carrega; log do token → resolução nunca loga o
  valor decifrado; chave do tenant inválida → `status=invalid` + abort cedo no runner.

## Alternativas consideradas

- **pgcrypto (`pgp_sym_encrypt`)** — rejeitada: exige a chave transitar até o Postgres (aparece em
  parâmetros de query/logs); o objetivo é justamente manter a chave **fora** do banco.
- **Chave única `SECRETS_ENC_KEY` para tudo** — rejeitada: blast radius maior; chaves separadas por tipo
  custam pouco a mais de operação.
- **Fallback à chave global do `.env` para todo tenant sem chave própria** — rejeitada fora do
  `super_admin`: misturaria custo de LLM entre tenants; planos pagos exigem chave própria.
