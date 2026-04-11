'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import type { EntityFlowGraph } from '@/types';

export function useFlowGraph() {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const [graph, setGraph] = useState<EntityFlowGraph | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (authUser) setHasFetched(false);
  }, [authUser]);

  const fetchGraph = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/flow', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as { graph: EntityFlowGraph | null };
      setGraph(json.graph);
    } catch {
      toast.error(t.dashboard.knowledge.relations.flowLoadError);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [authUser, getIdToken, t]);

  const generateGraph = useCallback(async () => {
    if (!authUser) return;
    setGenerating(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/flow', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate');
      const json = (await res.json()) as { graph: EntityFlowGraph };
      setGraph(json.graph);
      toast.success(t.dashboard.knowledge.relations.flowGenerated);
    } catch {
      toast.error(t.dashboard.knowledge.relations.flowError);
    } finally {
      setGenerating(false);
    }
  }, [authUser, getIdToken, t]);

  return { graph, hasFetched, loading, generating, fetchGraph, generateGraph };
}
