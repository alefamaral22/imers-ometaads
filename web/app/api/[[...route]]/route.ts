import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serverEnv, isTurnstileEnabled, publicEnv } from '../../../lib/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isAuthenticated,
  hasRole,
  buildClaims,
  loginInputSchema,
  passwordMatches,
  type SessionClaims,
} from '../../../lib/auth/domain';
import { signSession, verifySession, sha256Hex } from '../../../lib/auth/session';
import { verifyPassword } from '../../../lib/auth/password';
import { verifyTurnstile } from '../../../lib/auth/turnstile';
import { limitLogin, limitNexus } from '../../../lib/ratelimit';
import { listClients, getClientBySlug, createClient } from '../../../lib/services/clients';
import { listProducts, createProduct } from '../../../lib/services/products';
import { listAllCampaigns } from '../../../lib/services/campaigns';
import { listAnalyses, getLatestAnalysis, listFunnelEvents } from '../../../lib/services/analyses';
import { listLandingPages } from '../../../lib/services/landing-pages';
import { listOperationLogs, writeOperationLog } from '../../../lib/services/logs';
import { listNarrations } from '../../../lib/services/narrations';
import { getLatestSnapshot, getSnapshotByJobId } from '../../../lib/services/live-snapshots';
import { getAgentPulse } from '../../../lib/services/agent-jobs';
import {
  chatRequestSchema,
  confirmRequestSchema,
  captureRequestSchema,
  ttsRequestSchema,
} from '../../../lib/nexus/domain/requests';
import { runChatTurn, confirmAndEnqueue } from '../../../lib/nexus/infra/chat-runner';
import { transcribe, synthesize } from '../../../lib/nexus/infra/voice';
import { describeScreen } from '../../../lib/nexus/infra/vision';
import { NexusUnavailableError } from '../../../lib/nexus/infra/anthropic';
import {
  createLandingSchema,
  editSectionSchema,
  startWatchSchema,
} from '../../../lib/landing/edit';
import { editSection } from '../../../lib/services/landing-sections';
import { enqueueCreateLandingJob } from '../../../lib/services/landing-jobs';
import { storeLandingInputs } from '../../../lib/services/landing-inputs';
import {
  landingInputsCopySchema,
  landingInputsContextSchema,
  whatsappHref,
  MAX_IMAGES,
  type LandingInputsContext,
} from '../../../lib/landing/inputs';
import { startWatch } from '../../../lib/services/watches';
import { isSecretsVaultEnabled } from '../../../lib/env';
import {
  listAccounts,
  getLoginAccountByEmail,
  getSuperAdminAnchor,
  touchLastLogin,
  createAccount,
  getAccountById,
  setAccountActive,
  assignPlan,
  resetAccountPassword,
  archiveAccount,
} from '../../../lib/services/accounts';
import { notifyPasswordReset } from '../../../lib/services/notify';
import { IMPERSONATION_COOKIE_NAME, IMPERSONATION_TTL_SECONDS } from '../../../lib/auth/domain';
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
} from '../../../lib/services/connections';
import { syncCampaigns } from '../../../lib/services/campaign-sync';
import { listApiKeys, upsertApiKey } from '../../../lib/services/api-keys';
import { listPlans, createPlan, updatePlan } from '../../../lib/services/plans';
import {
  createConnectionSchema,
  updateConnectionSchema,
  upsertApiKeySchema,
  createAccountSchema,
  setAccountActiveSchema,
  resetAccountPasswordSchema,
  archiveAccountSchema,
  createClientSchema,
  createProductSchema,
  createPlanSchema,
  updatePlanSchema,
  assignPlanSchema,
} from '../../../lib/multitenant/requests';
import { scopeFromClaims } from '../../../lib/multitenant/scope';
import { canToggleAccount } from '../../../lib/multitenant/accounts-admin';

export const runtime = 'nodejs';

const app = new Hono().basePath('/api');

/** Verify the session cookie and return the claims (or null). */
async function apiClaims(
  c: Parameters<Parameters<typeof app.use>[1]>[0],
): Promise<SessionClaims | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  return verifySession(token, serverEnv().AUTH_SECRET);
}

/** Authz middleware for protected API routes: verify cookie -> require an authenticated session. */
async function requireOperatorApi(c: Parameters<Parameters<typeof app.use>[1]>[0]) {
  return isAuthenticated(await apiClaims(c));
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  const fwd = c.req.header('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
}

// ── Auth (public) ────────────────────────────────────────────────────────────
app.post('/auth/login', async (c) => {
  const env = serverEnv();

  // 1) rate limit (public endpoint) — before any expensive work.
  const ip = clientIp(c);
  const rl = await limitLogin(env, ip);
  if (!rl.success) {
    return c.json({ error: 'too_many_requests' }, 429);
  }

  // 2) validation: external input is data, not instruction.
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  // 3) optional Turnstile (bot protection).
  if (isTurnstileEnabled(env, publicEnv())) {
    const ok = await verifyTurnstile(
      env.CLOUDFLARE_TURNSTILE_SECRET_KEY as string,
      parsed.data.turnstileToken,
      ip,
    );
    if (!ok) return c.json({ error: 'turnstile_failed' }, 403);
  }

  // 4) logic: resolve the account by email and verify the scrypt password. Falls back to the legacy
  // super_admin bootstrap (DASHBOARD_PASSWORD, SHA-256) while the anchor has no real password set —
  // so the agency operator is never locked out during the migration (ADR 0029).
  const { email, password } = parsed.data;
  let claims: SessionClaims | null = null;

  const account = await getLoginAccountByEmail(email);
  if (account?.passwordHash && verifyPassword(password, account.passwordHash)) {
    claims = buildClaims(account);
  } else {
    const submittedDigest = await sha256Hex(password);
    if (passwordMatches(submittedDigest, env.DASHBOARD_PASSWORD)) {
      const anchor = await getSuperAdminAnchor();
      if (anchor) claims = buildClaims(anchor);
    }
  }

  if (!claims) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  const token = await signSession(claims, env.AUTH_SECRET);
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  await touchLastLogin(claims.sub).catch(() => {});
  return c.json({ ok: true });
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

// ── Protected reads ──────────────────────────────────────────────────────────
app.use('/data/*', async (c, next) => {
  if (!(await requireOperatorApi(c))) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

// Onda 15 — toda leitura operacional é escopada por account (super_admin/socio veem tudo;
// cliente_usuario só o seu). O middleware /data/* já garantiu a sessão; aqui derivamos o escopo.
app.get('/data/clients', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ clients: await listClients(scopeFromClaims(claims)) });
});

app.get('/data/clients/:slug', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const client = await getClientBySlug(scopeFromClaims(claims), c.req.param('slug'));
  if (!client) return c.json({ error: 'not_found' }, 404);
  return c.json({ client });
});

app.get('/data/campaigns', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ campaigns: await listAllCampaigns(scopeFromClaims(claims)) });
});

app.get('/data/analyses', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ analyses: await listAnalyses(scopeFromClaims(claims)) });
});

app.get('/data/funnel', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const latest = await getLatestAnalysis(scopeFromClaims(claims));
  if (!latest) return c.json({ analysis: null, events: [] });
  return c.json({ analysis: latest, events: await listFunnelEvents(latest.id) });
});

app.get('/data/landing-pages', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ landingPages: await listLandingPages(scopeFromClaims(claims)) });
});

app.get('/data/logs', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ logs: await listOperationLogs(scopeFromClaims(claims)) });
});

// Pulso dos agentes (Operação ao vivo) — contagem de jobs em voo, escopada por account. Polling leve.
app.get('/data/ops-pulse', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  return c.json(await getAgentPulse(scopeFromClaims(claims)));
});

// ── Onda 12 — multi-tenant: accounts, conexões Meta e chaves de API ────────────
// Leituras projetam só colunas de DISPLAY (o cipher do token/chave NUNCA é selecionado). Escritas
// cifram server-side. Escopo por account (super_admin vê tudo). O segredo nunca volta na resposta.
// Listar accounts: só visibilidade global (super_admin/socio); cliente_usuario não enxerga tenants.
app.get('/data/accounts', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  return c.json({ accounts: await listAccounts() });
});

// Criar account (provisionamento) — só super_admin. UI nunca cria super_admin (schema barra o role).
app.post('/data/accounts', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const account = await createAccount(claims.slug, parsed.data);
    return c.json({ account }, 201);
  } catch (err) {
    // slug/email duplicado (unique/citext) → 409 genérico (não diz qual dos dois colidiu).
    if (err instanceof Error && /\b409\b|23505/.test(err.message)) {
      return c.json({ error: 'conflict' }, 409);
    }
    throw err;
  }
});

// Ativar/desativar account (soft) — só super_admin; nunca a si mesmo nem outro super_admin.
app.patch('/data/accounts/:id', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = setAccountActiveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const target = await getAccountById(id);
  if (!target) return c.json({ error: 'not_found' }, 404);
  const decision = canToggleAccount(claims.sub, target);
  if (!decision.ok) return c.json({ error: 'forbidden', reason: decision.reason }, 403);
  const account = await setAccountActive(claims.slug, id, parsed.data.isActive);
  return c.json({ account });
});

// Redefinir senha de qualquer account — só super_admin. Notifica por e-mail (fail-safe: nunca
// bloqueia a resposta se o envio falhar).
app.patch('/data/accounts/:id/password', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = resetAccountPasswordSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const target = await getAccountById(id);
  if (!target) return c.json({ error: 'not_found' }, 404);
  const account = await resetAccountPassword(claims.slug, id, parsed.data.password);
  if (account.email) await notifyPasswordReset(account.email, account.name).catch(() => {});
  return c.json({ account });
});

// Impersonar (SOMENTE LEITURA) — só super_admin. Cookie separado, TTL curto (30min); nunca é usado
// para autorizar mutação (todo endpoint de escrita continua checando hasRole sobre a sessão real).
app.post('/data/accounts/:id/impersonate', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const target = await getAccountById(id);
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.role === 'super_admin') return c.json({ error: 'forbidden' }, 403);
  setCookie(
    c,
    IMPERSONATION_COOKIE_NAME,
    JSON.stringify({
      actorAccountId: claims.sub,
      targetAccountId: target.id,
      targetSlug: target.slug,
    }),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: IMPERSONATION_TTL_SECONDS,
    },
  );
  await writeOperationLog({
    entityType: 'account',
    entityId: target.id,
    action: 'update',
    actor: claims.slug,
    summary: `super_admin iniciou visualização como ${target.slug} (somente leitura)`,
  }).catch(() => {});
  return c.json({ ok: true, targetSlug: target.slug });
});

app.post('/data/impersonate/stop', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  deleteCookie(c, IMPERSONATION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

// Arquivar (soft, irreversível) uma account — só super_admin; nunca a si mesmo nem outro super_admin.
app.post('/data/accounts/:id/archive', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = archiveAccountSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const target = await getAccountById(id);
  if (!target) return c.json({ error: 'not_found' }, 404);
  const decision = canToggleAccount(claims.sub, target);
  if (!decision.ok) return c.json({ error: 'forbidden', reason: decision.reason }, 403);
  const account = await archiveAccount(claims.slug, id);
  return c.json({ account });
});

// ── Onda A — planos configuráveis ──────────────────────────────────────────────
// Listar planos: visibilidade global (super_admin/socio). Usado pela página /plans e pelo dropdown
// de plano no cadastro de account.
app.get('/data/plans', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  return c.json({ plans: await listPlans() });
});

// Criar plano — só super_admin. slug duplicado → 409 genérico.
app.post('/data/plans', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const plan = await createPlan(claims.slug, parsed.data);
    return c.json({ plan }, 201);
  } catch (err) {
    if (err instanceof Error && /\b409\b|23505/.test(err.message)) {
      return c.json({ error: 'conflict' }, 409);
    }
    throw err;
  }
});

// Editar/desativar plano (soft via is_active) — só super_admin.
app.patch('/data/plans/:id', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const plan = await updatePlan(claims.slug, id, parsed.data);
  return c.json({ plan });
});

// Atribuir/trocar o plano de uma account — só super_admin. Registra em plan_changes.
app.patch('/data/accounts/:id/plan', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin'])) return c.json({ error: 'forbidden' }, 403);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = assignPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const target = await getAccountById(id);
  if (!target) return c.json({ error: 'not_found' }, 404);
  const account = await assignPlan(claims.slug, id, parsed.data.planId, parsed.data.reason);
  return c.json({ account });
});

// Cadastrar cliente pela UI — super_admin/socio. Nasce na account do criador (das claims, nunca texto livre).
app.post('/data/clients', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const client = await createClient(scopeFromClaims(claims), parsed.data);
    return c.json({ client }, 201);
  } catch (err) {
    if (err instanceof Error && /\b409\b|23505/.test(err.message)) {
      return c.json({ error: 'conflict' }, 409);
    }
    throw err;
  }
});

// Produtos de um cliente (brief). Escopo garantido: o cliente precisa ser visível ao chamador.
app.get('/data/products', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  const clientId = c.req.query('client_id');
  if (clientId === undefined || !UUID_RE.test(clientId)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  return c.json({ products: await listProducts(clientId) });
});

// Cadastrar produto (brief) — super_admin/socio. O clientId precisa pertencer ao escopo do chamador.
app.post('/data/products', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const product = await createProduct(claims.slug, parsed.data);
    return c.json({ product }, 201);
  } catch (err) {
    if (err instanceof Error && /\b409\b|23505/.test(err.message)) {
      return c.json({ error: 'conflict' }, 409);
    }
    throw err;
  }
});

app.get('/data/connections', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const scope = scopeFromClaims(claims);
  return c.json({ connections: await listConnections(scope) });
});

app.post('/data/connections', async (c) => {
  if (!isSecretsVaultEnabled(serverEnv())) return c.json({ error: 'vault_unconfigured' }, 503);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createConnectionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const scope = scopeFromClaims(claims);
  const connection = await createConnection(scope, parsed.data);
  return c.json({ connection }, 201);
});

app.patch('/data/connections/:id', async (c) => {
  if (!isSecretsVaultEnabled(serverEnv())) return c.json({ error: 'vault_unconfigured' }, 503);
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = updateConnectionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const scope = scopeFromClaims(claims);
  try {
    const connection = await updateConnection(scope, id, parsed.data);
    return c.json({ connection });
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return c.json({ error: 'not_found' }, 404);
    }
    if (err instanceof Error && err.message.startsWith('forbidden')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    throw err;
  }
});

app.delete('/data/connections/:id', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const scope = scopeFromClaims(claims);
  try {
    await deleteConnection(scope, id);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'not_found') {
      return c.json({ error: 'not_found' }, 404);
    }
    if (err instanceof Error && err.message.startsWith('forbidden')) {
      return c.json({ error: 'forbidden' }, 403);
    }
    throw err;
  }
});

// Sincroniza campanhas da Meta para o painel (ADR 0036) — leitura read-only, síncrona (sem job),
// resposta na hora. Nunca muta a Meta. Erro de auth marca a conexão como invalid (mesma classificação
// do cron de validação).
app.post('/data/connections/:id/sync-campaigns', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const id = c.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const scope = scopeFromClaims(claims);
  const result = await syncCampaigns(scope, id);
  if (result.status === 'not_found') return c.json({ error: 'not_found' }, 404);
  if (result.status === 'forbidden') return c.json({ error: 'forbidden' }, 403);
  if (result.status === 'client_ambiguous' || result.status === 'client_required') {
    return c.json({ error: result.status }, 422);
  }
  if (result.status === 'auth_error')
    return c.json({ error: result.status, message: result.message }, 401);
  if (result.status === 'error')
    return c.json({ error: 'sync_failed', message: result.message }, 502);
  return c.json({ ok: true, imported: result.imported });
});

app.get('/data/api-keys', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const scope = scopeFromClaims(claims);
  return c.json({ apiKeys: await listApiKeys(scope) });
});

app.post('/data/api-keys', async (c) => {
  if (!isSecretsVaultEnabled(serverEnv())) return c.json({ error: 'vault_unconfigured' }, 503);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = upsertApiKeySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const scope = scopeFromClaims(claims);
  const apiKey = await upsertApiKey(scope, parsed.data);
  return c.json({ apiKey }, 201);
});

// Snapshot ao vivo (Onda 16) — leitura escopada por account para o POLLING da UI. Gated
// (super_admin/socio) com auth/authz inline, mas FORA do rate-limit do Nexus (polling frequente):
// registrada ANTES do middleware /nexus/* de propósito, então aquele middleware não a intercepta.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.get('/nexus/snapshot', async (c) => {
  const claims = await apiClaims(c);
  if (!isAuthenticated(claims)) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  const jobId = c.req.query('jobId');
  if (jobId !== undefined && !UUID_RE.test(jobId)) return c.json({ error: 'invalid_request' }, 400);
  const scope = scopeFromClaims(claims);
  const snap = jobId ? await getSnapshotByJobId(scope, jobId) : await getLatestSnapshot(scope);
  if (!snap) return c.json({ status: 'pending' });
  return c.json({
    status: 'ready',
    snapshot: {
      jobId: snap.job_id,
      period: snap.period,
      payload: snap.payload,
      createdAt: snap.created_at,
    },
  });
});

// ── Nexus (protected: auth → authz → rate limit → validation → logic) ──────────
// Toda conta autenticada usa o Nexus (inclusive cliente_usuario — reverte a restrição só-agência da
// Onda 15). O escopo dos dados/ações continua limitado pela account da sessão (scopeFromClaims).
app.use('/nexus/*', async (c, next) => {
  const claims = await apiClaims(c);
  if (!isAuthenticated(claims)) return c.json({ error: 'unauthorized' }, 401);
  const rl = await limitNexus(serverEnv(), clientIp(c));
  if (!rl.success) return c.json({ error: 'too_many_requests' }, 429);
  await next();
});

// Chat (turno 1): texto → resposta; tools de leitura diretas; escrita PROPÕE pendência.
app.post('/nexus/chat', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const result = await runChatTurn({
      message: parsed.data.message,
      history: parsed.data.history ?? [],
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof NexusUnavailableError) return c.json({ error: 'nexus_unavailable' }, 503);
    throw err;
  }
});

// Confirmação (turno 2): só aqui um job é enfileirado (escrita = só enfileira).
app.post('/nexus/confirm', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const result = await confirmAndEnqueue(parsed.data);
  return c.json(result);
});

// STT (Whisper) — multipart com o campo "audio".
app.post('/nexus/stt', async (c) => {
  const form = await c.req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob)) return c.json({ error: 'invalid_request' }, 400);
  try {
    return c.json({ text: await transcribe(audio) });
  } catch (err) {
    if (err instanceof NexusUnavailableError) return c.json({ error: 'stt_unavailable' }, 503);
    throw err;
  }
});

// TTS (ElevenLabs) — devolve audio/mpeg.
app.post('/nexus/tts', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = ttsRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const audio = await synthesize(parsed.data.text, {
      voice: parsed.data.voice,
      speed: parsed.data.speed,
      pitch: parsed.data.pitch,
      vol: parsed.data.vol,
    });
    return c.body(audio, 200, { 'content-type': 'audio/mpeg' });
  } catch (err) {
    if (err instanceof NexusUnavailableError) return c.json({ error: 'tts_unavailable' }, 503);
    throw err;
  }
});

// Visão de tela — descreve um print (imagem = dado, não instrução).
app.post('/nexus/capture', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = captureRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  try {
    const description = await describeScreen(parsed.data.image, parsed.data.question);
    return c.json({ description });
  } catch (err) {
    if (err instanceof NexusUnavailableError) return c.json({ error: 'nexus_unavailable' }, 503);
    throw err;
  }
});

app.get('/nexus/narrations', async (c) => c.json({ narrations: await listNarrations() }));

// ── Landing editor + autonomous mode (protected) ───────────────────────────────
// Onda 15 — edição de landing/modo autônomo é operação da AGÊNCIA: só visibilidade global.
app.use('/landing/*', async (c, next) => {
  const claims = await apiClaims(c);
  if (!isAuthenticated(claims)) return c.json({ error: 'unauthorized' }, 401);
  if (!hasRole(claims, ['super_admin', 'socio'])) return c.json({ error: 'forbidden' }, 403);
  await next();
});

// Edição síncrona de um campo de seção (concorrência otimista por versão).
app.post('/landing/section', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = editSectionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const outcome = await editSection(parsed.data);
  if (!outcome.ok) {
    return c.json({ error: outcome.reason }, outcome.reason === 'not_found' ? 404 : 409);
  }
  return c.json({ ok: true, version: outcome.version });
});

// Pedido de criação de landing page pela aba (escrita = só enfileira). O middleware /landing/* já
// garantiu auth + super_admin/socio; aqui validamos a entrada e enfileiramos o job (slug resolvido
// pela allowlist server-side, nunca texto livre). 201 com o status da fila (enqueued/already_active).
app.post('/landing/create', async (c) => {
  const claims = await apiClaims(c);
  if (!claims) return c.json({ error: 'unauthorized' }, 401);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = createLandingSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const result = await enqueueCreateLandingJob(scopeFromClaims(claims), parsed.data);
  // Cliente/produto inexistente: não vira job (mata o falso-verde). 404 com o motivo.
  if (result.status === 'client_not_found' || result.status === 'product_not_found') {
    return c.json({ error: result.status }, 404);
  }
  // Teto de LPs do plano atingido: 422 com o limite/contagem para a UI explicar.
  if (result.status === 'plan_limit') {
    return c.json({ error: 'plan_limit', limit: result.limit, current: result.current }, 422);
  }
  return c.json({ ok: true, status: result.status, jobId: result.jobId }, 201);
});

// Inputs OPCIONAIS da geração de LP (imagens enviadas + copy escrita à mão). Multipart. Guarda no
// Storage e devolve um `inputs_token` que o operador anexa ao /landing/create. Entrada externa é
// DADO: MIME/tamanho/quantidade validados aqui e no service; copy validada por schema. O middleware
// /landing/* já garantiu auth + super_admin/socio.
app.post('/landing/inputs', async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (form === null) return c.json({ error: 'invalid_request' }, 400);

  const images = form.getAll('images').filter((v): v is File => v instanceof File && v.size > 0);
  if (images.length > MAX_IMAGES) return c.json({ error: 'too_many_images' }, 400);

  // Campos de copy: só os presentes/não-vazios entram (ausência = a IA gera).
  const rawCopy: Record<string, string> = {};
  for (const k of ['headline', 'subheadline', 'ctaLabel', 'notes'] as const) {
    const v = form.get(k);
    if (typeof v === 'string' && v.trim().length > 0) rawCopy[k] = v.trim();
  }
  const parsedCopy = landingInputsCopySchema.safeParse(rawCopy);
  if (!parsedCopy.success) return c.json({ error: 'invalid_request' }, 400);
  const copy = Object.keys(parsedCopy.data).length > 0 ? parsedCopy.data : undefined;

  // Contexto do produto (wizard — Etapa 2): produto, preço, oferta, destino do CTA. Tudo opcional;
  // entrada externa é DADO, não instrução. Preço chega em centavos; o destino do CTA é normalizado
  // (WhatsApp → wa.me) e só https passa. O schema rejeita o que não casar (anti-XSS/anti-injeção).
  const rawContext: Record<string, unknown> = {};
  const productName = form.get('productName');
  if (typeof productName === 'string' && productName.trim().length > 0) {
    rawContext.productName = productName.trim();
  }
  const whatItSolves = form.get('whatItSolves');
  if (typeof whatItSolves === 'string' && whatItSolves.trim().length > 0) {
    rawContext.whatItSolves = whatItSolves.trim();
  }
  const offer = form.get('offer');
  if (typeof offer === 'string' && offer.trim().length > 0) rawContext.offer = offer.trim();
  const priceCentsRaw = form.get('priceCents');
  if (typeof priceCentsRaw === 'string' && priceCentsRaw.trim().length > 0) {
    const n = Number(priceCentsRaw);
    if (!Number.isInteger(n) || n < 0) return c.json({ error: 'invalid_request' }, 400);
    rawContext.priceCents = n;
  }
  // CTA: kind (whatsapp|url|checkout) + value (número para WhatsApp, https para url/checkout).
  const ctaKind = form.get('ctaKind');
  const ctaValue = form.get('ctaValue');
  if (typeof ctaKind === 'string' && typeof ctaValue === 'string' && ctaValue.trim().length > 0) {
    const href = ctaKind === 'whatsapp' ? whatsappHref(ctaValue) : ctaValue.trim();
    if (href === null) return c.json({ error: 'invalid_request' }, 400);
    rawContext.cta = { kind: ctaKind, href };
  }
  const parsedContext = landingInputsContextSchema.safeParse(rawContext);
  if (!parsedContext.success) return c.json({ error: 'invalid_request' }, 400);
  const context: LandingInputsContext | undefined =
    Object.keys(parsedContext.data).length > 0 ? parsedContext.data : undefined;

  if (images.length === 0 && copy === undefined && context === undefined) {
    return c.json({ error: 'nothing_to_store' }, 400);
  }

  const outcome = await storeLandingInputs({ images, copy, context });
  if ('rejected' in outcome) return c.json({ error: outcome.reason }, 400);
  return c.json({ ok: true, inputs_token: outcome.inputsToken, images: outcome.imageUrls }, 201);
});

// Inicia o modo autônomo (cria autonomous_watches; o runner avança por tick).
app.post('/landing/autonomous', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = startWatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
  const { id } = await startWatch(parsed.data);
  return c.json({ ok: true, watchId: id });
});

app.get('/health', (c) => c.json({ ok: true }));

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
