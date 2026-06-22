# Threat model STRIDE — Pipeline CI/CD (Onda 11)

- **Onda:** 11
- **Superfície:** GitHub Actions `.github/workflows/{ci,deploy}.yml`; `.gitleaks.toml`; segredos de
  deploy (`FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`); `vercel.json`.
- **Confiança:** runners efêmeros do GitHub. Entradas não confiáveis: o conteúdo do PR (código,
  título, branch) e as dependências de `npm ci`. Segredos só existem no contexto da `main`.

## Ativos

- Segredos de deploy (tokens Fly/Vercel) — comprometê-los dá deploy/posse da infra.
- Integridade do artefato publicado (dashboard/runner) — alvo de supply-chain.
- O próprio gate (não pode ser contornado por um PR).

## STRIDE

### Spoofing
- **Ameaça:** PR de fork forjando deploy/uso de segredos.
- **Mitigação:** deploy só em `push` na `main` / `workflow_dispatch` (nunca em `pull_request`);
  segredos não são expostos a workflows de PR de fork (política padrão do GitHub).

### Tampering
- **Ameaça:** PR alterando o workflow para exfiltrar segredo (ex.: `echo $TOKEN`), ou dependência
  maliciosa em `npm ci`.
- **Mitigação:** `permissions: contents: read` (token do job sem escrita); segredos passados por
  `env` de step e nunca interpolados em shell; `npm ci` (lockfile pinado, instala exato); revisão de
  PR obrigatória antes do merge na `main` (onde os segredos vivem). Actions pinadas por major.

### Repudiation
- **Ameaça:** deploy sem rastro de quem/o quê.
- **Mitigação:** todo run fica no histórico do Actions (commit, autor, logs); `concurrency` evita
  corridas; deploy carimba o SHA da `main`.

### Information Disclosure
- **Ameaça:** segredo vazando em log do CI ou commitado no repo.
- **Mitigação:** `gitleaks` no CI (allowlist só de placeholders) barra segredo no diff; o GitHub
  mascara valores de `secrets.*` nos logs; `.env.example` é contrato sem valores; segredo só em
  `fly secrets`/Vercel env/`wrangler secret`.

### Denial of Service / custo
- **Ameaça:** PRs disparando builds em excesso; deploys concorrentes corrompendo estado.
- **Mitigação:** `concurrency` com `cancel-in-progress` no CI; `cancel-in-progress: false` no deploy
  (serializa, não cancela um deploy em curso).

### Elevation of Privilege
- **Ameaça:** job ganhando permissão de escrita no repo ou nos ambientes.
- **Mitigação:** least privilege (`contents: read`); sem `GITHUB_TOKEN` de escrita; tokens de deploy
  escopados ao alvo (Fly app / projeto Vercel), não à conta inteira.

## Resíduo aceito

- `npm audit` não é gate bloqueante (devDeps transitivas; `--force` traria breaking changes) — dívida
  monitorada para revisão periódica.
- Actions de terceiros (`gitleaks-action`, `setup-flyctl`) são confiadas por major tag, não por SHA
  pinado — endurecer com pin por SHA fica como melhoria futura.
