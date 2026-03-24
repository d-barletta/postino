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

- <https://ui.shadcn.com/docs/components>

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

## Full Deployment Guide (Step by Step)

This section is designed to let you deploy the app from zero with no missing steps.

### 1) Create Required Accounts

- GitHub account (to host the repository)
- Vercel account (to host the Next.js app)
- Firebase account/project (Auth + Firestore)
- OpenRouter account (LLM API)
- Mailgun account/domain (inbound webhook)
- SMTP provider account (outbound email)

### 2) Create Cloud Resources

#### Firebase

1. Create a Firebase project.
2. Enable Authentication.
3. Enable at least one sign-in method you want to use (for example Google and/or Email/Password).
4. Enable Firestore database in production mode.
5. In Firebase console, generate a Web App config and collect:

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID

1. Create a Firebase Admin service account key and collect:

- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY

1. Enable Cloud Messaging and generate a VAPID key pair for web push:

- Go to Firebase Console → Project Settings → Cloud Messaging → Web configuration.
- Click **Generate key pair** (or use an existing pair).
- Copy the **Key pair** value — this is your `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

#### OpenRouter

1. Create an API key in OpenRouter.
2. Collect:

- OPEN_ROUTER_API_KEY
- LLM_MODEL (example: openai/gpt-4o-mini)

#### Mailgun

1. Configure a Mailgun domain or sandbox domain.
2. Collect:

- MAILGUN_API_KEY
- MAILGUN_WEBHOOK_SIGNING_KEY
- MAILGUN_SANDBOX_EMAIL (or your configured domain)
- MAILGUN_BASE_URL (usually <https://api.mailgun.net>)

#### SMTP

1. Configure SMTP account for outbound forwarding.
2. Collect:

- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

### 3) Prepare the Repository

1. Fork or clone the repository.
2. Install dependencies:

```bash
npm install
```

1. Optionally run local checks:

```bash
npm run lint
npm run build
```

### 4) Create Vercel Project

1. In Vercel, click Add New Project.
2. Import your GitHub repository.
3. Keep framework preset as Next.js.
4. Set Production Branch (usually main).

### 5) Configure Vercel Environment Variables

Set all required variables in Vercel Project Settings -> Environment Variables.

Core app variables:

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- NEXT_PUBLIC_FIREBASE_VAPID_KEY (web push VAPID key — see Firebase setup step 7)
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- OPEN_ROUTER_API_KEY
- LLM_MODEL
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASS
- SMTP_FROM
- MAILGUN_API_KEY
- MAILGUN_WEBHOOK_SIGNING_KEY
- MAILGUN_SANDBOX_EMAIL
- MAILGUN_BASE_URL
- NEXT_PUBLIC_APP_URL (must be your Vercel production URL)

Job worker and cron variables:

- CRON_SECRET
- EMAIL_JOBS_WORKER_SECRET

### 6) Configure Mailgun Inbound Webhook

Suggested Mailgun route action: `forward()` to this webhook URL (free tier friendly).

Set Mailgun route/webhook target to:

- https://YOUR_VERCEL_DOMAIN/api/email/inbound

Notes:

- Recommended for this project: **Forward** (Mailgun route action) to keep inbound routing on the free option.
- Use `forward("https://YOUR_VERCEL_DOMAIN/api/email/inbound")` for the route action.

Then verify:

1. MAILGUN_WEBHOOK_SIGNING_KEY in Vercel matches Mailgun webhook signing key.
2. Webhook events reach the endpoint successfully.

### 7) Configure Job Processing Scheduler

This project supports two schedulers:

1. Vercel Cron (already configured in vercel.json)
2. GitHub Actions scheduler (recommended for high frequency on Hobby plan)

#### Vercel Hobby limitation

- Hobby allows cron jobs only once per day.
- This repository uses a daily Vercel cron schedule for compatibility.

#### GitHub Actions scheduler setup (every 5 minutes)

1. Go to GitHub repository -> Settings -> Secrets and variables -> Actions.
2. Add secret POSTINO_WORKER_URL with value:

- https://YOUR_VERCEL_DOMAIN/api/internal/email-jobs/process

1. Add secret EMAIL_JOBS_WORKER_SECRET with the same value used in Vercel env EMAIL_JOBS_WORKER_SECRET.
2. Workflow file is already included at .github/workflows/process-email-jobs-cron.yml.

Important:

- POSTINO_WORKER_URL belongs to GitHub Actions secrets, not Vercel environment variables.

### 8) Create First Admin User

After first deploy:

1. Register/login once in the app.
2. Open Firestore users collection.
3. Set your user document field isAdmin = true.
4. Ensure account isActive = true and suspended = false.

### 9) Deploy to Production

1. Push your branch to GitHub.
2. Trigger deployment from Vercel (or auto-deploy from main).
3. Wait for successful build.

### 10) Post-Deploy Verification Checklist

1. Can open app URL and login.
2. Admin page is accessible for admin user.
3. Admin Jobs tab shows queue data.
4. Send test email to assigned address.
5. Confirm emailLogs entries are created.
6. Confirm jobs move from pending/retrying to done.
7. Confirm forwarded email arrives in destination mailbox.
8. Confirm Mailgun webhook requests are accepted (2xx).

### 11) Security and Operations Notes

1. Never commit .env.local with real secrets.
2. Rotate any secret immediately if exposed.
3. Keep production and preview secrets separated in Vercel.
4. Restrict Firebase service account key access.
5. Monitor failed jobs from the Admin Jobs tab and logs.

## Local Development

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open <http://localhost:3000>

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
