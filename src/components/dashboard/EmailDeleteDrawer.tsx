'use client';

import { Button } from '@/components/ui/Button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { useI18n } from '@/lib/i18n';

interface EmailDeleteDrawerProps {
  open: boolean;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function EmailDeleteDrawer({
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: EmailDeleteDrawerProps) {
  const { t } = useI18n();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t.dashboard.emailHistory.deleteEmail}</DrawerTitle>
          <DrawerDescription>{t.dashboard.emailHistory.deleteEmailConfirm}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pb-8">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="flex-1"
          >
            {t.dashboard.rules.cancel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={deleting} className="flex-1">
            {deleting ? '…' : t.dashboard.emailHistory.deleteEmail}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
