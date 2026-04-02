'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import {
  RelationGraph,
  RelationGraphFullPageContent,
  useRelationGraph,
} from '@/components/dashboard/RelationGraph';
import { useModalHistory } from '@/hooks/useModalHistory';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import type { EntityGraphNodeCategory } from '@/types';

export function RelationsTab() {
  const { t } = useI18n();
  const { firebaseUser, loading: authLoading } = useAuth();
  const k = t.dashboard.knowledge;

  const {
    graph,
    hasFetched,
    loading,
    generating,
    fetchGraph,
    generateGraph,
  } = useRelationGraph(firebaseUser);

  // Load any previously-generated (cached) graph on first render
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const [modalChip, setModalChip] = useState<{
    value: string;
    category: string;
    label: string;
  } | null>(null);
  const [fullscreenEmail, setFullscreenEmail] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const [fullPageGraphOpen, setFullPageGraphOpen] = useState(false);

  useModalHistory(!!fullscreenEmail, () => setFullscreenEmail(null));
  useModalHistory(fullPageGraphOpen, () => setFullPageGraphOpen(false));

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

  const graphTranslations = {
    ...k.relations,
    topics: k.topics,
    people: k.people,
    organizations: k.organizations,
    places: k.places,
    events: k.events,
    tags: k.tags,
  };

  return (
    <>
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
            loading={authLoading || loading || !hasFetched}
            generating={generating}
            onGenerate={generateGraph}
            onNodeClick={handleNodeClick}
            onExpandFullPage={() => setFullPageGraphOpen(true)}
            translations={graphTranslations}
          />
        </CardContent>
      </Card>

      {/* Full-page graph dialog */}
      <Dialog open={fullPageGraphOpen} onOpenChange={(o) => { if (!o) setFullPageGraphOpen(false); }}>
        <DialogContent
          hideCloseButton
          animation="slide-from-bottom"
          className="w-[95vw] max-w-7xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="flex-1 min-h-0">
            {graph && graph.nodes.length > 0 && (
              <RelationGraphFullPageContent
                graph={graph}
                onNodeClick={handleNodeClick}
              />
            )}
          </div>
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {k.relations.title}
            </DialogTitle>
            <DialogClose asChild>
              <Button size="sm" className="shrink-0">
                {k.relations.closeFullPage}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
