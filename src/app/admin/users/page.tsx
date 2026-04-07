'use client';

import { toast } from 'sonner';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
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

type ConfirmAction =
  | { uid: string; action: 'admin' | 'active'; current: boolean }
  | { uid: string; action: 'reanalyze' }
  | { uid: string; action: 'reset' }
  | { uid: string; action: 'delete' };

function replaceTokens(template: string, tokens: Record<string, string | number>): string {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

interface AdminUsersPageProps {
  showPageHeader?: boolean;
}

export default function AdminUsersPage({ showPageHeader = true }: AdminUsersPageProps) {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const adminUsers = t.admin.users;
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setHasNextPage(data.hasNextPage ?? false);
        setNextCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const loadMore = useCallback(async () => {
    if (!firebaseUser || !nextCursor) return;
    setLoadingMore(true);
    try {
      const token = await firebaseUser.getIdToken();
      const url = `/api/admin/users?cursor=${encodeURIComponent(nextCursor)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => [...prev, ...(data.users || [])]);
        setHasNextPage(data.hasNextPage ?? false);
        setNextCursor(data.nextCursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [firebaseUser, nextCursor]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const executeAction = async () => {
    if (!firebaseUser || !confirmAction) return;
    setConfirming(true);
    try {
      const token = await firebaseUser.getIdToken();
      let res: Response;

      if (confirmAction.action === 'delete') {
        res = await fetch(`/api/admin/users/${confirmAction.uid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (confirmAction.action === 'reanalyze') {
        res = await fetch(`/api/admin/users/${confirmAction.uid}/analysis`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (confirmAction.action === 'reset') {
        res = await fetch(`/api/admin/users/${confirmAction.uid}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        const body =
          confirmAction.action === 'admin'
            ? { isAdmin: !confirmAction.current }
            : { isActive: !confirmAction.current };
        res = await fetch(`/api/admin/users/${confirmAction.uid}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          payload?.error ||
            (confirmAction.action === 'reanalyze'
              ? t.admin.toasts.failedToRerunUserAnalyses
              : confirmAction.action === 'reset'
                ? t.admin.toasts.failedToResetUserData
                : t.admin.toasts.failedToUpdateUser),
        );
      }

      const data = (await res.json().catch(() => null)) as {
        reanalyzedCount?: number;
        failedCount?: number;
        skippedCount?: number;
        totalCount?: number;
      } | null;

      await fetchUsers();
      const label =
        confirmAction.action === 'delete'
          ? t.admin.toasts.userDeleted
          : confirmAction.action === 'reanalyze'
            ? (data?.failedCount ?? 0) > 0 || (data?.skippedCount ?? 0) > 0
              ? replaceTokens(t.admin.toasts.userAnalysesRerunPartial, {
                  done: data?.reanalyzedCount ?? 0,
                  failed: data?.failedCount ?? 0,
                  skipped: data?.skippedCount ?? 0,
                })
              : replaceTokens(t.admin.toasts.userAnalysesRerun, {
                  count: data?.reanalyzedCount ?? 0,
                })
            : confirmAction.action === 'reset'
              ? t.admin.toasts.userDataReset
              : confirmAction.action === 'admin'
                ? confirmAction.current
                  ? t.admin.toasts.adminRemoved
                  : t.admin.toasts.adminGranted
                : confirmAction.current
                  ? t.admin.toasts.userSuspended
                  : t.admin.toasts.userActivated;
      toast.success(label);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : confirmAction.action === 'reanalyze'
            ? t.admin.toasts.failedToRerunUserAnalyses
            : confirmAction.action === 'reset'
              ? t.admin.toasts.failedToResetUserData
              : t.admin.toasts.failedToUpdateUser,
      );
    } finally {
      setConfirming(false);
      setConfirmAction(null);
    }
  };

  const confirmUser = users.find((u) => u.uid === confirmAction?.uid);
  const confirmTitle =
    confirmAction?.action === 'delete'
      ? 'Delete user'
      : confirmAction?.action === 'reanalyze'
        ? adminUsers.rerunAnalysisTitle
        : confirmAction?.action === 'reset'
          ? adminUsers.resetDataTitle
          : confirmAction?.action === 'admin'
            ? confirmAction.current
              ? 'Remove admin privileges'
              : 'Grant admin privileges'
            : confirmAction?.current
              ? 'Suspend user'
              : 'Activate user';
  const confirmDesc =
    confirmAction?.action === 'delete'
      ? `Permanently delete ${confirmUser?.email} and all their data (rules, email logs)? This cannot be undone.`
      : confirmAction?.action === 'reanalyze'
        ? adminUsers.rerunAnalysisDesc.replace('{email}', confirmUser?.email ?? '')
        : confirmAction?.action === 'reset'
          ? adminUsers.resetDataDesc.replace('{email}', confirmUser?.email ?? '')
          : confirmAction?.action === 'admin'
            ? `${confirmAction.current ? 'Remove admin' : 'Grant admin'} for ${confirmUser?.email}?`
            : `${confirmAction?.current ? 'Suspend' : 'Activate'} account for ${confirmUser?.email}?`;

  return (
    <div className="space-y-6">
      {showPageHeader && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage all platform users</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Users</CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {users.length}
            {hasNextPage ? '+' : ''} total users
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="animate-pulse divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-3 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded-md" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((user) => (
                <div key={user.uid} className="px-6 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                          {user.email}
                        </p>
                        {user.isAdmin && <Badge variant="info">Admin</Badge>}
                        <Badge variant={user.isActive ? 'success' : 'error'}>
                          {user.isActive ? 'Active' : 'Suspended'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-mono truncate">
                        {user.assignedEmail}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Joined {formatDate(user.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setConfirmAction({
                            uid: user.uid,
                            action: 'admin',
                            current: user.isAdmin,
                          })
                        }
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setConfirmAction({ uid: user.uid, action: 'reanalyze' })}
                      >
                        {adminUsers.rerunAnalysis}
                      </Button>
                      {!user.isAdmin && (
                        <Button
                          size="sm"
                          variant={user.isActive ? 'danger' : 'secondary'}
                          onClick={() =>
                            setConfirmAction({
                              uid: user.uid,
                              action: 'active',
                              current: user.isActive,
                            })
                          }
                        >
                          {user.isActive ? 'Suspend' : 'Activate'}
                        </Button>
                      )}
                      {!user.isAdmin && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmAction({ uid: user.uid, action: 'reset' })}
                        >
                          {adminUsers.resetData}
                        </Button>
                      )}
                      {!user.isAdmin && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmAction({ uid: user.uid, action: 'delete' })}
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {hasNextPage && (
                <div className="px-6 py-4 flex justify-center">
                  <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                    Load more
                  </Button>
                </div>
              )}
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
              variant={
                confirmAction?.action === 'delete' ||
                confirmAction?.action === 'reset' ||
                (confirmAction?.action === 'active' && confirmAction.current)
                  ? 'danger'
                  : 'primary'
              }
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
