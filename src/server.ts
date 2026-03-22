import http from 'http';
import { URL } from 'url';
import { getActiveAccount, updateAccount } from './db/storage.js';
import { refreshAnthropicToken } from './oauth/anthropic.js';
import { refreshOpenAICodexToken } from './oauth/openai-codex.js';
import type { Account } from './types/index.js';

const ANTHROPIC_API = 'https://api.anthropic.com';
const CODEX_API = 'https://chatgpt.com/backend-api';

export function createServer(port: number, host: string): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`);

    try {
      if (url.pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
        return;
      }

      if (url.pathname.startsWith('/api/anthropic')) {
        await handleAnthropic(req, res, url);
        return;
      }

      if (url.pathname.startsWith('/api/openai')) {
        await handleOpenAI(req, res, url);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('Server error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
    }
  });
}

async function handleAnthropic(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const path = url.pathname.replace('/api/anthropic', '');

  if (path === '/v1/messages' && req.method === 'POST') {
    await handleAnthropicMessages(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function handleOpenAI(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const path = url.pathname.replace('/api/openai', '');

  if (path === '/v1/chat/completions' && req.method === 'POST') {
    await handleChatCompletions(req, res);
    return;
  }

  if (path === '/v1/responses' && req.method === 'POST') {
    await handleResponses(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function getBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function handleAnthropicMessages(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const account = await getValidAccount('anthropic');
  if (!account) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No active Anthropic account. Run: 7router auth add anthropic' }));
    return;
  }

  const bodyStr = await getBody(req);
  const body = JSON.parse(bodyStr);
  const isStreaming = body.stream !== false;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
    'anthropic-dangerous-direct-browser-access': 'true',
    'User-Agent': 'claude-cli/2.1.63 (external, cli)',
    'X-App': 'cli',
    'Accept': isStreaming ? 'text/event-stream' : 'application/json',
  };

  const requestBody = addClaudeCodeIdentity(body);
  let upstream = await fetch(`${ANTHROPIC_API}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!upstream.ok && upstream.status === 401) {
    const refreshed = await refreshAccountToken(account);
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      upstream = await fetch(`${ANTHROPIC_API}/v1/messages`, {
        method: 'POST',
        headers,
        body: bodyStr,
      });
    }
  }

  if (isStreaming) {
    pipeStream(res, upstream);
  } else {
    const data = await upstream.json();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const account = await getValidAccount('openai-codex');
  if (!account) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No active OpenAI Codex account. Run: 7router auth add openai-codex' }));
    return;
  }

  const bodyStr = await getBody(req);
  const body = JSON.parse(bodyStr);
  const codexBody = translateChatToCodex(body);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'chatgpt-account-id': (account.providerSpecificData?.chatgptAccountId as string) || '',
    'originator': 'pi',
    'User-Agent': 'pi (macOS; arm64)',
    'Accept': 'text/event-stream',
  };

  let upstream = await fetch(`${CODEX_API}/codex/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(codexBody),
  });

  if (!upstream.ok && upstream.status === 401) {
    const refreshed = await refreshAccountToken(account);
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      upstream = await fetch(`${CODEX_API}/codex/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(codexBody),
      });
    }
  }

  pipeStream(res, upstream);
}

async function handleResponses(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const account = await getValidAccount('openai-codex');
  if (!account) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No active OpenAI Codex account. Run: 7router auth add openai-codex' }));
    return;
  }

  const bodyStr = await getBody(req);
  const body = JSON.parse(bodyStr);
  const codexBody = translateResponsesToCodex(body);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${account.accessToken}`,
    'Content-Type': 'application/json',
    'chatgpt-account-id': (account.providerSpecificData?.chatgptAccountId as string) || '',
    'originator': 'pi',
    'User-Agent': 'pi (macOS; arm64)',
    'Accept': 'text/event-stream',
  };

  let upstream = await fetch(`${CODEX_API}/codex/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(codexBody),
  });

  if (!upstream.ok && upstream.status === 401) {
    const refreshed = await refreshAccountToken(account);
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      upstream = await fetch(`${CODEX_API}/codex/responses`, {
        method: 'POST',
        headers,
        body: bodyStr,
      });
    }
  }

  pipeStream(res, upstream);
}

async function getValidAccount(provider: 'anthropic' | 'openai-codex'): Promise<Account | null> {
  const account = getActiveAccount(provider);
  if (!account) return null;

  const expiresAt = new Date(account.expiresAt).getTime();
  if (expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      return await refreshAccountToken(account);
    } catch {
      return account;
    }
  }
  return account;
}

async function refreshAccountToken(account: Account): Promise<Account | null> {
  try {
    const tokens = account.provider === 'anthropic'
      ? await refreshAnthropicToken(account.refreshToken)
      : await refreshOpenAICodexToken(account.refreshToken);

    return updateAccount(account.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(tokens.expiresAt).toISOString(),
    });
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

function translateChatToCodex(body: Record<string, unknown>): Record<string, unknown> {
  const model = body.model as string;
  const messages = body.messages as Array<Record<string, unknown>> || [];

  const result: Record<string, unknown> = {
    model: model || 'gpt-4o',
    store: false,
    stream: true,
    input: [] as unknown[],
    reasoning: { effort: 'medium', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
    instructions: 'You are a helpful assistant.',
  };

  for (const msg of messages) {
    const role = msg.role as string;
    const content = msg.content;

    if (role === 'system') {
      const text = typeof content === 'string' ? content : '';
      if (!result.instructions && text.trim()) {
        result.instructions = text;
      }
      continue;
    }

    if (role === 'user') {
      const items = Array.isArray(content)
        ? content.map((c: Record<string, unknown>) => {
            if (c.type === 'text') return { type: 'input_text', text: c.text || '' };
            if (c.type === 'image_url') {
              const imageUrl = c.image_url;
              const url = typeof imageUrl === 'string' ? imageUrl : (imageUrl as Record<string, unknown>)?.url as string;
              const detail = (imageUrl as Record<string, unknown>)?.detail as string || 'auto';
              return { type: 'input_image', image_url: url, detail };
            }
            return c;
          })
        : [{ type: 'input_text', text: String(content || '') }];
      (result.input as unknown[]).push({ type: 'message', role: 'user', content: items });
    }

    if (role === 'assistant') {
      const items = Array.isArray(content)
        ? content.map((c: Record<string, unknown>) => {
            if (c.type === 'text') return { type: 'output_text', text: c.text || '' };
            return c;
          })
        : [{ type: 'output_text', text: String(content || '') }];
      (result.input as unknown[]).push({ type: 'message', role: 'assistant', content: items });

      const toolCalls = msg.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          const fn = tc.function as Record<string, unknown> || {};
          (result.input as unknown[]).push({
            type: 'function_call',
            call_id: tc.id,
            name: fn.name || '',
            arguments: String(fn.arguments || '{}'),
          });
        }
      }
    }

    if (role === 'tool') {
      (result.input as unknown[]).push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: typeof content === 'string' ? content : JSON.stringify(content),
      });
    }
  }

  if (!result.instructions || (typeof result.instructions === 'string' && result.instructions.trim() === '')) {
    result.instructions = 'You are a helpful assistant.';
  }

  return result;
}

function translateResponsesToCodex(body: Record<string, unknown>): Record<string, unknown> {
  const input = body.input as Array<Record<string, unknown>> || [];
  const result: Record<string, unknown> = {
    model: body.model || 'gpt-4o',
    store: false,
    stream: body.stream !== false,
    input: [] as unknown[],
    reasoning: body.reasoning || { effort: 'medium', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
    instructions: '',
  };

  for (const item of input) {
    const role = item.role as string;
    const content = item.content;

    if (role === 'developer') {
      const text = extractText(content);
      if (text && !result.instructions) {
        result.instructions = text;
      }
      continue;
    }

    if (role === 'user') {
      const items = Array.isArray(content)
        ? content.map((c: Record<string, unknown>) => {
            if (c.type === 'text') return { type: 'input_text', text: c.text || '' };
            if (c.type === 'image_url') {
              const imageUrl = c.image_url as string | Record<string, unknown>;
              const url = typeof imageUrl === 'string' ? imageUrl : (imageUrl as Record<string, unknown>)?.url as string;
              return { type: 'input_image', image_url: url };
            }
            return c;
          })
        : [{ type: 'input_text', text: String(content || '') }];
      (result.input as unknown[]).push({ type: 'message', role: 'user', content: items });
    }
  }

  if (!result.instructions || (typeof result.instructions === 'string' && result.instructions.trim() === '')) {
    result.instructions = 'You are a helpful assistant.';
  }

  return result;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === 'string') return c;
      if (typeof c === 'object' && c !== null) {
        const obj = c as Record<string, unknown>;
        if (obj.text) return String(obj.text);
        if (obj.type === 'text') return String(obj.text || '');
      }
      return '';
    }).join('');
  }
  return '';
}

function addClaudeCodeIdentity(body: Record<string, unknown>): Record<string, unknown> {
  const systemMessages = body.system as Array<{type: string; text: string}> || [];
  const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
  
  const hasClaudeCodeIdentity = systemMessages.some(
    (msg) => msg.type === 'text' && msg.text.includes(CLAUDE_CODE_IDENTITY)
  );
  
  if (!hasClaudeCodeIdentity) {
    body.system = [{
      type: 'text',
      text: CLAUDE_CODE_IDENTITY,
    }, ...systemMessages];
  }
  
  return body;
}

function pipeStream(res: http.ServerResponse, upstream: Response): void {
  res.writeHead(upstream.status, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  if (upstream.body) {
    const reader = upstream.body.getReader();
    const pump = (): void => {
      reader.read().then(({ done, value }) => {
        if (done) {
          res.end();
        } else {
          res.write(value);
          pump();
        }
      }).catch(() => res.end());
    };
    pump();
    res.on('close', () => reader.cancel());
  } else {
    res.end();
  }
}
