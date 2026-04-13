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

export function DeleteEntitiesCard({ onSuccess }: { onSuccess?: () => Promise<void> | void }) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const s = t.dashboard.deleteEntities;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!authUser) return;
    setDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/all', {
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
      setDeleting(false);
    }
  };

  const handleDrawerChange = (o: boolean) => {
    if (!deleting) setOpen(o);
  };

  return (
    <>
      <Card>
        <CardHeader heading={s.title} />
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
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>
              {s.cancel}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {s.confirmButton}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
