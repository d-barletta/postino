# Service Tiers & Pricing Reference

This document summarises every external service Postino depends on, their free-tier limits, paid-tier prices, and recommended tier for production use.

> **Prices are indicative and may change.** Always verify current pricing on each provider's official website before committing to a plan.

---

## 1. Firebase (Auth + Firestore + Cloud Messaging)

**Provider:** Google Firebase — <https://firebase.google.com/pricing>

| Feature | Spark (Free) | Blaze (Pay-as-you-go) | Recommended for production |
|---|---|---|---|
| **Authentication** | Unlimited (email/password, Google, …) | Same as free | Spark is sufficient |
| **Firestore reads** | 50 000 / day | $0.06 per 100 000 | Blaze once reads exceed ~50 k/day |
| **Firestore writes** | 20 000 / day | $0.18 per 100 000 | Blaze once writes exceed ~20 k/day |
| **Firestore deletes** | 20 000 / day | $0.02 per 100 000 | Blaze |
| **Firestore storage** | 1 GB | $0.18 / GB / month | Blaze |
| **Cloud Messaging (FCM)** | Free (no hard limit) | Free | Spark is sufficient |
| **Firebase Storage** | 5 GB storage / 1 GB/day download | $0.026 / GB storage, $0.12 / GB download | Blaze if using attachment storage |

**Postino usage notes:**
- Every inbound email creates at least 1 write (emailLog) + several reads (user lookup, settings, rules).
- On a busy instance (e.g. 500 emails/day × 5 operations each) you can exceed the free Firestore quota quickly.
- Switch to **Blaze** before going to production. Blaze has no minimum monthly fee; you only pay for what you use beyond the free tier.
- Enable [Firestore budget alerts](https://cloud.google.com/billing/docs/how-to/budgets) to avoid surprise bills.

---

## 2. OpenRouter (LLM / AI)

**Provider:** OpenRouter — <https://openrouter.ai/pricing>

OpenRouter is a pay-per-token proxy to many LLM providers. There is no free tier; you buy credits and are charged per token.

| Model | Input (per 1 M tokens) | Output (per 1 M tokens) | Notes |
|---|---|---|---|
| `openai/gpt-4o-mini` *(default)* | $0.15 | $0.60 | Best cost/quality for email triage |
| `openai/gpt-4o` | $2.50 | $10.00 | Higher quality, ~17× more expensive |
| `openai/gpt-4.1-mini` | $0.40 | $1.60 | Good mid-range option |
| `anthropic/claude-3-haiku` | $0.25 | $1.25 | Fast & cheap; good for summaries |
| `anthropic/claude-3.5-sonnet` | $3.00 | $15.00 | Highest quality, most expensive |
| `google/gemini-flash-1.5` | $0.075 | $0.30 | Very cheap; good for high volumes |

**Postino usage notes:**
- The agent uses roughly 1 000–4 000 output tokens per email (depending on complexity and settings).
- At **gpt-4o-mini** and 500 emails/day with ~2 000 output tokens each: ~1 M tokens/day ≈ **$0.60/day** output cost.
- Monitor `totalTokensUsed` and `totalEstimatedCost` in the Admin Stats page to track spend.
- Set `agentAnalysisMaxTokens` and `llmMaxTokens` in admin settings to cap costs.

---

## 3. Mailgun (Inbound Email)

**Provider:** Mailgun — <https://www.mailgun.com/pricing/>

| Plan | Price | Emails/month | Inbound routes | Sending logs retention |
|---|---|---|---|---|
| **Trial / Sandbox** | Free | 100 sent, inbound unlimited* | Sandbox domain only | 1 day |
| **Foundation** | $35 / month | 50 000 sent | Custom domains | 30 days |
| **Scale** | $90 / month | 100 000 sent | Custom domains | 30 days |
| **Custom** | Contact sales | Unlimited | Custom domains | Configurable |

\* Mailgun's sandbox domain restricts inbound delivery to authorised recipients only and is not suitable for production.

**Postino usage notes:**
- For production you need at minimum the **Foundation** plan to use a real custom domain for inbound routing.
- The `forward()` route action used by Postino is included in all paid plans.
- Store `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`, and `MAILGUN_DOMAIN` in admin settings (or env vars).

---

## 4. Supermemory.ai (Agent Memory)

**Provider:** Supermemory — <https://supermemory.ai> / <https://console.supermemory.ai>

| Plan | Price | Memories | AI queries / month | Notes |
|---|---|---|---|---|
| **Hobby** | Free | 500 | 50 | Good for testing |
| **Pro** | ~$20 / month | 10 000 | 500 | Small production |
| **Team** | ~$50 / month | 50 000 | 2 000 | Multi-user |
| **Enterprise** | Contact sales | Unlimited | Unlimited | SLA + custom |

> Supermemory pricing is in active development — check <https://supermemory.ai/pricing> for current numbers.

**Postino usage notes:**
- Memory is optional (disabled by default). Enable it in Admin → Settings → Memory Settings.
- Each processed email that is summarised creates one memory write.
- At 500 emails/day the Hobby plan's 500-memory cap is exhausted in 1 day.
- For production use the **Pro** plan at minimum.
- Configure the API key in Admin Settings → Memory Settings or via the `SUPERMEMORY_API_KEY` env var.

---

## 5. Vercel (Hosting)

**Provider:** Vercel — <https://vercel.com/pricing>

| Plan | Price | Serverless executions | Execution time limit | Cron jobs | Bandwidth |
|---|---|---|---|---|---|
| **Hobby** | Free | 100 GB-hours / month | 10 s (default), 60 s max | Once per day only | 100 GB |
| **Pro** | $20 / month / seat | 1 000 GB-hours / month | 300 s max | Every minute | 1 TB |
| **Enterprise** | Contact sales | Custom | Custom | Custom | Custom |

**Postino usage notes:**
- The email-job processor (`/api/internal/email-jobs/process`) can be long-running if many jobs are queued. On Hobby the 60 s hard timeout may cause retries.
- The Hobby plan only supports **once-per-day** cron jobs. Use the **GitHub Actions scheduler** (`.github/workflows/process-email-jobs-cron.yml`) for higher-frequency processing (every 5 minutes) while on Hobby.
- For production with reliable processing, upgrade to **Pro** and use the built-in Vercel cron at the desired frequency.
- Bandwidth: 100 GB/month on Hobby is generous for most small deployments.

---

## 6. Geolocation — Nominatim / OpenStreetMap (Default Free)

**Provider:** Nominatim (OpenStreetMap) — <https://nominatim.org/release-docs/develop/api/Overview/>

| Tier | Price | Rate limit | Notes |
|---|---|---|---|
| **Public API** (nominatim.openstreetmap.org) | Free | **1 request/second** | Non-commercial use only; no SLA |
| **Self-hosted Nominatim** | Infrastructure cost only | Unlimited | Requires a powerful server to import OSM data |
| **Commercial Nominatim host** (e.g. MapTiler, Geoapify) | Varies ($0–$20+/month) | Varies | SLA-backed; suitable for production |

**Postino usage notes:**
- The default geocoder enforces the 1 req/s rate limit in code (`GEOCODE_MIN_INTERVAL_MS = 1100 ms`).
- Results are cached in Firestore (`placeGeocodes` collection) to reduce API calls.
- The public Nominatim API's usage policy forbids heavy commercial use. For production, switch to **Google Maps** (see below) or a self-hosted/commercial Nominatim alternative.

---

## 7. Geolocation — Google Maps Geocoding API (Optional, Production-Grade)

**Provider:** Google Cloud — <https://developers.google.com/maps/documentation/geocoding/usage-and-billing>

| Tier | Price | Free monthly credit |
|---|---|---|
| **Pay-as-you-go** | $5 per 1 000 requests | $200 credit/month (≈ 40 000 free requests) |
| **Beyond $200 credit** | $5 per 1 000 requests | — |

With the $200 monthly free credit Google Maps Geocoding is effectively **free for up to ~40 000 geocode requests/month**.

**How to enable in Postino:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Enable **Geocoding API**.
2. Create an API key and restrict it to the **Geocoding API** and your server IP/domain.
3. Add the key in one of two ways:
   - **Admin Settings** → Geolocation Settings → Google Maps API Key
   - **Environment variable**: `GOOGLE_MAPS_API_KEY=AIza...`
4. When a Google Maps API key is configured, Postino automatically uses the Google Maps Geocoding API instead of Nominatim. If the key is absent or the request fails, it falls back to Nominatim.

**Comparison: Google Maps vs Nominatim**

| | Nominatim (free default) | Google Maps Geocoding |
|---|---|---|
| Rate limit | 1 req/s | 50 req/s (default) |
| Accuracy | Good for cities/countries | Excellent, including street-level |
| SLA / uptime | Best-effort (community service) | 99.9% SLA |
| Cost | Free (non-commercial) | Free up to ~40 k req/month |
| Setup | None | API key required |

---

## Summary: Recommended Production Stack

| Service | Free tier suitable for dev? | Recommended production plan | Est. monthly cost |
|---|---|---|---|
| Firebase | ✅ Spark | Blaze (pay-as-you-go) | $5–30 (depends on volume) |
| OpenRouter | ✅ (buy small credits) | Pay-per-token (gpt-4o-mini) | $5–30 (500 emails/day) |
| Mailgun | ⚠️ Sandbox only | Foundation ($35/mo) | $35 |
| Supermemory | ⚠️ 500 memories cap | Pro (~$20/mo) | $20 |
| Vercel | ⚠️ 1 cron/day | Pro ($20/mo/seat) | $20 |
| Geolocation | ✅ Nominatim (low volume) | Google Maps API (free ≤40 k/mo) | $0–5 |
| **Total** | | | **~$80–110 / month** |

> For a minimal viable production deployment with moderate volume (up to ~500 emails/day), expect roughly **$80–110/month** in infrastructure costs.
