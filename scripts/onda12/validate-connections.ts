// Onda 12 — Entrypoint da skill validate-connections-tick (SPEC §5.4, ADR 0027/0028). Headless,
// read-mostly: percorre conexões manuais vivas, faz um probe BARATO à Graph API com o token decifrado
// (caminho REST por tenant do ADR 0028), classifica a saúde e patcha status/last_validated_at. Avisa
// o gestor por Telegram (fail-safe log-only) quando um token é revogado. Decisão pura está testada;
// aqui é só I/O. Nunca loga o token.

import process from 'node:process';
import {
  readSupabaseConfigFromEnv,
  readEncKeys,
  selectConnectionsToValidate,
  decryptConnectionToken,
  patchConnectionById,
  type ConnectionRow,
} from './infrastructure/secrets-rest.ts';
import { classifyMetaProbe, type MetaProbeResult } from './domain/connection-health.ts';
import { planConnectionPatch } from './application/validate-plan.ts';

const GRAPH_VERSION = 'v21.0';

function actId(metaAdAccountId: string): string {
  return metaAdAccountId.startsWith('act_') ? metaAdAccountId : `act_${metaAdAccountId}`;
}

/** Probe barato: GET act_<id>?fields=name. Token vai no header Bearer (nunca na URL → nunca no log). */
async function probeMetaConnection(
  token: string,
  metaAdAccountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaProbeResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${actId(metaAdAccountId)}?fields=name,account_status`;
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return { ok: true, httpStatus: res.status };
    let errorCode: number | null = null;
    let errorMessage: string | null = null;
    try {
      const body = (await res.json()) as { error?: { code?: number; message?: string } };
      errorCode = body.error?.code ?? null;
      errorMessage = body.error?.message ?? null;
    } catch {
      // resposta não-JSON: fica com os defaults
    }
    return { ok: false, httpStatus: res.status, errorCode, errorMessage };
  } catch (err) {
    // Falha de rede = transitória (httpStatus 0 cai no ramo transient da classificação).
    return {
      ok: false,
      httpStatus: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Notificação opcional ao gestor — degrada para log-only sem Telegram (nunca derruba a skill). */
async function notifyGestor(message: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    process.stdout.write(`[notify:log-only] ${message}\n`);
    return;
  }
  try {
    await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (err) {
    process.stdout.write(`[notify:failed] ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

async function validateOne(
  cfg: ReturnType<typeof readSupabaseConfigFromEnv>,
  keys: ReturnType<typeof readEncKeys>,
  row: ConnectionRow,
): Promise<{ id: string; result: string }> {
  let token: string;
  try {
    token = decryptConnectionToken(row, keys);
  } catch (err) {
    // Não conseguimos decifrar (chave errada/cipher corrompido): registra, não condena às cegas.
    const msg = err instanceof Error ? err.message : String(err);
    await patchConnectionById(cfg, row.id, { last_validation_error: `decrypt failed: ${msg}` });
    return { id: row.id, result: 'decrypt_error' };
  }

  const probe = await probeMetaConnection(token, row.meta_ad_account_id);
  const decision = classifyMetaProbe(probe);
  const plan = planConnectionPatch(decision, row.meta_ad_account_id, new Date().toISOString());
  await patchConnectionById(cfg, row.id, plan.patch);
  if (plan.notify && plan.message) await notifyGestor(plan.message);
  return { id: row.id, result: decision.kind };
}

async function main(): Promise<void> {
  const cfg = readSupabaseConfigFromEnv();
  const keys = readEncKeys();
  const connections = await selectConnectionsToValidate(cfg);
  process.stdout.write(`validate-connections: ${connections.length} live connection(s)\n`);

  let revoked = 0;
  for (const row of connections) {
    const { id, result } = await validateOne(cfg, keys, row);
    if (result === 'auth_error') revoked += 1;
    process.stdout.write(`  connection ${id} -> ${result}\n`);
  }
  process.stdout.write(`validate-connections: done (${revoked} revoked)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `validate-connections: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
