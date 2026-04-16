import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

export const DEFAULT_CREDITS_PER_DOLLAR_FACTOR = 100;
export const DEFAULT_FREE_CREDITS_PER_MONTH = 1000;

export interface CreditSettings {
  creditsPerDollarFactor: number;
  freeCreditsPerMonth: number;
}

export interface UserCreditsSnapshot {
  month: string;
  used: number;
  bonus: number;
  thresholdNotified: boolean;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function resolveCreditSettings(source?: Record<string, unknown> | null): CreditSettings {
  return {
    creditsPerDollarFactor: toPositiveNumber(
      source?.creditsPerDollarFactor,
      DEFAULT_CREDITS_PER_DOLLAR_FACTOR,
    ),
    freeCreditsPerMonth: toNonNegativeNumber(
      source?.freeCreditsPerMonth,
      DEFAULT_FREE_CREDITS_PER_MONTH,
    ),
  };
}

export function getUtcMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function dollarsToCredits(usd: number, factor: number): number {
  const safeUsd = Number.isFinite(usd) ? Math.max(0, usd) : 0;
  return Number((safeUsd * factor).toFixed(6));
}

export function computeMonthlyCreditsLimit(freeCreditsPerMonth: number, bonus: number): number {
  return Math.max(0, freeCreditsPerMonth) + Math.max(0, bonus);
}

export function normalizeUserCreditsSnapshot(
  row:
    | {
        credits_usage_month?: string | null;
        monthly_credits_used?: number | null;
        monthly_credits_bonus?: number | null;
        credits_threshold_notified?: boolean | null;
      }
    | null
    | undefined,
  currentMonth: string,
): UserCreditsSnapshot {
  const sameMonth = row?.credits_usage_month === currentMonth;
  return {
    month: currentMonth,
    used: sameMonth ? Math.max(0, row?.monthly_credits_used ?? 0) : 0,
    bonus: sameMonth ? Math.max(0, row?.monthly_credits_bonus ?? 0) : 0,
    thresholdNotified: sameMonth ? row?.credits_threshold_notified === true : false,
  };
}

async function sendCreditsThresholdPushNotification(
  userId: string,
  usagePercent: number,
): Promise<void> {
  try {
    const oneSignalAppId = process.env.ONESIGNAL_APP_ID ?? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    if (!oneSignalAppId || !oneSignalApiKey) return;

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const relativePath = '/dashboard';
    const absolutePath = appUrl ? `${appUrl}${relativePath}` : undefined;

    await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${oneSignalApiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        target_channel: 'push',
        include_aliases: { external_id: [userId] },
        headings: { en: 'Postino credits warning' },
        contents: {
          en: `You have used ${usagePercent}% of your monthly credits.`,
        },
        web_url: absolutePath,
        data: {
          type: 'credits-threshold',
          usagePercent,
        },
      }),
    });
  } catch (error) {
    console.error('[credits] Failed to send threshold push notification:', error);
  }
}

async function sendCreditsThresholdEmail(userEmail: string, usagePercent: number): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const dashboardUrl = appUrl ? `${appUrl}/dashboard` : 'https://postino.pro/dashboard';
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settings')
    .select('data')
    .eq('id', 'global')
    .single();
  const settings = (settingsRow?.data as Record<string, unknown> | null) ?? null;
  const smtpFromEmail =
    typeof settings?.smtpFromEmail === 'string' ? settings.smtpFromEmail.trim() : '';
  const smtpFrom = typeof settings?.smtpFrom === 'string' ? settings.smtpFrom.trim() : '';
  const smtpFromMatch = smtpFrom.match(/<([^>]+)>/);
  const fallbackDomain =
    (typeof settings?.mailgunSandboxEmail === 'string' ? settings.mailgunSandboxEmail : '') ||
    (typeof settings?.mailgunDomain === 'string' ? settings.mailgunDomain : '') ||
    process.env.MAILGUN_SANDBOX_EMAIL ||
    '';
  const senderEmail = smtpFromEmail || smtpFromMatch?.[1] || `noreply@${fallbackDomain || 'postino.pro'}`;
  const fromAddress = `📬 Postino <${senderEmail}>`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Postino monthly credits warning</title>
  </head>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background-color:#f8f9fa;">
    <div style="max-width:500px;margin:0 auto;padding:24px 12px;box-sizing:border-box;">
      <div style="text-align:center;margin-bottom:40px;">
        <svg viewBox="-6.4 -6.4 140.8 140.8" width="64" height="64" style="max-width:100%;height:auto;background-color:#ffffff;border-radius:9999px;padding:8px;box-sizing:border-box;">
          <path d="M114,106.5H29V36.8h70c13.8,0,25,11.2,25,25v34.7C124,102,119.5,106.5,114,106.5z" fill="#efd957" />
          <path d="M99,36.8H29v10h70c13.8,0,25,11.2,25,25v-10C124,48,112.8,36.8,99,36.8z" fill="#E7E7E7" />
          <path d="M44,106.5H14c-5.5,0-10-4.5-10-10v-35c0-13.8,11.2-25,25-25h0c13.8,0,25,11.2,25,25v35C54,102,49.5,106.5,44,106.5z" fill="#E7E7E7" />
          <polygon fill="#efd957" points="71.5,71.5 71.5,21.5 99.7,21.5 99.7,36.5 79.7,36.5 79.7,71.5" />
          <path d="M14,108h30c6.3,0,11.5-5.2,11.5-11.5v-35c0-10.2-5.8-19.1-14.3-23.5h23.4c0.8,0,1.5-0.7,1.5-1.5S65.5,35,64.7,35H29C14.4,35,2.5,46.9,2.5,61.5v35C2.5,102.8,7.7,108,14,108z M5.5,61.5C5.5,48.5,16,38,29,38s23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H14c-4.7,0-8.5-3.8-8.5-8.5V61.5z" fill="#494949" />
          <path d="M14,63h30c0.8,0,1.5-0.7,1.5-1.5S44.8,60,44,60H14c-0.8,0-1.5,0.7-1.5,1.5S13.2,63,14,63z" fill="#494949" />
          <path d="M101.2,21.5c0-0.8-0.7-1.5-1.5-1.5H71.5c-0.8,0-1.5,0.7-1.5,1.5v45.9c0,3.1,2.5,5.6,5.6,5.6s5.6-2.5,5.6-5.6V38H99c13,0,23.5,10.5,23.5,23.5v35c0,4.7-3.8,8.5-8.5,8.5H59c-0.8,0-1.5,0.7-1.5,1.5s0.7,1.5,1.5,1.5h55c6.3,0,11.5-5.2,11.5-11.5v-35c0-13.9-10.7-25.3-24.3-26.4V21.5z M79.7,35c-0.8,0-1.5,0.7-1.5,1.5v30.9c0,1.4-1.2,2.6-2.6,2.6S73,68.8,73,67.4V23h25.2v12H79.7z" fill="#494949" />
        </svg>
      </div>
      <div style="background:white;border-radius:8px;padding:25px 18px;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;">
        <h1 style="margin:0 0 20px 0;font-size:28px;font-weight:600;color:#171717;">Monthly credits warning</h1>
        <p style="margin:0 0 16px 0;font-size:16px;color:#6b7280;line-height:1.5;">
          You have used <strong>${usagePercent}%</strong> of your monthly Postino credits.
        </p>
        <p style="margin:0 0 28px 0;font-size:16px;color:#6b7280;line-height:1.5;">
          Open your dashboard to review your usage.
        </p>
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 32px;background-color:#efd957;color:#171717;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Open dashboard</a>
      </div>
      <div style="text-align:center;margin-top:30px;font-size:12px;color:#9ca3af;">
        <p style="margin:0">© 2026 Postino. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
  const text = `You have used ${usagePercent}% of your monthly Postino credits.\nOpen your dashboard to review your usage: ${dashboardUrl}`;

  try {
    await sendEmail({
      to: userEmail,
      from: fromAddress,
      subject: 'Postino monthly credits warning',
      html,
      text,
    });
  } catch (error) {
    console.error('[credits] Failed to send threshold email:', error);
  }
}

export async function addUserCreditsUsage(params: {
  userId: string;
  userEmail: string;
  estimatedCostUsd: number;
  settingsData?: Record<string, unknown> | null;
}): Promise<void> {
  const { userId, userEmail, estimatedCostUsd, settingsData } = params;
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0) return;

  const supabase = createAdminClient();
  const nowMonth = getUtcMonthKey();
  const credits = resolveCreditSettings(settingsData);

  const { data: userRow } = await supabase
    .from('users')
    .select(
      'credits_usage_month, monthly_credits_used, monthly_credits_bonus, credits_threshold_notified',
    )
    .eq('id', userId)
    .single();

  const snapshot = normalizeUserCreditsSnapshot(userRow, nowMonth);
  const addedCredits = dollarsToCredits(estimatedCostUsd, credits.creditsPerDollarFactor);
  const monthlyUsed = Number((snapshot.used + addedCredits).toFixed(6));
  const monthlyLimit = computeMonthlyCreditsLimit(credits.freeCreditsPerMonth, snapshot.bonus);
  const usagePercent = monthlyLimit > 0 ? Math.round((monthlyUsed / monthlyLimit) * 100) : 100;
  const shouldNotify = usagePercent >= 90 && !snapshot.thresholdNotified;

  await supabase
    .from('users')
    .update({
      credits_usage_month: nowMonth,
      monthly_credits_used: monthlyUsed,
      monthly_credits_bonus: snapshot.bonus,
      credits_threshold_notified: shouldNotify ? true : snapshot.thresholdNotified,
    })
    .eq('id', userId);

  if (!shouldNotify) return;

  await Promise.all([
    sendCreditsThresholdEmail(userEmail, usagePercent),
    sendCreditsThresholdPushNotification(userId, usagePercent),
  ]);
}
