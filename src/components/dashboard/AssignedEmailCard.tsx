'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';

interface AssignedEmailCardProps {
  assignedEmail: string;
  userEmail: string;
  isAddressEnabled: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
}

export function AssignedEmailCard({ assignedEmail, userEmail, isAddressEnabled, onToggle }: AssignedEmailCardProps) {
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(assignedEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Postino Address</h2>
          <div className="flex items-center gap-2">
            <Switch
              checked={isAddressEnabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              aria-label="Enable or disable your Postino address"
            />
            <Badge variant={isAddressEnabled ? 'success' : 'default'}>
              {isAddressEnabled ? 'Active' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-3">
          {isAddressEnabled
            ? <>Send emails to this address and they&rsquo;ll be processed according to your rules, then forwarded to your email <span className={cn('inline-block font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5')}>{userEmail}</span>.</>
            : 'Your Postino address is disabled. Incoming emails will be registered as skipped and not forwarded.'}
        </p>
        <div className="flex items-center gap-2">
          <div className={`flex-1 font-mono text-sm border rounded-lg px-3 py-2 truncate ${isAddressEnabled ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
            {assignedEmail}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? (
              <span className="inline-flex items-center gap-1">
                <i className="bi bi-check-lg" aria-hidden="true" /> Copied
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <i className="bi bi-copy" aria-hidden="true" /> Copy
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
