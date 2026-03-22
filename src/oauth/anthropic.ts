import http from 'http';
import { URL } from 'url';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = '/callback';
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AccountInfo {
  id?: string;
  email?: string;
  name?: string;
}

export async function authenticateAnthropic(
  onOpenBrowser: (url: string) => Promise<void>
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountInfo: AccountInfo;
}> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier,
  });

  const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;
  await onOpenBrowser(authUrl);

  const { code, state } = await waitForCallback();

  if (state !== verifier) {
    throw new Error('OAuth state mismatch');
  }

  const tokens = await exchangeCode(code, verifier);
  const accountInfo = await getAccountInfo(tokens.accessToken);

  return { ...tokens, accountInfo };
}

async function waitForCallback(): Promise<{ code: string; state: string }> {
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
      resolve({ code, state });
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
}> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      state: verifier,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as TokenData;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAnthropicToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
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
  const response = await fetch('https://api.anthropic.com/v1/oauth/userinfo', {
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
