import { Command } from 'commander';
import { authenticateAnthropic } from '../oauth/anthropic.js';
import { authenticateOpenAICodex } from '../oauth/openai-codex.js';
import { addAccount, getAccountsByProvider, getDataDir } from '../db/storage.js';
import type { Provider } from '../types/index.js';

export function createAuthCommand(): Command {
  const cmd = new Command('auth');
  cmd.description('Manage OAuth authentication');

  const addSub = new Command('add');
  addSub
    .argument('<provider>', 'Provider to authenticate (anthropic, openai-codex)')
    .description('Add authentication for a provider')
    .action(async (provider: string) => {
      await addAuth(provider as Provider);
    });

  cmd.addCommand(addSub);

  const listSub = new Command('list');
  listSub.description('List authenticated providers').action(() => {
    listAuth();
  });

  cmd.addCommand(listSub);

  return cmd;
}

async function addAuth(provider: Provider): Promise<void> {
  console.log(`Authenticating with ${provider}...\n`);

  const onOpenBrowser = async (url: string) => {
    console.log('Open this URL in your browser:\n');
    console.log(`${url}\n`);
  };

  try {
    if (provider === 'anthropic') {
      const result = await authenticateAnthropic(onOpenBrowser);

      const existing = getAccountsByProvider('anthropic');
      const isFirst = existing.length === 0;

      addAccount({
        provider: 'anthropic',
        email: result.accountInfo.email || 'unknown',
        name: result.accountInfo.name || result.accountInfo.email || 'Anthropic Account',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: new Date(result.expiresAt).toISOString(),
        isActive: isFirst,
        providerSpecificData: {
          oauthAccountId: result.accountInfo.id,
        },
      });

      console.log(`\nSuccessfully authenticated with Anthropic!`);
      console.log(`Email: ${result.accountInfo.email || 'unknown'}`);
      console.log(`Data stored at: ${getDataDir()}\n`);
    } else if (provider === 'openai-codex') {
      const result = await authenticateOpenAICodex(onOpenBrowser);

      const existing = getAccountsByProvider('openai-codex');
      const isFirst = existing.length === 0;

      addAccount({
        provider: 'openai-codex',
        email: result.accountInfo.email || 'unknown',
        name: result.accountInfo.name || result.accountInfo.email || 'OpenAI Account',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: new Date(result.expiresAt).toISOString(),
        isActive: isFirst,
        providerSpecificData: {
          chatgptAccountId: result.chatgptAccountId,
        },
      });

      console.log(`\nSuccessfully authenticated with OpenAI Codex!`);
      console.log(`Email: ${result.accountInfo.email || 'unknown'}`);
      console.log(`Data stored at: ${getDataDir()}\n`);
    } else {
      console.error(`Unknown provider: ${provider}`);
      console.error('Supported providers: anthropic, openai-codex');
      process.exit(1);
    }
  } catch (error) {
    console.error('Authentication failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function listAuth(): void {
  const anthropicAccounts = getAccountsByProvider('anthropic');
  const openaiAccounts = getAccountsByProvider('openai-codex');

  console.log('\nAuthenticated providers:\n');

  if (anthropicAccounts.length === 0 && openaiAccounts.length === 0) {
    console.log('  No accounts authenticated.');
    console.log('  Run: 7router auth add <provider>\n');
    return;
  }

  if (anthropicAccounts.length > 0) {
    console.log('  Anthropic:');
    anthropicAccounts.forEach((account) => {
      const marker = account.isActive ? ' (active)' : '';
      console.log(`    - ${account.name} (${account.email})${marker}`);
    });
    console.log();
  }

  if (openaiAccounts.length > 0) {
    console.log('  OpenAI Codex:');
    openaiAccounts.forEach((account) => {
      const marker = account.isActive ? ' (active)' : '';
      console.log(`    - ${account.name} (${account.email})${marker}`);
    });
    console.log();
  }
}
