# 📬 Postino

Postino is an AI-powered email redirector. Each user gets a private assigned address, defines natural-language rules, and inbound email is analyzed, transformed, and forwarded to their destination inbox.

## Tech Stack

- Next.js 16 App Router + React 19 + TypeScript
- Supabase (Auth + Postgres + Storage)
- OpenRouter (LLM provider via `ai` SDK)
- Mailgun inbound webhook
- SMTP or Mailgun for outbound delivery
- OneSignal web push notifications

## Quick Start (Local)

1. Install dependencies.

```bash
npm install
```

1. Create environment file.

```bash
cp .env.local.example .env.local
```

1. Fill all required variables in `.env.local`.

Important for runtime limits: set `PRO_VERCEL=true` on Pro deployments, or `PRO_VERCEL=false` for Hobby limits.

2. Start development server.

```bash
npm run dev
```

1. Validate before deploy.

```bash
npm run lint
npm run build
```

## Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
npm run deploy:preview
npm run deploy:prod
```

## Full Setup And Deployment Guides

- From scratch guide (accounts, schema strategy, env vars, webhooks, OneSignal, cron, deploy, go-live checks):
  - [docs/setup-from-scratch.md](docs/setup-from-scratch.md)
- Service tiers and cost planning:
  - [docs/service-tiers.md](docs/service-tiers.md)

## Architecture Summary

```text
Inbound email (Mailgun)
  -> POST /api/email/inbound
  -> resolve user by assigned address
  -> process content with OpenRouter + user rules
  -> persist logs/memory in Supabase
  -> forward via SMTP/Mailgun
  -> push event via OneSignal
```

## Notes

- The project targets a Supabase-native architecture.
- If you are provisioning a brand new Supabase project, follow the schema/bootstrap guidance in [docs/setup-from-scratch.md](docs/setup-from-scratch.md).

## OpenCode Sandbox Agent (optional)

For very large HTML emails that exceed model context-window limits, Postino can offload processing to [OpenCode](https://opencode.ai) running inside a [Vercel Sandbox](https://vercel.com/docs/sandbox).

### 1. Prerequisites

| Requirement          | Notes                                |
| -------------------- | ------------------------------------ |
| `VERCEL_TOKEN`       | Vercel API token with sandbox access |
| `OPENROUTER_API_KEY` | Already required by Postino          |
| `@vercel/sandbox`    | Already in `package.json`            |

### 2. Create the sandbox snapshot

The snapshot pre-installs `opencode-ai` so each email run starts instantly.

```bash
npm run create:sandbox-snapshot
```

The script reads `VERCEL_OIDC_TOKEN` from `.env.local` (run `vercel env pull` to refresh if expired).

The script prints a snapshot ID (e.g. `snap_abc123`). Copy it.

### 3. Database migration

Add the column that stores sandbox session IDs for later recovery:

```sql
ALTER TABLE email_logs ADD COLUMN sandbox_session_id text;
```

### 4. Enable in Admin Settings

1. Go to **Admin → Settings → Agent Settings**.
2. Turn on **Use OpenCode (Sandbox)**.
3. Paste the snapshot ID into **Sandbox Snapshot ID**.
4. Save.

When enabled, every inbound email is processed inside a fresh sandbox session. The sandbox session ID is stored in `email_logs.sandbox_session_id` so results can be recovered later.
