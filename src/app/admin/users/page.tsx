'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';

type ConfirmAction = { uid: string; action: 'admin' | 'active'; current: boolean };

export default function AdminUsersPage() {
  const { firebaseUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const executeAction = async () => {
    if (!firebaseUser || !confirmAction) return;
    setConfirming(true);
    try {
      const token = await firebaseUser.getIdToken();
      const body =
        confirmAction.action === 'admin'
          ? { isAdmin: !confirmAction.current }
          : { isActive: !confirmAction.current };
      await fetch(`/api/admin/users/${confirmAction.uid}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await fetchUsers();
    } finally {
      setConfirming(false);
      setConfirmAction(null);
    }
  };

  const confirmUser = users.find((u) => u.uid === confirmAction?.uid);
  const confirmTitle =
    confirmAction?.action === 'admin'
      ? confirmAction.current ? 'Remove admin privileges' : 'Grant admin privileges'
      : confirmAction?.current ? 'Suspend user' : 'Activate user';
  const confirmDesc =
    confirmAction?.action === 'admin'
      ? `${confirmAction.current ? 'Remove admin' : 'Grant admin'} for ${confirmUser?.email}?`
      : `${confirmAction?.current ? 'Suspend' : 'Activate'} account for ${confirmUser?.email}?`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{users.length} total users</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">Loading users...</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((user) => (
                <div key={user.uid} className="px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{user.email}</p>
                        {user.isAdmin && <Badge variant="info">Admin</Badge>}
                        <Badge variant={user.isActive ? 'success' : 'error'}>
                          {user.isActive ? 'Active' : 'Suspended'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-mono truncate">{user.assignedEmail}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Joined {formatDate(user.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirmAction({ uid: user.uid, action: 'admin', current: user.isAdmin })}
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isActive ? 'danger' : 'secondary'}
                        onClick={() => setConfirmAction({ uid: user.uid, action: 'active', current: user.isActive })}
                      >
                        {user.isActive ? 'Suspend' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Drawer open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{confirmTitle}</DrawerTitle>
            <DrawerDescription>{confirmDesc}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="ghost" onClick={() => setConfirmAction(null)} disabled={confirming}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.action === 'active' && confirmAction.current ? 'danger' : 'primary'}
              onClick={executeAction}
              loading={confirming}
            >
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
