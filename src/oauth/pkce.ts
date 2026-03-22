import crypto from 'crypto';

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}
