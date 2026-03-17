'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { User } from '@/types';

export default function AdminUsersPage() {
  const { firebaseUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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
      }
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleAdmin = async (uid: string, current: boolean) => {
    if (!firebaseUser) return;
    if (!confirm(`${current ? 'Remove' : 'Grant'} admin for this user?`)) return;
    const token = await firebaseUser.getIdToken();
    await fetch(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: !current }),
    });
    await fetchUsers();
  };

  const handleToggleActive = async (uid: string, current: boolean) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    await fetch(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    });
    await fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{users.length} total users</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">All Users</h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">Loading users...</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map((user) => (
                <div key={user.uid} className="px-6 py-4 bg-white dark:bg-gray-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{user.email}</p>
                        {user.isAdmin && <Badge variant="info">Admin</Badge>}
                        <Badge variant={user.isActive ? 'success' : 'error'}>
                          {user.isActive ? 'Active' : 'Suspended'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">{user.assignedEmail}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Joined {formatDate(user.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleToggleAdmin(user.uid, user.isAdmin)}
                      >
                        {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      <Button
                        size="sm"
                        variant={user.isActive ? 'danger' : 'secondary'}
                        onClick={() => handleToggleActive(user.uid, user.isActive)}
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
    </div>
  );
}
