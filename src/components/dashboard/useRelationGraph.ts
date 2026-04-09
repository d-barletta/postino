'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { EntityRelationGraph } from '@/types';

export function useRelationGraph(firebaseUser: { getIdToken: () => Promise<string> } | null) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<EntityRelationGraph | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser) {
      setHasFetched(false);
    }
  }, [firebaseUser]);

  const fetchGraph = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser]);

  const generateGraph = useCallback(async () => {
    if (!firebaseUser) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser]);

  return { graph, hasFetched, loading, generating, error, fetchGraph, generateGraph };
}
