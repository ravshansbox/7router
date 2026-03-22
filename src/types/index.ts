export type Provider = 'anthropic' | 'openai-codex';

export interface Account {
  id: string;
  provider: Provider;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  isActive: boolean;
  providerSpecificData?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  port: number;
  host: string;
}

export interface Database {
  accounts: Account[];
  settings: Settings;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  expiresIn: number;
}

export interface OAuthTokensResponse extends OAuthTokens {
  tokenType: string;
  scope: string;
}
