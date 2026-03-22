import { Command } from 'commander';
import { createServer } from '../server.js';
import { getSettings, updateSettings } from '../db/storage.js';

export function createServeCommand(): Command {
  const cmd = new Command('serve');
  cmd.description('Start the 7router proxy server');

  cmd
    .option('-p, --port <port>', 'Port to listen on', (val) => parseInt(val, 10))
    .option('-h, --host <host>', 'Host to bind to')
    .action((options) => {
      startServer(options);
    });

  return cmd;
}

function startServer(options: { port?: number; host?: string }): void {
  const settings = getSettings();
  const port = options.port || settings.port;
  const host = options.host || settings.host;

  updateSettings({ port, host });

  const server = createServer(port, host);

  server.listen(port, host, () => {
    console.log(`7router running at http://${host}:${port}`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    server.close(() => {
      console.log('Server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
