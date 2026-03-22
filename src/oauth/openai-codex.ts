import http from 'http';
import { URL } from 'url';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import crypto from 'crypto';

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CALLBACK_PORT = 1455;
const CALLBACK_PATH = '/auth/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPE = 'openid profile email offline_access';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

interface AccountInfo {
  email?: string;
  name?: string;
  sub?: string;
}

export async function authenticateOpenAICodex(
  onOpenBrowser: (url: string) => Promise<void>
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  chatgptAccountId?: string;
  accountInfo: AccountInfo;
}> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'pi',
  });

  const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  await onOpenBrowser(authUrl);

  const { code, receivedState } = await waitForCallback();

  if (receivedState !== state) {
    throw new Error('OAuth state mismatch');
  }

  const tokens = await exchangeCode(code, verifier);
  const accountInfo = await getAccountInfo(tokens.accessToken);

  return { ...tokens, accountInfo };
}

async function waitForCallback(): Promise<{ code: string; receivedState: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${CALLBACK_PORT}`);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Error</h1><p>Authentication did not complete.</p></body></html>');
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Missing Parameters</h1></body></html>');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Authentication Successful</h1><p>You can close this window.</p></body></html>');
      server.close();
      resolve({ code, receivedState: state });
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timeout'));
    }, 300000);

    server.on('error', reject);
    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      clearTimeout(timer);
    });
  });
}

async function exchangeCode(code: string, verifier: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  chatgptAccountId?: string;
}> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenData;
  
  let chatgptAccountId: string | undefined;
  if (data.id_token) {
    const payload = decodeJwtPayload(data.id_token);
    if (payload?.['https://api.openai.com/auth']) {
      chatgptAccountId = (payload['https://api.openai.com/auth'] as { chatgpt_account_id?: string }).chatgpt_account_id;
    }
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    chatgptAccountId,
  };
}

export async function refreshOpenAICodexToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenData;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getAccountInfo(accessToken: string): Promise<AccountInfo> {
  const response = await fetch('https://auth.openai.com/oauth/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return {};
  }

  return (await response.json()) as AccountInfo;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
