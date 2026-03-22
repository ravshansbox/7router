import http from 'http';
import { URL } from 'url';

export interface CallbackResult {
  code: string;
  state: string;
}

export interface CallbackServer {
  url: string;
  waitForCallback: () => Promise<CallbackResult>;
  close: () => void;
}

export function createCallbackServer(port: number, host = 'localhost'): Promise<CallbackServer> {
  return new Promise((resolve) => {
    let resolveCallback: (result: CallbackResult) => void;
    const callbackPromise = new Promise<CallbackResult>((resolve) => {
      resolveCallback = resolve;
    });

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${host}:${port}`);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          const errorDescription = url.searchParams.get('error_description') || error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Error</h1><p>${errorDescription}</p></body></html>`);
          resolveCallback!({ code: '', state: '' });
          return;
        }

        if (code && state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Authentication Successful</h1><p>You can close this window and return to the terminal.</p></body></html>`);
          resolveCallback!({ code, state });
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>Missing Parameters</h1><p>Authorization code or state not provided.</p></body></html>`);
        }
      } catch {
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

    server.listen(port, host, () => {
      resolve({
        url: `http://${host}:${port}`,
        waitForCallback: () => callbackPromise,
        close: () => server.close(),
      });
    });
  });
}
