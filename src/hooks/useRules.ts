'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import type { Rule } from '@/types';

export function useRules() {
  const { firebaseUser } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setLoading(true);
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = async (
    name: string,
    text: string,
    matchSender?: string,
    matchSubject?: string,
    matchBody?: string
  ) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
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

  const updateRule = async (
    id: string,
    name: string,
    text: string,
    isActive: boolean,
    matchSender?: string,
    matchSubject?: string,
    matchBody?: string
  ) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch(`/api/rules/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, text, isActive, matchSender, matchSubject, matchBody }),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    await fetchRules();
  };

  const deleteRule = async (id: string) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch(`/api/rules/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete rule');
    await fetchRules();
  };

  return { rules, loading, error, createRule, updateRule, deleteRule, refetch: fetchRules };
}
