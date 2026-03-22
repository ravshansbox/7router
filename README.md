# 7router

Local proxy to share Claude Code and ChatGPT Plus subscriptions as API endpoints.

## Setup

```bash
npm install
npm run build
```

## Usage

### Authenticate

```bash
# Claude Code (Anthropic)
npx 7router auth add anthropic

# ChatGPT Plus (OpenAI Codex)
npx 7router auth add openai-codex
```

### Manage Accounts

```bash
# List all accounts
npx 7router accounts list

# Switch active account
npx 7router accounts switch <id>

# Remove account
npx 7router accounts remove <id>
```

### Start Server

```bash
npm start
```

### API Endpoints

```bash
# Anthropic (Claude API)
POST http://localhost:3000/api/anthropic/v1/messages

# OpenAI (Chat Completions)
POST http://localhost:3000/api/openai/v1/chat/completions

# OpenAI (Responses)
POST http://localhost:3000/api/openai/v1/responses
```

Data stored at `~/.7router/db.json`.

## Opencode Configuration

To use 7router with opencode, add this to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openai/gpt-5.4",
  "provider": {
    "anthropic": {
      "options": { "baseURL": "http://127.0.0.1:3000/api/anthropic/v1", "apiKey": "local" },
      "whitelist": ["claude-opus-4-6", "claude-sonnet-4-6"]
    },
    "openai": {
      "options": { "baseURL": "http://127.0.0.1:3000/api/openai/v1", "apiKey": "local" },
      "whitelist": ["gpt-5.4", "gpt-5.3-codex"]
    }
  }
}
```
