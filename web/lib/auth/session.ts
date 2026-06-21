import { SignJWT, jwtVerify } from 'jose';
import {
  SESSION_TTL_SECONDS,
  buildOperatorClaims,
  sessionClaimsSchema,
  type SessionClaims,
} from './domain';

/**
 * Session infrastructure: signs/verifies the JWT cookie with HS256 using AUTH_SECRET.
 * Uses Web Crypto (`jose` + `crypto.subtle`) so it runs in both the Edge middleware and Node
 * route handlers. Validation of the decoded claims goes through the Zod schema — a forged or
 * tampered token never reaches the logic layer.
 */

const JWT_ALG = 'HS256';
const JWT_ISSUER = 'meta-ads-dashboard';
const JWT_AUDIENCE = 'meta-ads-operator';

function secretKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

export async function signSession(authSecret: string): Promise<string> {
  const claims = buildOperatorClaims();
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(claims.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(authSecret));
}

/** Returns validated claims, or null if the token is missing/expired/forged/malformed. */
export async function verifySession(
  token: string | undefined,
  authSecret: string,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(authSecret), {
      algorithms: [JWT_ALG],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const parsed = sessionClaimsSchema.safeParse({ sub: payload.sub, role: payload.role });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** SHA-256 hex digest using Web Crypto — same primitive available in Edge + Node. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
