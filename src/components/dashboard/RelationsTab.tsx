'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import {
  RelationGraph,
  RelationGraphFullPageContent,
  useRelationGraph,
} from '@/components/dashboard/RelationGraph';
import { RelationFlowChart } from '@/components/dashboard/RelationFlowChart';
import { useModalHistory } from '@/hooks/useModalHistory';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Maximize2, RefreshCw, Share2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityGraphNodeCategory } from '@/types';

export function RelationsTab() {
  const { t } = useI18n();
  const { firebaseUser, loading: authLoading } = useAuth();
  const k = t.dashboard.knowledge;

  const { graph, hasFetched, loading, generating, fetchGraph, generateGraph } =
    useRelationGraph(firebaseUser);

  // Load any previously-generated (cached) graph on first render
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const [activeSubTab, setActiveSubTab] = useState<'graph' | 'flow'>('graph');

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

  const flowTranslations = {
    legend: k.relations.legend,
    topics: k.topics,
    people: k.people,
    organizations: k.organizations,
    places: k.places,
    events: k.events,
    tags: k.tags,
    flowNodeClick: k.relations.flowNodeClick,
    noGraph: k.relations.noGraph,
    noGraphDesc: k.relations.noGraphDesc,
  };

  const isEmpty = graph && graph.nodes.length === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {k.relations.title}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {k.relations.subtitle}
              </p>
            </div>
            {/* Mobile-only icon buttons – hidden on sm+ (toolbar handles those) */}
            <div className="sm:hidden flex items-center gap-1.5 shrink-0">
              {activeSubTab === 'graph' && graph && !isEmpty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullPageGraphOpen(true)}
                  aria-label={k.relations.expandFullPage}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
              {hasFetched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateGraph}
                  disabled={generating}
                  aria-label={k.relations.regenerate}
                >
                  <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-0 p-2">
          <Tabs
            value={activeSubTab}
            onValueChange={(v) => setActiveSubTab(v as 'graph' | 'flow')}
          >
            <TabsList>
              <TabsTrigger value="graph" className="inline-flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                {k.relations.graphTab}
              </TabsTrigger>
              <TabsTrigger value="flow" className="inline-flex items-center gap-1.5">
                <Workflow className="h-3.5 w-3.5" />
                {k.relations.flowTab}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="graph" className="pt-4">
              <RelationGraph
                graph={graph}
                loading={authLoading || loading || !hasFetched}
                generating={generating}
                onGenerate={generateGraph}
                onNodeClick={handleNodeClick}
                onExpandFullPage={() => setFullPageGraphOpen(true)}
                translations={graphTranslations}
              />
            </TabsContent>

            <TabsContent value="flow" className="pt-4">
              <RelationFlowChart
                graph={graph}
                loading={authLoading || loading || !hasFetched}
                generating={generating}
                onNodeClick={handleNodeClick}
                translations={flowTranslations}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Full-page graph dialog */}
      <Dialog
        open={fullPageGraphOpen}
        onOpenChange={(o) => {
          if (!o) setFullPageGraphOpen(false);
        }}
      >
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
                translations={graphTranslations}
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

