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

export function ClearAnalysisCard({ onSuccess }: { onSuccess?: () => Promise<void> | void }) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const s = t.dashboard.clearAnalysis;
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!authUser) return;
    setClearing(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/email/clear-analysis', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      toast.success(s.successToast);
      await onSuccess?.();
    } catch {
      toast.error(s.errorToast);
    } finally {
      setClearing(false);
    }
  };

  const handleDrawerChange = (o: boolean) => {
    if (!clearing) setOpen(o);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{s.title}</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{s.description}</p>
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
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={clearing}>
              {s.cancel}
            </Button>
            <Button variant="danger" onClick={handleClear} loading={clearing}>
              {s.confirmButton}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
