#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth.js';
import { createAccountsCommand } from './commands/accounts.js';
import { createServeCommand } from './commands/serve.js';
import { getDataDir } from './db/storage.js';

const program = new Command();

program
  .name('7router')
  .description('Local proxy to share Claude Code and ChatGPT Plus subscriptions as API endpoints')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize 7router data directory')
  .action(() => {
    const dir = getDataDir();
    console.log(`\n7router data directory: ${dir}\n`);
  });

program.addCommand(createAuthCommand());
program.addCommand(createAccountsCommand());
program.addCommand(createServeCommand());

program.parse();
