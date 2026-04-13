'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { useI18n } from '@/lib/i18n';

interface ForwardingHeaderCardProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
}

export function ForwardingHeaderCard({ isEnabled, onToggle }: ForwardingHeaderCardProps) {
  const { t } = useI18n();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await onToggle(checked);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card>
      <CardHeader
        heading={t.dashboard.forwardingHeader.title}
        actions={
          <>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label={t.dashboard.forwardingHeader.title}
            />
            <Badge variant={isEnabled ? 'success' : 'default'}>
              {isEnabled ? t.dashboard.address.active : t.dashboard.address.disabled}
            </Badge>
          </>
        }
      />
      <CardContent>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isEnabled
            ? t.dashboard.forwardingHeader.enabledDescription
            : t.dashboard.forwardingHeader.disabledDescription}
        </p>
      </CardContent>
    </Card>
  );
}
