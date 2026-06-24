import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { serverEnv, isTurnstileEnabled, publicEnv } from '../../../lib/env';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isAuthenticated,
  buildClaims,
  loginInputSchema,
  passwordMatches,
  type SessionClaims,
} from '../../../lib/auth/domain';
import { signSession, verifySession, sha256Hex } from '../../../lib/auth/session';
import { verifyPassword } from '../../../lib/auth/password';
import { verifyTurnstile } from '../../../lib/auth/turnstile';
import { limitLogin, limitNexus } from '../../../lib/ratelimit';
import { listClients, getClientBySlug } from '../../../lib/services/clients';
import { listAllCampaigns } from '../../../lib/services/campaigns';
import { listAnalyses, getLatestAnalysis, listFunnelEvents } from '../../../lib/services/analyses';
import { listLandingPages } from '../../../lib/services/landing-pages';
import { listOperationLogs } from '../../../lib/services/logs';
import { listNarrations } from '../../../lib/services/narrations';
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
import { editSectionSchema, startWatchSchema } from '../../../lib/landing/edit';
import { editSection } from '../../../lib/services/landing-sections';
import { startWatch } from '../../../lib/services/watches';
import { isSecretsVaultEnabled } from '../../../lib/env';
import {
  listAccounts,
  getLoginAccountByEmail,
  getSuperAdminAnchor,
  touchLastLogin,
} from '../../../lib/services/accounts';
import { listConnections, createConnection } from '../../../lib/services/connections';
import { listApiKeys, upsertApiKey } from '../../../lib/services/api-keys';
import { createConnectionSchema, upsertApiKeySchema } from '../../../lib/multitenant/requests';
import { scopeFromClaims } from '../../../lib/multitenant/scope';

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

app.get('/data/clients', async (c) => c.json({ clients: await listClients() }));

app.get('/data/clients/:slug', async (c) => {
  const slug = c.req.param('slug');
  const client = await getClientBySlug(slug);
  if (!client) return c.json({ error: 'not_found' }, 404);
  return c.json({ client });
});

app.get('/data/campaigns', async (c) => c.json({ campaigns: await listAllCampaigns() }));

app.get('/data/analyses', async (c) => c.json({ analyses: await listAnalyses() }));

app.get('/data/funnel', async (c) => {
  const latest = await getLatestAnalysis();
  if (!latest) return c.json({ analysis: null, events: [] });
  return c.json({ analysis: latest, events: await listFunnelEvents(latest.id) });
});

app.get('/data/landing-pages', async (c) => c.json({ landingPages: await listLandingPages() }));

app.get('/data/logs', async (c) => c.json({ logs: await listOperationLogs() }));

// ── Onda 12 — multi-tenant: accounts, conexões Meta e chaves de API ────────────
// Leituras projetam só colunas de DISPLAY (o cipher do token/chave NUNCA é selecionado). Escritas
// cifram server-side. Escopo por account (super_admin vê tudo). O segredo nunca volta na resposta.
app.get('/data/accounts', async (c) => c.json({ accounts: await listAccounts() }));

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

// ── Nexus (protected: auth → authz → rate limit → validation → logic) ──────────
app.use('/nexus/*', async (c, next) => {
  if (!(await requireOperatorApi(c))) return c.json({ error: 'unauthorized' }, 401);
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
app.use('/landing/*', async (c, next) => {
  if (!(await requireOperatorApi(c))) return c.json({ error: 'unauthorized' }, 401);
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
