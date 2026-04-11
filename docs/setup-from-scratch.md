# 📬 Postino - Setup From Scratch

This guide is for setting up Postino from zero, including accounts, environment variables, local run, and production deployment.

## 1. Required Accounts

Create these accounts first:

1. GitHub
2. Vercel
3. Supabase
4. Mailgun
5. OpenRouter
6. OneSignal
7. SMTP provider (if not using Mailgun sending)
8. Optional: Supermemory

## 2. Clone And Install

```bash
git clone <your-repo-url>
cd postino
npm install
```

## 3. Create A Supabase Project

1. Create a new Supabase project.
1. Save these values from Project Settings:

- Project URL
- Publishable key
- Service role key

1. Keep service role key server-only.
1. In `Authentication -> URL Configuration`, set:

- Site URL: your real production origin, for example `https://postino.pro`
- Do not leave Site URL on `http://localhost:3000` in production
- Redirect URLs:
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/auth/confirm?type=recovery&next=/reset-password`
  - `https://<your-domain>/auth/confirm`
  - `https://<your-domain>/auth/confirm?type=recovery&next=/reset-password`
  - Optional Vercel previews: `https://*-<team-or-account-slug>.vercel.app/auth/confirm**`

1. The default Supabase email templates work with Postino.

The default confirmation flow sends users through Supabase's `/auth/v1/verify` endpoint and then back to `/auth/confirm` in your app. No template customization is required for this to work.

1. If you customize Supabase auth email templates, make sure they do not hardcode `localhost` and do not rely on `{{ .SiteURL }}` for Postino auth actions.

Use Postino-compatible links instead:

```html
<!-- Confirm signup -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>

<!-- Reset password -->
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}">Reset password</a>
```

1. The app sends `{{ .RedirectTo }}` as the full callback target:

- Signup confirmation: `https://<your-domain>/auth/confirm`
- Password recovery: `https://<your-domain>/auth/confirm?type=recovery&next=/reset-password`

Whether you use the default Supabase templates or custom ones, the Site URL and Redirect URLs above still must be correct.

## 4. Database Schema Setup

Postino expects existing tables in Supabase (`users`, `rules`, `email_logs`, `email_jobs`, `settings`, `user_memory`, `place_geocodes`, blog and entities tables).

Use one of these strategies:

1. Recommended: copy schema from your existing Postino Supabase project into a new project before first run.
2. Alternative: if your team has SQL migrations outside this repo, apply them now.

Important:

- The app will not function correctly without the full schema.
- Verify at least these tables exist in `public`: `users`, `rules`, `email_logs`, `email_jobs`, `settings`, `user_memory`, `place_geocodes`.

## 5. Configure OneSignal (Web Push)

1. Create a OneSignal app for Web Push.
2. Add your domains:

- Local: `http://localhost:3000` (for local testing)
- Production: `https://<your-domain>`

1. Collect:

- OneSignal App ID
- OneSignal REST API Key

1. Keep `public/OneSignalSDKWorker.js` reachable at:

- `https://<your-domain>/OneSignalSDKWorker.js`

## 6. Configure Mailgun (Inbound)

1. Set up domain or sandbox.
2. Create inbound route that forwards to:

- `https://<your-domain>/api/email/inbound`

1. Collect:

- Mailgun API key
- Mailgun webhook signing key
- Mailgun domain/sandbox domain
- Mailgun base URL (usually `https://api.mailgun.net`)

## 7. Configure OpenRouter

1. Create an API key.
2. Choose a model (default recommended: `openai/gpt-4o-mini`).
3. Collect:

- `OPEN_ROUTER_API_KEY`
- `LLM_MODEL`

## 8. Configure SMTP (Fallback / Outbound)

If outbound email is sent via SMTP, collect:

- SMTP host
- SMTP port
- SMTP username
- SMTP password
- From address

## 9. Environment Variables

Create `.env.local` from example:

```bash
cp .env.local.example .env.local
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_ONESIGNAL_APP_ID`
- `ONESIGNAL_API_KEY`
- `OPEN_ROUTER_API_KEY`
- `LLM_MODEL`
- `MAILGUN_WEBHOOK_SIGNING_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`
- `EMAIL_JOBS_WORKER_SECRET`

Commonly required in production:

- `MAILGUN_API_KEY`
- `MAILGUN_SANDBOX_EMAIL` (or real domain)
- `MAILGUN_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Optional:

- `ONESIGNAL_APP_ID` (server fallback; if omitted, code uses `NEXT_PUBLIC_ONESIGNAL_APP_ID`)
- `SUPERMEMORY_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `POSTINO_WORKER_URL` (mainly for GitHub Actions scheduler)

## 10. Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

Validation commands:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 11. Deploy To Vercel

### Option A: Git-based (recommended)

1. Import repo in Vercel.
2. Set all environment variables for Preview and Production.
3. Set production branch (typically `main`).
4. Deploy.

### Option B: CLI

```bash
npm install -g vercel
vercel login
vercel link
npm run deploy:preview
npm run deploy:prod
```

## 12. Scheduler Setup

The app includes:

- Vercel Cron in `vercel.json` (daily)
- GitHub Actions workflow `.github/workflows/process-email-jobs-cron.yml` (every 5 minutes)

For frequent processing on Vercel Hobby, use GitHub Actions:

1. Add GitHub Action secrets:

- `POSTINO_WORKER_URL` = `https://<your-domain>/api/internal/email-jobs/process`
- `EMAIL_JOBS_WORKER_SECRET` = same value as env `EMAIL_JOBS_WORKER_SECRET`

1. Ensure worker route is reachable.

## 13. First Admin Bootstrap

1. Register a first user in the app.
2. In Supabase table `users`, set for that user:

- `is_admin = true`
- `is_active = true`
- `suspended = false`

## 14. Post-Deploy Verification Checklist

1. Login works.
2. Admin pages load.
3. Inbound webhook receives Mailgun requests (2xx).
4. Email jobs are created and processed.
5. Forwarded email arrives in destination inbox.
6. OneSignal prompt appears and subscriptions are visible in OneSignal dashboard.
7. Trigger test push from OneSignal dashboard to the same user.
8. Blog pages and sitemap build successfully.

## 15. Security Checklist

1. Never commit real `.env.local`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
3. Rotate compromised keys immediately.
4. Use separate keys for preview and production.
5. Restrict Mailgun webhook to signed requests only.
6. Restrict OneSignal REST API key to backend usage only.

## 16. Troubleshooting

### Build passes locally but fails on Vercel

- Check missing env vars in Vercel Project Settings.
- Confirm Preview and Production both have all required vars.

### Push notifications do not arrive

- Verify OneSignal domain config.
- Verify `NEXT_PUBLIC_ONESIGNAL_APP_ID` and `ONESIGNAL_API_KEY`.
- Verify `public/OneSignalSDKWorker.js` is served publicly.

### Inbound emails not processed

- Verify Mailgun route forwards to `/api/email/inbound`.
- Verify `MAILGUN_WEBHOOK_SIGNING_KEY` matches Mailgun.
- Check Vercel function logs.

### Jobs stuck in queue

- Verify cron/scheduler is active.
- Verify `CRON_SECRET` and `EMAIL_JOBS_WORKER_SECRET`.
- Trigger worker endpoint manually for testing.
