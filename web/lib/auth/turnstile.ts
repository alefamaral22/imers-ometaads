import { z } from 'zod';

/**
 * Optional Cloudflare Turnstile verification for the login form. Only invoked when the secret
 * is configured (see isTurnstileEnabled). The Cloudflare response is external input, so it is
 * validated by a typed schema before any field is trusted.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const turnstileResponseSchema = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
});

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json: unknown = await res.json();
    const parsed = turnstileResponseSchema.safeParse(json);
    return parsed.success && parsed.data.success;
  } catch {
    return false;
  }
}
