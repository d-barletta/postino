'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';

interface ClearMemoriesCardProps {
  onSuccess?: () => Promise<void> | void;
}

export function ClearMemoriesCard({ onSuccess }: ClearMemoriesCardProps) {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const s = t.dashboard.clearMemories;
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!firebaseUser) return;
    setClearing(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/user/memories', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      await onSuccess?.();
      setOpen(false);
      toast.success(s.successToast);
    } catch {
      toast.error(s.errorToast);
    } finally {
      setClearing(false);
    }
  };

  const handleDrawerChange = (nextOpen: boolean) => {
    if (!clearing) setOpen(nextOpen);
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
