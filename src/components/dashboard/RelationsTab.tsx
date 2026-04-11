'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import { useRelationGraph } from '@/components/dashboard/useRelationGraph';
import { useFlowGraph } from '@/components/dashboard/useFlowGraph';
import { usePlaceMapGraph } from '@/components/dashboard/usePlaceMapGraph';
import { useModalHistory } from '@/hooks/useModalHistory';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Map as MapIcon, Maximize2, RefreshCw, Share2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityGraphNodeCategory } from '@/types';

const RelationGraph = dynamic(
  () => import('@/components/dashboard/RelationGraph').then((m) => ({ default: m.RelationGraph })),
  { ssr: false },
);
const RelationGraphFullPageContent = dynamic(
  () =>
    import('@/components/dashboard/RelationGraph').then((m) => ({
      default: m.RelationGraphFullPageContent,
    })),
  { ssr: false },
);
const RelationFlowChart = dynamic(
  () =>
    import('@/components/dashboard/RelationFlowChart').then((m) => ({
      default: m.RelationFlowChart,
    })),
  { ssr: false },
);
const RelationFlowChartFullPageContent = dynamic(
  () =>
    import('@/components/dashboard/RelationFlowChart').then((m) => ({
      default: m.RelationFlowChartFullPageContent,
    })),
  { ssr: false },
);
const RelationMapChart = dynamic(
  () =>
    import('@/components/dashboard/RelationMapChart').then((m) => ({
      default: m.RelationMapChart,
    })),
  { ssr: false },
);
const RelationMapChartFullPageContent = dynamic(
  () =>
    import('@/components/dashboard/RelationMapChart').then((m) => ({
      default: m.RelationMapChartFullPageContent,
    })),
  { ssr: false },
);

export function RelationsTab() {
  const { t } = useI18n();
  const { loading: authLoading } = useAuth();
  const k = t.dashboard.knowledge;

  const { graph, hasFetched, loading, generating, fetchGraph, generateGraph } = useRelationGraph();

  const {
    graph: flowGraph,
    hasFetched: flowHasFetched,
    loading: flowLoading,
    generating: flowGenerating,
    fetchGraph: fetchFlowGraph,
    generateGraph: generateFlowGraph,
  } = useFlowGraph();

  const {
    graph: placeMap,
    hasFetched: mapHasFetched,
    loading: mapLoading,
    generating: mapGenerating,
    fetchGraph: fetchPlaceMap,
    generateGraph: generatePlaceMap,
  } = usePlaceMapGraph();

  // Load cached graphs on first render
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    fetchFlowGraph();
  }, [fetchFlowGraph]);

  useEffect(() => {
    fetchPlaceMap();
  }, [fetchPlaceMap]);

  const [activeSubTab, setActiveSubTab] = useState<'graph' | 'flow' | 'map'>('graph');

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
  const [fullPageFlowOpen, setFullPageFlowOpen] = useState(false);
  const [fullPageMapOpen, setFullPageMapOpen] = useState(false);

  useModalHistory(!!fullscreenEmail, () => setFullscreenEmail(null));
  useModalHistory(fullPageGraphOpen, () => setFullPageGraphOpen(false));
  useModalHistory(fullPageFlowOpen, () => setFullPageFlowOpen(false));
  useModalHistory(fullPageMapOpen, () => setFullPageMapOpen(false));

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
    dates: k.dates,
    tags: k.tags,
    numbers: k.numbers,
  };

  const flowTranslations = {
    legend: k.relations.legend,
    topics: k.topics,
    people: k.people,
    organizations: k.organizations,
    places: k.places,
    events: k.events,
    dates: k.dates,
    tags: k.tags,
    numbers: k.numbers,
    flowNodeClick: k.relations.flowNodeClick,
    flowNoGraph: k.relations.flowNoGraph,
    flowNoGraphDesc: k.relations.flowNoGraphDesc,
    flowGenerate: k.relations.flowGenerate,
    flowGenerating: k.relations.flowGenerating,
    flowRegenerate: k.relations.flowRegenerate,
    flowGeneratedOn: k.relations.flowGeneratedOn,
    flowTotalEmails: k.relations.flowTotalEmails,
    openRelatedEmails: k.relations.openRelatedEmails,
    expandFullPage: k.relations.expandFullPage,
  };

  const mapTranslations = {
    mapGenerate: k.relations.mapGenerate,
    mapNoGraph: k.relations.mapNoGraph,
    mapNoGraphDesc: k.relations.mapNoGraphDesc,
    mapGeneratedOn: k.relations.mapGeneratedOn,
    mapTotalEmails: k.relations.mapTotalEmails,
    mapPinClick: k.relations.mapPinClick,
    openRelatedEmails: k.relations.openRelatedEmails,
  };

  const isEmpty = graph && graph.nodes.length === 0;
  const flowIsEmpty = flowGraph && flowGraph.nodes.length === 0;
  const mapIsEmpty = placeMap && placeMap.pins.length === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {k.relations.title}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
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
              {activeSubTab === 'graph' && hasFetched && (
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
              {activeSubTab === 'flow' && flowGraph && !flowIsEmpty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullPageFlowOpen(true)}
                  aria-label={k.relations.expandFullPage}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
              {activeSubTab === 'flow' && flowHasFetched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateFlowGraph}
                  disabled={flowGenerating}
                  aria-label={k.relations.flowRegenerate}
                >
                  <RefreshCw className={cn('h-4 w-4', flowGenerating && 'animate-spin')} />
                </Button>
              )}
              {activeSubTab === 'map' && placeMap && !mapIsEmpty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFullPageMapOpen(true)}
                  aria-label={k.relations.expandFullPage}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
              {activeSubTab === 'map' && mapHasFetched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generatePlaceMap}
                  disabled={mapGenerating}
                  aria-label={k.relations.mapRegenerate}
                >
                  <RefreshCw className={cn('h-4 w-4', mapGenerating && 'animate-spin')} />
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{k.relations.subtitle}</p>
        </CardHeader>

        <CardContent className="space-y-0 p-2">
          <Tabs
            value={activeSubTab}
            onValueChange={(v) => setActiveSubTab(v as 'graph' | 'flow' | 'map')}
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
              <TabsTrigger value="map" className="inline-flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5" />
                {k.relations.mapTab}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="graph" className="pt-0">
              <RelationGraph
                graph={graph}
                loading={authLoading || loading || !hasFetched}
                generating={generating}
                onGenerate={generateGraph}
                onNodeClick={handleNodeClick}
                translations={graphTranslations}
              />
            </TabsContent>

            <TabsContent value="flow" className="pt-0">
              <RelationFlowChart
                graph={flowGraph}
                loading={authLoading || flowLoading || !flowHasFetched}
                generating={flowGenerating}
                onGenerate={generateFlowGraph}
                onNodeClick={handleNodeClick}
                translations={flowTranslations}
              />
            </TabsContent>

            <TabsContent value="map" className="pt-0">
              <RelationMapChart
                graph={placeMap}
                loading={authLoading || mapLoading || !mapHasFetched}
                generating={mapGenerating}
                isActive={activeSubTab === 'map'}
                onGenerate={generatePlaceMap}
                onNodeClick={(label) => handleNodeClick(label, 'places')}
                translations={mapTranslations}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Full-page graph dialog (Graph sub-tab only) */}
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

      {/* Full-page flow dialog (Flow sub-tab only) */}
      <Dialog
        open={fullPageFlowOpen}
        onOpenChange={(o) => {
          if (!o) setFullPageFlowOpen(false);
        }}
      >
        <DialogContent
          hideCloseButton
          animation="slide-from-bottom"
          className="w-[95vw] max-w-7xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="flex-1 min-h-0">
            {flowGraph && flowGraph.nodes.length > 0 && (
              <RelationFlowChartFullPageContent
                graph={flowGraph}
                onNodeClick={handleNodeClick}
                translations={flowTranslations}
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

      <Dialog
        open={fullPageMapOpen}
        onOpenChange={(o) => {
          if (!o) setFullPageMapOpen(false);
        }}
      >
        <DialogContent
          hideCloseButton
          animation="slide-from-bottom"
          className="w-[95vw] max-w-7xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="flex-1 min-h-0">
            {placeMap && placeMap.pins.length > 0 && (
              <RelationMapChartFullPageContent
                graph={placeMap}
                onNodeClick={(label) => handleNodeClick(label, 'places')}
                translations={mapTranslations}
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
