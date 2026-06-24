// Onda 12 — Plano de env de chaves do tenant para um job (ADR 0027, SPEC §5.2). Puro: decide, por
// provedor, se o runner deve injetar a chave do tenant (decifrada pelo caller) ou seguir com a global
// — e aborta o job quando um tenant não-super_admin não tem chave própria utilizável.
//
// IMPORTANTE: super_admin NÃO passa por aqui no runner (o caminho global/OAuth atual é preservado).
// Esta função existe para os tenants pagantes; mantém a lógica testável e fora do poll-once.

import { resolveProviderKey, type AccountRole, type ApiKeyStatus } from '../domain/provider-key.ts';

export interface TenantKeyRecord {
  provider: string;
  status: ApiKeyStatus;
}

export interface PlanKeyEnvInput {
  role: AccountRole;
  tenantKeys: TenantKeyRecord[]; // chaves configuradas para a account
  globalProviders: Record<string, boolean>; // provedores com chave global no .env
  providers: string[]; // provedores que o job precisa resolver (ex.: ['anthropic','openai'])
}

export type PlanKeyEnvResult =
  | { ok: true; useTenant: string[] } // provedores cuja chave do tenant deve ser decifrada+injetada
  | { ok: false; provider: string; reason: string }; // abortar o job

/**
 * Para cada provedor pedido, resolve a fonte (tenant/global/abort). O primeiro `abort` encerra o
 * plano (o job falha cedo, com motivo claro). `useTenant` lista os provedores cuja chave do tenant o
 * caller deve decifrar e injetar no env do subprocesso; os demais seguem com a global já no env.
 */
export function planTenantKeyEnv(input: PlanKeyEnvInput): PlanKeyEnvResult {
  const useTenant: string[] = [];
  for (const provider of input.providers) {
    const tenantKey = input.tenantKeys.find((k) => k.provider === provider) ?? null;
    const resolution = resolveProviderKey({
      role: input.role,
      provider,
      tenantKey: tenantKey === null ? null : { status: tenantKey.status },
      globalKeyAvailable: input.globalProviders[provider] === true,
    });
    if (resolution.source === 'abort') {
      return { ok: false, provider, reason: resolution.reason };
    }
    if (resolution.source === 'tenant') {
      useTenant.push(provider);
    }
  }
  return { ok: true, useTenant };
}
