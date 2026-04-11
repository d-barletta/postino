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
