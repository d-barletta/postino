# Postino

AI-powered email redirector: users get a private email address, define rules in natural language, and incoming emails are processed before being forwarded to their real inbox.

## Current Setup

- Framework: Next.js 16 (App Router) + React 19 + TypeScript
- Styling: Tailwind CSS 4 + Radix UI primitives + shadcn/ui-style components
- Auth & DB: Firebase Auth + Firestore
- AI: OpenRouter (via Vercel AI SDK `ai`)
- Email pipeline:
  - Inbound: Mailgun webhook (`/api/email/inbound`)
  - Processing: LLM + user rules
  - Outbound: SMTP via Nodemailer
- Charts/Admin analytics: Recharts

## UI Components (Use With Priority)

For any new UI work, use components from these docs as the default and first choice:

- https://ui.shadcn.com/docs/components

## Main Libraries

### Core

- `next`, `react`, `react-dom`, `typescript`

### AI

- `ai`
- `@ai-sdk/openai`
- `openai`
- `zod`
- `jsonrepair`

### Firebase / Backend

- `firebase`
- `firebase-admin`
- `nodemailer`
- `cheerio`
- `crypto-js`

### UI / Design System

- `@radix-ui/react-accordion`
- `@radix-ui/react-dialog`
- `@radix-ui/react-label`
- `@radix-ui/react-popover`
- `@radix-ui/react-select`
- `@radix-ui/react-separator`
- `@radix-ui/react-slot`
- `@radix-ui/react-switch`
- `@radix-ui/react-tabs`
- `class-variance-authority`
- `clsx`
- `cmdk`
- `lucide-react`
- `vaul`
- `tailwind-merge`
- `bootstrap-icons`

### Data Viz

- `recharts`

## Prerequisites

- Node.js 18+
- Firebase project
- OpenRouter API key
- Mailgun account/domain for inbound email
- SMTP credentials for outbound email

## Local Development

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

## Environment Variables

Required at minimum:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `OPEN_ROUTER_API_KEY`
- `LLM_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `MAILGUN_API_KEY`
- `MAILGUN_WEBHOOK_SIGNING_KEY`
- `NEXT_PUBLIC_APP_URL`

## Architecture

```text
Incoming email (Mailgun)
  -> POST /api/email/inbound
  -> user lookup by assigned address
  -> apply active rules via LLM
  -> send processed output via SMTP
  -> store logs/stats in Firestore
```

## Firestore Collections

- `users`
- `rules`
- `emailLogs`
- `settings` (global platform configuration)
