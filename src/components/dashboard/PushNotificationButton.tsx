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
  setupForegroundMessageHandler,
} from '@/lib/push-notifications';

export function PushNotificationButton() {
  const { firebaseUser } = useAuth();
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
      setSubscribed(perm === 'granted');
    }
  }, []);

  // When subscribed, keep a foreground message handler alive so that push
  // notifications received while the app is open are still displayed.
  useEffect(() => {
    if (!subscribed) return;
    const unsubscribe = setupForegroundMessageHandler();
    return () => {
      unsubscribe?.();
    };
  }, [subscribed]);

  const handleEnable = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const success = await subscribeToPushNotifications(() => firebaseUser.getIdToken());
      if (success) {
        setPermission('granted');
        setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const handleDisable = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      await unsubscribeFromPushNotifications(() => firebaseUser.getIdToken());
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

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
