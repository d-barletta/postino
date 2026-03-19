'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { StatsCards } from '@/components/admin/StatsCards';
import { AdminOverviewCharts } from '@/components/admin/AdminOverviewCharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
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
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Overview</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Platform statistics and management</p>
      </div>
            <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 ui-stagger">
            {[
              { href: '/admin/users', label: 'Users', icon: 'bi bi-people-fill' },
              { href: '/admin/emails', label: 'Email Logs', icon: 'bi bi-envelope-fill' },
              { href: '/admin/settings', label: 'Settings', icon: 'bi bi-gear-fill' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 p-4 rounded-xl border border-white/50 dark:border-white/10 bg-white/55 dark:bg-gray-900/35 hover:border-[#EFD957] hover:bg-yellow-50/80 dark:hover:bg-yellow-900/15 transition-all duration-250 hover:-translate-y-px"
              >
                <i className={`${item.icon} text-2xl text-[#d0b53f]`} aria-hidden="true" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel rounded-xl px-6 py-4 animate-pulse"
            >
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          <StatsCards stats={stats} />
          <AdminOverviewCharts stats={stats} />
        </>
      ) : (
        <Card>
          <CardContent>
            <p className="text-gray-500 dark:text-gray-400">Failed to load statistics.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
