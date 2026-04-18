# Service Tiers And Pricing Reference

This document summarizes external services used by Postino, with typical free-tier limits, paid tiers, and production recommendations.

Prices change frequently. Always verify current pricing on provider pages before purchasing.

## 1. Supabase (Auth + Postgres + Storage)

Provider: <https://supabase.com/pricing>

| Feature                  | Free                | Pro                     | Recommended                         |
| ------------------------ | ------------------- | ----------------------- | ----------------------------------- |
| Auth MAU                 | Limited included    | Higher limits           | Pro for production teams            |
| Postgres compute/storage | Small shared limits | Dedicated resources     | Pro                                 |
| Storage                  | Limited             | Larger quotas + overage | Pro if attachments/log volume grows |
| Branching/Team tooling   | Limited             | Available               | Pro                                 |

Postino notes:

- Core user, rules, email logs, memory and entities data are in Supabase.
- Production should use Pro to avoid free-tier suspension/rate limitations.
- Keep service-role key server-only.

## 2. OpenRouter (LLM)

Provider: <https://openrouter.ai/pricing>

No fixed free plan. Usage is token-based.

Typical model choices:

- `google/gemini-3-flash-preview` as the current default model.
- More advanced models increase quality and cost.

Postino notes:

- AI costs scale with inbound email volume and token settings.
- Use admin settings (`llmMaxTokens` and agent limits) to cap spend.

## 3. Mailgun (Inbound + Optional Outbound)

Provider: <https://www.mailgun.com/pricing/>

Typical tiers:

- Sandbox/trial for testing only.
- Paid plan required for real production domains.

Postino notes:

- Inbound route forwards to `/api/email/inbound`.
- Keep webhook signing key configured and verified.
- You can send outbound via Mailgun or SMTP fallback.

## 4. OneSignal (Web Push)

Provider: <https://onesignal.com/pricing>

Typical tiers:

- Free tier suitable for early testing.
- Paid tiers for larger audience/advanced features.

Postino notes:

- Client uses OneSignal Web SDK with `react-onesignal`.
- Backend sends transactional push via OneSignal REST API using `ONESIGNAL_API_KEY`.
- Configure external ID login (`OneSignal.login(userId)`) for user-targeted notifications.

## 5. Vercel (Hosting)

Provider: <https://vercel.com/pricing>

Typical tiers:

- Hobby for development/small projects.
- Pro for production workloads, higher limits, and better cron/runtime capacity.

Postino notes:

- Includes daily Vercel Cron in `vercel.json`.
- For high-frequency worker processing, use GitHub Actions scheduler every 5 minutes.

## 6. Supermemory (Optional Memory Augmentation)

Provider: <https://supermemory.ai>

Optional service. Used only if memory features are enabled.

Postino notes:

- Not required for core email processing.
- Configure `SUPERMEMORY_API_KEY` only if enabled in admin settings.

## 7. Google Maps Geocoding (Optional)

Provider: <https://developers.google.com/maps/documentation/geocoding>

Optional for better place resolution than free Nominatim fallback.

Postino notes:

- If `GOOGLE_MAPS_API_KEY` is set, Postino prefers Google geocoding.
- Without key, app falls back to Nominatim with conservative rate behavior.

## Recommended Production Baseline

1. Supabase Pro
2. Vercel Pro
3. Mailgun paid domain plan
4. OpenRouter with budget guardrails
5. OneSignal configured with production domain
6. Optional: Supermemory and Google Maps depending on usage
