'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  isOneSignalOptedIn,
} from '@/lib/push-notifications';

export function PushNotificationButton() {
  const { authUser } = useAuth();
  const { t } = useI18n();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Initialise on mount (client-only checks).
  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (ok) {
      const perm = getNotificationPermission();
      setPermission(perm);
      setSubscribed(isOneSignalOptedIn());
    }
  }, []);

  const handleEnable = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const success = await subscribeToPushNotifications(authUser.id);
      if (success) {
        setPermission('granted');
        setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  const handleDisable = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setSubscribed(false);
    try {
      const success = await unsubscribeFromPushNotifications();
      if (!success) {
        setSubscribed(true);
      }
    } catch {
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  if (!supported) return null;

  const denied = permission === 'denied';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t.dashboard.pushNotifications.title}
          </h2>
          <div className="flex items-center gap-2">
            <Switch
              checked={subscribed}
              onCheckedChange={(checked) => (checked ? handleEnable() : handleDisable())}
              disabled={loading || denied}
              aria-label={t.dashboard.pushNotifications.title}
            />
            <Badge variant={subscribed ? 'success' : 'default'}>
              {subscribed ? t.dashboard.address.active : t.dashboard.address.disabled}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {denied ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t.dashboard.pushNotifications.blockedDescription}
          </p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {subscribed
              ? t.dashboard.pushNotifications.enabledDescription
              : t.dashboard.pushNotifications.disabledDescription}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
