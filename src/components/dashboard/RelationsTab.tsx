'use client';

import { useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import { RelationGraph, useRelationGraph } from '@/components/dashboard/RelationGraph';
import { useModalHistory } from '@/hooks/useModalHistory';
import { useState } from 'react';
import type { EntityGraphNodeCategory } from '@/types';

export function RelationsTab() {
  const { t } = useI18n();
  const { firebaseUser } = useAuth();
  const k = t.dashboard.knowledge;

  const {
    graph,
    loading,
    generating,
    generateGraph,
  } = useRelationGraph(firebaseUser);

  const [modalChip, setModalChip] = useState<{
    value: string;
    category: string;
    label: string;
  } | null>(null);
  const [fullscreenEmail, setFullscreenEmail] = useState<{
    subject: string;
    body: string;
  } | null>(null);

  useModalHistory(!!fullscreenEmail, () => setFullscreenEmail(null));

  const handleNodeClick = useCallback(
    (label: string, category: EntityGraphNodeCategory) => {
      const catLabel =
        category in k && typeof k[category as keyof typeof k] === 'string'
          ? (k[category as keyof typeof k] as string)
          : category;
      setModalChip({ value: label, category, label: catLabel });
    },
    [k],
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {k.relations.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {k.relations.subtitle}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <RelationGraph
          graph={graph}
          loading={loading}
          generating={generating}
          onGenerate={generateGraph}
          onNodeClick={handleNodeClick}
          translations={{
            ...k.relations,
            topics: k.topics,
            people: k.people,
            organizations: k.organizations,
            places: k.places,
            events: k.events,
            tags: k.tags,
          }}
        />
      </CardContent>

      {modalChip && (
        <ExploreEmailsModal
          term={modalChip.value}
          category={modalChip.category}
          categoryLabel={modalChip.label}
          onClose={() => setModalChip(null)}
          onRequestFullscreen={setFullscreenEmail}
        />
      )}

      <FullPageEmailDialog
        open={!!fullscreenEmail}
        onClose={() => setFullscreenEmail(null)}
        subject={fullscreenEmail?.subject ?? ''}
        body={fullscreenEmail?.body ?? null}
        overlayClassName="z-[100]"
        contentClassName="z-[100]"
      />
    </Card>
  );
}
