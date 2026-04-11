'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import type { EntityRelationGraph } from '@/types';

export function useRelationGraph() {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const [graph, setGraph] = useState<EntityRelationGraph | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authUser) {
      setHasFetched(false);
    }
  }, [authUser]);

  const fetchGraph = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/relations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as { graph: EntityRelationGraph | null };
      setGraph(json.graph);
    } catch {
      toast.error(t.dashboard.knowledge.relations.loadError);
      setError(t.dashboard.knowledge.relations.loadError);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [authUser, getIdToken, t]);

  const generateGraph = useCallback(async () => {
    if (!authUser) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/relations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate');
      const json = (await res.json()) as { graph: EntityRelationGraph };
      setGraph(json.graph);
      toast.success(t.dashboard.knowledge.relations.generated);
    } catch {
      toast.error(t.dashboard.knowledge.relations.error);
      setError(t.dashboard.knowledge.relations.error);
    } finally {
      setGenerating(false);
    }
  }, [authUser, getIdToken, t]);

  return { graph, hasFetched, loading, generating, error, fetchGraph, generateGraph };
}
