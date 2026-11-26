import { verify as verifySignature } from 'node:crypto';

export interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

interface FirebaseClaims {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

let certificates: Record<string, string> = {};
let certificatesExpireAt = 0;

export function isValidFirebaseClaims(
  claims: FirebaseClaims,
  projectId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  return (
    claims.aud === projectId &&
    claims.iss === `https://securetoken.google.com/${projectId}` &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    claims.sub.length <= 128 &&
    Number.isFinite(claims.exp) &&
    (claims.exp as number) > nowSeconds &&
    Number.isFinite(claims.iat) &&
    (claims.iat as number) <= nowSeconds + 30 &&
    Number.isFinite(claims.auth_time) &&
    (claims.auth_time as number) <= nowSeconds + 30
  );
}

async function getCertificates() {
  if (Date.now() < certificatesExpireAt && Object.keys(certificates).length > 0) return certificates;
  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    { signal: AbortSignal.timeout(5000) }
  );
  if (!response.ok) throw new Error('Firebase public signing keys unavailable.');
  const next = (await response.json()) as Record<string, string>;
  if (Object.keys(next).length === 0) throw new Error('Firebase public signing keys unavailable.');
  const cacheSeconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
  certificates = next;
  certificatesExpireAt = Date.now() + Math.min(cacheSeconds, 3600) * 1000;
  return certificates;
}

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseIdentity | null> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'fleet-line-6bcxw';
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as FirebaseClaims;
    if (header.alg !== 'RS256' || !header.kid || !isValidFirebaseClaims(claims, projectId)) return null;

    const cert = (await getCertificates())[header.kid];
    if (!cert) return null;
    const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');
    if (!verifySignature('RSA-SHA256', signedContent, cert, signature)) return null;

    return {
      uid: claims.sub as string,
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : '',
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : '',
    };
  } catch {
    return null;
  }
}

export function isPlatformAdmin(identity: FirebaseIdentity) {
  const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'imtyroon@gmail.com').toLowerCase();
  return identity.emailVerified && identity.email === adminEmail;
}
