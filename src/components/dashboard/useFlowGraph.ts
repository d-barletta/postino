'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { EntityFlowGraph } from '@/types';

export function useFlowGraph(firebaseUser: { getIdToken: () => Promise<string> } | null) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<EntityFlowGraph | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (firebaseUser) setHasFetched(false);
  }, [firebaseUser]);

  const fetchGraph = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser, t]);

  const generateGraph = useCallback(async () => {
    if (!firebaseUser) return;
    setGenerating(true);
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser, t]);

  return { graph, hasFetched, loading, generating, fetchGraph, generateGraph };
}
