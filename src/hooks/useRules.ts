'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Rule } from '@/types';

export function useRules() {
  const { authUser, getIdToken } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!authUser) return;
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch('/api/rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = async (
    name: string,
    text: string,
    matchSender?: string,
    matchSubject?: string,
    matchBody?: string,
  ) => {
    if (!authUser) return;
    const token = await getIdToken();
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text, matchSender, matchSubject, matchBody }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create rule');
    }
    await fetchRules();
  };

  // Fetches rules in the background without triggering the loading skeleton.
  const silentFetch = useCallback(async () => {
    if (!authUser) return;
    try {
      const token = await getIdToken();
      const res = await fetch('/api/rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setRules(data.rules || []);
    } catch {
      // Silent — optimistic state is still shown
    }
  }, [authUser]);

  const updateRule = async (
    id: string,
    name: string,
    text: string,
    isActive: boolean,
    matchSender?: string,
    matchSubject?: string,
    matchBody?: string,
  ) => {
    if (!authUser) return;
    const previousRules = rules;
    // Optimistic update
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              name,
              text,
              isActive,
              matchSender: matchSender ?? r.matchSender,
              matchSubject: matchSubject ?? r.matchSubject,
              matchBody: matchBody ?? r.matchBody,
            }
          : r,
      ),
    );
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text, isActive, matchSender, matchSubject, matchBody }),
      });
      if (!res.ok) throw new Error('Failed to update rule');
      await silentFetch();
    } catch (err) {
      setRules(previousRules);
      throw err;
    }
  };

  const deleteRule = async (id: string) => {
    if (!authUser) return;
    const token = await getIdToken();
    const res = await fetch(`/api/rules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete rule');
    await fetchRules();
  };

  const reorderRules = async (orderedIds: string[]) => {
    if (!authUser) return;
    const previousRules = rules;
    // Optimistic reorder
    const reordered = orderedIds
      .map((id) => rules.find((r) => r.id === id))
      .filter(Boolean) as Rule[];
    setRules(reordered);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/rules/reorder', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to reorder rules: ${res.status} ${res.statusText}`);
      }
      await silentFetch();
    } catch (err) {
      setRules(previousRules);
      throw err;
    }
  };

  return {
    rules,
    loading,
    error,
    createRule,
    updateRule,
    deleteRule,
    reorderRules,
    refetch: fetchRules,
  };
}
