import { Command } from 'commander';
import { getAccounts, getAccount, setActiveAccount, deleteAccount } from '../db/storage.js';

export function createAccountsCommand(): Command {
  const cmd = new Command('accounts');
  cmd.description('Manage authenticated accounts');

  const listSub = new Command('list');
  listSub.description('List all accounts').action(() => {
    listAccounts();
  });

  cmd.addCommand(listSub);

  const switchSub = new Command('switch');
  switchSub
    .argument('<id>', 'Account ID to set as active')
    .description('Set an account as active for its provider')
    .action((id: string) => {
      switchAccount(id);
    });

  cmd.addCommand(switchSub);

  const removeSub = new Command('remove');
  removeSub
    .argument('<id>', 'Account ID to remove')
    .description('Remove an account')
    .action((id: string) => {
      removeAccount(id);
    });

  cmd.addCommand(removeSub);

  const infoSub = new Command('info');
  infoSub
    .argument('<id>', 'Account ID to show info')
    .description('Show detailed account information')
    .action((id: string) => {
      accountInfo(id);
    });

  cmd.addCommand(infoSub);

  return cmd;
}

function listAccounts(): void {
  const accounts = getAccounts();

  if (accounts.length === 0) {
    console.log('\nNo accounts found.\n');
    return;
  }

  console.log('\nAccounts:\n');

  const byProvider: Record<string, typeof accounts> = {};
  for (const account of accounts) {
    if (!byProvider[account.provider]) {
      byProvider[account.provider] = [];
    }
    byProvider[account.provider].push(account);
  }

  for (const [provider, providerAccounts] of Object.entries(byProvider)) {
    console.log(`  ${provider}:`);
    for (const account of providerAccounts) {
      const marker = account.isActive ? ' (active)' : '';
      const expDate = new Date(account.expiresAt).toLocaleDateString();
      console.log(`    ${account.id.slice(0, 8)}... | ${account.name} | ${account.email} | exp: ${expDate}${marker}`);
    }
    console.log();
  }
}

function switchAccount(id: string): void {
  const account = getAccount(id);

  if (!account) {
    console.error(`Account not found: ${id}`);
    process.exit(1);
  }

  setActiveAccount(id);
  console.log(`\nSwitched to account: ${account.name} (${account.email})\n`);
}

function removeAccount(id: string): void {
  const account = getAccount(id);

  if (!account) {
    console.error(`Account not found: ${id}`);
    process.exit(1);
  }

  const name = account.name;
  deleteAccount(id);
  console.log(`\nRemoved account: ${name}\n`);
}

function accountInfo(id: string): void {
  const account = getAccount(id);

  if (!account) {
    console.error(`Account not found: ${id}`);
    process.exit(1);
  }

  console.log('\nAccount Details:');
  console.log(`  ID:         ${account.id}`);
  console.log(`  Provider:   ${account.provider}`);
  console.log(`  Name:       ${account.name}`);
  console.log(`  Email:      ${account.email}`);
  console.log(`  Active:     ${account.isActive}`);
  console.log(`  Expires:    ${new Date(account.expiresAt).toLocaleString()}`);
  console.log(`  Created:    ${new Date(account.createdAt).toLocaleString()}`);
  console.log(`  Token:      ${account.accessToken.slice(0, 20)}...`);
  console.log();
}
