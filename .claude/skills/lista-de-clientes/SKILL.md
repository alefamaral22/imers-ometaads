---
name: lista-de-clientes
description: Lista os clientes cadastrados (tabela clients) lendo via REST com SUPABASE_SECRET_KEY. Somente leitura — sem writes, sem MCP do Supabase. Use para resolver um cliente por slug antes de criar campanhas.
allowed-tools: Read, Bash(node:*), Bash(npx tsx:*)
---

# lista-de-clientes

Skill **headless** e **somente leitura**. Resolve clientes da tabela `public.clients` via PostgREST,
usando `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (service role). **Não** usa o MCP do Supabase (SPEC §10).

## Pré-condições

- Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Se faltar, **aborte** com mensagem clara (segredos nunca
  têm default no código).

## Como executar

Use o helper testado `selectRows` (`scripts/onda2/infrastructure/supabase-rest.ts`) via `tsx`:

```bash
npx tsx -e "
import { readSupabaseConfigFromEnv, selectRows } from './scripts/onda2/infrastructure/supabase-rest.ts';
const cfg = readSupabaseConfigFromEnv();
const q = process.env.SLUG ? \`slug=eq.\${process.env.SLUG}&select=*\` : 'select=*&order=slug';
console.log(JSON.stringify(await selectRows(cfg, 'clients', q), null, 2));
"
```

- Para um cliente específico: defina `SLUG=cliente-exemplo` antes do comando.
- Valide cada linha com `parseClientRecord` (`scripts/onda2/domain/client.ts`) antes de usar — a saída
  do banco é dado de fronteira.

## Saída

JSON das linhas de `clients` (campos relevantes: `id`, `slug`, `name`, `ad_account_id`,
`facebook_page_id`, `default_landing_url`, `daily_budget_cap_cents`, `currency`). Sem PII além do que já
está no cadastro do cliente. Nunca imprima `SUPABASE_SECRET_KEY`.
