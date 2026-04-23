/**
 * System-assigned sentinel values stored in `email_logs.rule_applied` and
 * `email_logs.error_message` by the inbound processing pipeline.
 *
 * These strings are stable — existing database records rely on them.
 * Do NOT change them without a migration.
 *
 * For display in the UI, map these constants to i18n keys instead of
 * showing the raw English string.
 */

// ---------------------------------------------------------------------------
// rule_applied sentinels
// ---------------------------------------------------------------------------

/** Set on `rule_applied` when an email is forwarded unmodified because the
 *  user's monthly AI credits are exhausted. */
export const SYSTEM_RULE_AI_SKIPPED_CREDITS = 'AI skipped (credits exhausted)';

// ---------------------------------------------------------------------------
// error_message sentinels
// ---------------------------------------------------------------------------

/** Set on `error_message` when a skipped email is in analysis-only mode and
 *  monthly credits are exhausted. */
export const SYSTEM_MSG_AI_SKIPPED_ANALYSIS_ONLY =
  'Skipped because monthly credits are exhausted (analysis-only mode)';

/** Set on `error_message` when an email is forwarded without AI because
 *  monthly credits are exhausted. */
export const SYSTEM_MSG_AI_SKIPPED_FORWARDED =
  'Monthly credits exhausted; email forwarded without AI processing';

/** Set on `error_message` when email forwarding is blocked because the user's
 *  Postino address is disabled. */
export const SYSTEM_MSG_FORWARDING_DISABLED =
  'Forwarding is disabled because your Postino address is turned off';
