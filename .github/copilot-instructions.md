# Copilot Instructions for Postino

## Scope

These instructions apply to the whole repository.

## First Steps on Any Task

1. Read [README.md](../README.md) for setup and product context.
2. Check scripts in [package.json](../package.json) before running commands.
3. Prefer existing patterns in [src/app](../src/app), [src/components](../src/components), and [src/lib](../src/lib) over inventing new ones.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Start production server: `npm start`

## Architecture Map

- App Router pages/layouts: [src/app](../src/app)
- API routes: [src/app/api](../src/app/api)
- Shared UI primitives/components: [src/components/ui](../src/components/ui)
- Feature components:
  - Auth: [src/components/auth](../src/components/auth)
  - Dashboard: [src/components/dashboard](../src/components/dashboard)
  - Admin: [src/components/admin](../src/components/admin)
- Core domain logic:
  - Agent orchestration: [src/lib/agent.ts](../src/lib/agent.ts)
  - Database helpers: [src/lib/database.ts](../src/lib/database.ts)
  - Auth helpers: [src/lib/auth.ts](../src/lib/auth.ts)
  - Supabase admin setup: [src/lib/supabase/admin.ts](../src/lib/supabase/admin.ts)
  - OpenRouter integration: [src/lib/openrouter.ts](../src/lib/openrouter.ts)
  - Email and webhook helpers: [src/lib/email.ts](../src/lib/email.ts)
- Shared types: [src/types/index.ts](../src/types/index.ts)

## Conventions

- TypeScript strict mode is enabled; prefer explicit types and avoid `any`.
- Use App Router conventions and keep server/client boundaries clear.
- Add `'use client'` only where required for interactive components/hooks.
- Reuse existing UI primitives in [src/components/ui](../src/components/ui).
- For new UI components, use Shadcn components/docs as the default and first-choice source:
  - https://ui.shadcn.com/docs/components
- Compose Tailwind classes with `cn()` from [src/lib/utils.ts](../src/lib/utils.ts).
- Keep API route responses consistent with existing `NextResponse.json` success/error shapes.
- Keep naming consistent with current code:
  - Components: PascalCase
  - Hooks: `use*`
  - Functions/variables: camelCase

## Auth, Security, and Data Rules

- For protected API routes, verify Supabase Bearer tokens on the server.
- For admin routes, enforce admin checks (follow existing admin route patterns in [src/app/api/admin](../src/app/api/admin)).
- Do not trust client-provided role/identity data.
- Preserve email safety behavior already in place (header sanitization and HTML escaping in email pipeline code).
- Keep timestamp handling consistent with existing helpers and route code.

## Known Pitfalls

- Runtime config may come from `settings.data` in Supabase and environment variables; preserve fallback behavior used in the email/admin pipeline.
- Registration/user bootstrap is server-assisted: avoid direct client writes to `users` during register flow; keep bootstrap logic aligned with [src/app/api/auth/me/route.ts](../src/app/api/auth/me/route.ts).
- Do not import server-only modules into client components.
- Respect Next server external package config in [next.config.ts](../next.config.ts).
- Verify env vars against [.env.local.example](../.env.local.example) before debugging runtime failures.
- Assigned email domain may fall back to Mailgun sandbox env values; preserve this fallback behavior in email/domain logic.
- Mailgun inbound signature verification must use webhook signing key (not API key).

## Change Guidelines

- Prefer small, focused edits that match nearby code style.
- Link to existing docs/files instead of duplicating long explanations.
- When touching API contracts or shared types, update all impacted call sites.
- Run lint after non-trivial changes: `npm run lint`.

## Where to Look First

- Product/setup overview: [README.md](../README.md)
- Global styles/theme tokens: [src/app/globals.css](../src/app/globals.css)
- Dashboard entry: [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx)
- Admin entry: [src/app/admin/page.tsx](../src/app/admin/page.tsx)
- Inbound email webhook: [src/app/api/email/inbound/route.ts](../src/app/api/email/inbound/route.ts)
