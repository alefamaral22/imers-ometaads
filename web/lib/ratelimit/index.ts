import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { isRateLimitEnabled, type ServerEnv } from '../env';

/**
 * Rate limiting for public endpoints (login) — SPEC-000 §11. Backed by Upstash Redis. When
 * Upstash is not configured the limiter degrades to "allow" so local dev still works; in prod
 * the envs are present. The login route always calls this before validating the password.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  limit: number;
}

const ALLOW_ALL: RateLimitResult = { success: true, remaining: Number.MAX_SAFE_INTEGER, limit: 0 };

let limiter: Ratelimit | null = null;

function getLimiter(env: ServerEnv): Ratelimit | null {
  if (!isRateLimitEnabled(env)) return null;
  if (!limiter) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL as string,
      token: env.UPSTASH_REDIS_REST_TOKEN as string,
    });
    limiter = new Ratelimit({
      redis,
      // 5 attempts per minute per identifier (typically client IP).
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      prefix: 'mdash:login',
      analytics: false,
    });
  }
  return limiter;
}

export async function limitLogin(env: ServerEnv, identifier: string): Promise<RateLimitResult> {
  const rl = getLimiter(env);
  if (!rl) return ALLOW_ALL;
  const { success, remaining, limit } = await rl.limit(identifier);
  return { success, remaining, limit };
}

let nexusLimiter: Ratelimit | null = null;

function getNexusLimiter(env: ServerEnv): Ratelimit | null {
  if (!isRateLimitEnabled(env)) return null;
  if (!nexusLimiter) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL as string,
      token: env.UPSTASH_REDIS_REST_TOKEN as string,
    });
    nexusLimiter = new Ratelimit({
      redis,
      // 30 requisições por minuto por operador — protege os endpoints de voz/chat do Nexus.
      limiter: Ratelimit.slidingWindow(30, '60 s'),
      prefix: 'mdash:nexus',
      analytics: false,
    });
  }
  return nexusLimiter;
}

export async function limitNexus(env: ServerEnv, identifier: string): Promise<RateLimitResult> {
  const rl = getNexusLimiter(env);
  if (!rl) return ALLOW_ALL;
  const { success, remaining, limit } = await rl.limit(identifier);
  return { success, remaining, limit };
}
