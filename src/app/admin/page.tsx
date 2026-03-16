'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { StatsCards } from '@/components/admin/StatsCards';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import type { Stats } from '@/types';

export default function AdminPage() {
  const { firebaseUser } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [firebaseUser]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-gray-500 mt-1">Platform statistics and management</p>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading stats...</div>
      ) : stats ? (
        <StatsCards stats={stats} />
      ) : (
        <Card>
          <CardContent>
            <p className="text-gray-500">Failed to load statistics.</p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { href: '/admin/users', label: 'Manage Users', icon: '👥' },
              { href: '/admin/settings', label: 'Platform Settings', icon: '⚙️' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
