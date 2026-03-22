import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { Account, Provider, Database, Settings } from '../types/index.js';

const DATA_DIR = path.join(os.homedir(), '.7router');
const DB_PATH = path.join(DATA_DIR, 'db.json');

interface StoredData {
  accounts: Account[];
  settings: Settings;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readData(): StoredData {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    return {
      accounts: [],
      settings: {
        port: 3000,
        host: '127.0.0.1',
      },
    };
  }
  const content = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(content) as StoredData;
}

function writeData(data: StoredData): void {
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(): string {
  return crypto.randomUUID();
}

export function getAccounts(): Account[] {
  return readData().accounts;
}

export function getAccountsByProvider(provider: Provider): Account[] {
  return getAccounts().filter((a) => a.provider === provider);
}

export function getActiveAccount(provider: Provider): Account | undefined {
  return getAccounts().find((a) => a.provider === provider && a.isActive);
}

export function getAccount(id: string): Account | undefined {
  return getAccounts().find((a) => a.id === id);
}

export function addAccount(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account {
  const data = readData();
  
  if (account.isActive) {
    data.accounts.forEach((a) => {
      if (a.provider === account.provider) {
        a.isActive = false;
        a.updatedAt = new Date().toISOString();
      }
    });
  }

  const newAccount: Account = {
    ...account,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.accounts.push(newAccount);
  writeData(data);
  return newAccount;
}

export function updateAccount(id: string, updates: Partial<Account>): Account | null {
  const data = readData();
  const index = data.accounts.findIndex((a) => a.id === id);
  
  if (index === -1) {
    return null;
  }

  const provider = data.accounts[index].provider;
  
  if (updates.isActive && updates.isActive !== data.accounts[index].isActive) {
    data.accounts.forEach((a, i) => {
      if (i !== index && a.provider === provider) {
        a.isActive = false;
        a.updatedAt = new Date().toISOString();
      }
    });
  }

  data.accounts[index] = {
    ...data.accounts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  writeData(data);
  return data.accounts[index];
}

export function deleteAccount(id: string): boolean {
  const data = readData();
  const index = data.accounts.findIndex((a) => a.id === id);
  
  if (index === -1) {
    return false;
  }

  const deleted = data.accounts.splice(index, 1)[0];
  writeData(data);
  
  const activeForProvider = data.accounts.find((a) => a.provider === deleted.provider && a.isActive);
  if (!activeForProvider) {
    const firstOfProvider = data.accounts.find((a) => a.provider === deleted.provider);
    if (firstOfProvider) {
      updateAccount(firstOfProvider.id, { isActive: true });
    }
  }
  
  return true;
}

export function setActiveAccount(id: string): boolean {
  const account = getAccount(id);
  if (!account) {
    return false;
  }
  updateAccount(id, { isActive: true });
  return true;
}

export function getSettings(): Settings {
  return readData().settings;
}

export function updateSettings(updates: Partial<Settings>): Settings {
  const data = readData();
  data.settings = { ...data.settings, ...updates };
  writeData(data);
  return data.settings;
}

export function clearAllAccounts(): void {
  const data = readData();
  data.accounts = [];
  writeData(data);
}

export function getDataDir(): string {
  return DATA_DIR;
}
