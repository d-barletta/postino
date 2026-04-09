'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import type { EntityPlaceMap } from '@/types';

export function usePlaceMapGraph(firebaseUser: { getIdToken: () => Promise<string> } | null) {
  const { t } = useI18n();
  const [graph, setGraph] = useState<EntityPlaceMap | null>(null);
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
      const res = await fetch('/api/entities/map', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as { graph: EntityPlaceMap | null };
      setGraph(json.graph);
    } catch {
      toast.error(t.dashboard.knowledge.relations.mapLoadError);
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
      const res = await fetch('/api/entities/map', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate');
      const json = (await res.json()) as { graph: EntityPlaceMap };
      setGraph(json.graph);
      toast.success(t.dashboard.knowledge.relations.mapGenerated);
    } catch {
      toast.error(t.dashboard.knowledge.relations.mapError);
    } finally {
      setGenerating(false);
    }
  }, [firebaseUser, t]);

  return { graph, hasFetched, loading, generating, fetchGraph, generateGraph };
}
