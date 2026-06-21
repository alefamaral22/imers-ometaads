import { z } from 'zod';

/**
 * Environment contract (SPEC-000 §7). Validation is done by typed schema at the process
 * boundary: external input is data, not instruction. Secrets are server-only; NEXT_PUBLIC_*
 * are the only values exposed to the browser and must never hold a secret.
 *
 * The pure parsers (`parseServerEnv` / `parsePublicEnv`) take a plain record so they are unit
 * testable without touching `process.env` or the network.
 */

const nonEmpty = z.string().trim().min(1);

// Server-only: never imported from a Client Component. RLS is closed to the browser, so every
// table read uses SUPABASE_SECRET_KEY server-side.
export const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: nonEmpty,
  // SHA-256 hex digest of the dashboard password (64 hex chars). Never the plaintext.
  DASHBOARD_PASSWORD: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, 'DASHBOARD_PASSWORD must be a SHA-256 hex digest'),
  // Session signing key: >= 32 bytes of entropy.
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  // Optional: Turnstile (bot protection on login) is enabled only when both are present.
  CLOUDFLARE_TURNSTILE_SECRET_KEY: z.string().trim().optional(),
  // Optional: Upstash rate limiting on the login endpoint.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().optional(),
});

export const publicEnvSchema = z.object({
  // Safe to expose: the Turnstile *site* key is public by design.
  NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: z.string().trim().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

// Feature flags derived from optional envs — pure helpers, also covered by tests.
export function isTurnstileEnabled(
  server: Pick<ServerEnv, 'CLOUDFLARE_TURNSTILE_SECRET_KEY'>,
  pub: Pick<PublicEnv, 'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY'>,
): boolean {
  return Boolean(
    server.CLOUDFLARE_TURNSTILE_SECRET_KEY && pub.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY,
  );
}

export function isRateLimitEnabled(
  server: Pick<ServerEnv, 'UPSTASH_REDIS_REST_URL' | 'UPSTASH_REDIS_REST_TOKEN'>,
): boolean {
  return Boolean(server.UPSTASH_REDIS_REST_URL && server.UPSTASH_REDIS_REST_TOKEN);
}

let cachedServerEnv: ServerEnv | null = null;

/** Lazily parse and cache the server env. Throws on first access if invalid. */
export function serverEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = parseServerEnv(process.env);
  }
  return cachedServerEnv;
}

export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY:
      process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY,
  });
}
