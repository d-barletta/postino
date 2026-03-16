# Postino ✉️

**AI-powered email redirector** — Get a private email address, write rules in plain English, and let AI process your incoming emails before forwarding them to your real inbox.

## Features

- 📬 **Personal email address** — Each user gets a unique `word-word-NNNN@your-domain.app` address
- 🤖 **AI processing** — Rules written in natural language, processed by GPT-4o-mini (or any OpenRouter model)
- 📝 **Rule management** — Create, edit, toggle, and delete rules via the dashboard
- 📊 **Email history** — Track every processed email with rule applied, token usage, and cost estimate
- 🔐 **Firebase auth** — Email/password sign-up with email verification
- 🛡️ **Admin panel** — User management, platform statistics, SMTP/LLM/Mailgun settings
- 💰 **Cost tracking** — Per-email token usage and estimated cost displayed in history

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Firebase** (Authentication + Firestore)
- **OpenRouter** (LLM API — any model)
- **Mailgun** (Inbound email webhooks)
- **Nodemailer** (Outbound SMTP)
- **Tailwind CSS**

---

## Prerequisites

- Node.js 18+
- Firebase project (free tier works)
- OpenRouter account with API key
- Mailgun account (free sandbox works)
- SMTP credentials for outbound email (Gmail app password, SendGrid, etc.)

---

## Deployment Guide

### 1. Clone and install

```bash
git clone https://github.com/your-org/postino.git
cd postino
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a project
2. Enable **Authentication** → Email/Password sign-in method
3. Enable **Firestore Database** → Start in production mode
4. Create Firestore indexes (needed for queries):
   - Collection: `rules` → Fields: `userId ASC`, `createdAt DESC`
   - Collection: `emailLogs` → Fields: `userId ASC`, `receivedAt DESC`
5. Get your **Web App config**: Project Settings → Add App → Web
6. Get your **Admin SDK credentials**: Project Settings → Service Accounts → Generate new private key

### 3. Mailgun Setup

1. Sign up at [mailgun.com](https://mailgun.com)
2. The free sandbox domain works for testing (e.g., `sandbox123.mailgun.org`)
3. For production, add and verify your own domain
4. Go to **Sending → Domains** and note your domain name
5. Go to **Settings → API Keys** and copy your Private API Key
6. Configure an **Inbound Route**:
   - Go to **Receiving → Create Route**
   - Expression: `match_recipient(".*@your-domain.com")`
   - Action: Forward to `https://your-app.vercel.app/api/email/inbound`
   - Priority: 10

### 4. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `FIREBASE_PROJECT_ID` | Same as project ID (server-side) |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key (with `\n` escaped) |
| `OPENROUTER_API_KEY` | OpenRouter API key (`sk-or-...`) |
| `LLM_MODEL` | Model to use, e.g. `openai/gpt-4o-mini` |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password |
| `SMTP_FROM` | From address, e.g. `Postino <noreply@postino.app>` |
| `MAILGUN_API_KEY` | Mailgun private API key |
| `NEXT_PUBLIC_APP_URL` | Your deployed app URL |

### 5. Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

Or connect your GitHub repo in the [Vercel dashboard](https://vercel.com) and it will deploy automatically on push.

Add all environment variables in Vercel → Project Settings → Environment Variables.

### 6. Set Up First Admin User

1. Register an account at `/register`
2. Verify your email
3. Go to Firebase Console → Firestore → `users` collection
4. Find your user document (by UID or email)
5. Add/set the field `isAdmin` to `true`
6. Reload the app — the Admin link will appear in the nav

### 7. Configure Platform Settings (as admin)

Go to `/admin/settings` to configure:
- **OpenRouter API Key** and **LLM Model**
- **Email Domain** for user addresses
- **SMTP settings** for outbound mail
- **Mailgun settings** for inbound webhook verification

Settings saved in the admin panel override environment variables.

---

## Upgrading from Sandbox to Production Domain

The free Mailgun sandbox restricts who can receive emails. To use a real domain:

1. Add your domain in Mailgun → Sending → Add Domain
2. Add the DNS records Mailgun provides (MX, TXT, CNAME)
3. Wait for DNS propagation
4. Update **Email Domain** in Admin Settings to your new domain
5. Update the Mailgun Inbound Route to `match_recipient(".*@your-new-domain.com")`
6. New users will automatically get addresses on the new domain

---

## Local Development

```bash
cp .env.local.example .env.local
# Fill in .env.local with your credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
User sends email → Mailgun receives it
    → POST /api/email/inbound (Mailgun webhook)
    → Look up user by assigned email
    → Load user's active rules
    → Send to OpenRouter LLM with rules
    → LLM returns processed email (JSON)
    → Send processed email via SMTP to user's real email
    → Log to Firestore emailLogs collection
```

## Firestore Collections

| Collection | Description |
|-----------|-------------|
| `users` | User profiles with `assignedEmail`, `isAdmin`, `isActive` |
| `rules` | User-defined processing rules |
| `emailLogs` | Record of every email processed |
| `settings` | Single `global` document with platform config |
