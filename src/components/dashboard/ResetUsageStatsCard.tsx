'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Trash2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';

interface ResetUsageStatsCardProps {
  onSuccess?: () => Promise<void> | void;
}

export function ResetUsageStatsCard({ onSuccess }: ResetUsageStatsCardProps) {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const s = t.dashboard.resetUsageStats;
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!firebaseUser) return;
    setResetting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/user/stats/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await onSuccess?.();
      setOpen(false);
      toast.success(s.successToast);
    } catch {
      toast.error(s.errorToast);
    } finally {
      setResetting(false);
    }
  };

  const handleDrawerChange = (nextOpen: boolean) => {
    if (!resetting) setOpen(nextOpen);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.title}</h2>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" />
              {s.buttonLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Drawer open={open} onOpenChange={handleDrawerChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{s.confirmTitle}</DrawerTitle>
            <DrawerDescription>{s.confirmDescription}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={resetting}>
              {s.cancel}
            </Button>
            <Button variant="danger" onClick={handleReset} loading={resetting}>
              {s.confirmButton}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
