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
  try {
    await sendEmail({
      to: userEmail,
      subject: 'Postino monthly credits warning',
      html: `<p>You have used <strong>${usagePercent}%</strong> of your monthly Postino credits.</p><p>Open your dashboard to review your usage.</p>`,
      text: `You have used ${usagePercent}% of your monthly Postino credits. Open your dashboard to review your usage.`,
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
