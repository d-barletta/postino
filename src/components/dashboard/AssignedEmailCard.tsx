'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface AssignedEmailCardProps {
  assignedEmail: string;
}

export function AssignedEmailCard({ assignedEmail }: AssignedEmailCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(assignedEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Your Postino Address</h2>
          <Badge variant="success">Active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-3">
          Send emails to this address and they&apos;ll be processed according to your rules, then forwarded to your real email.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate">
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
