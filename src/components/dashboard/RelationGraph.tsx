'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { RefreshCw, Share2, AlertCircle } from 'lucide-react';
import type { EntityRelationGraph, EntityGraphNode, EntityGraphNodeCategory } from '@/types';

// ---------------------------------------------------------------------------
// Category colours (works on both light and dark backgrounds)
// ---------------------------------------------------------------------------
export const CATEGORY_COLORS: Record<EntityGraphNodeCategory, string> = {
  topics: '#6366f1',
  people: '#22c55e',
  organizations: '#f97316',
  places: '#0ea5e9',
  events: '#ec4899',
  tags: '#a855f7',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RelationGraphProps {
  graph: EntityRelationGraph | null;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  translations: {
    generate: string;
    generating: string;
    regenerate: string;
    noGraph: string;
    noGraphDesc: string;
    generatedOn: string;
    totalEmails: string;
    error: string;
    nodeClickHint: string;
    legend: string;
    topics: string;
    people: string;
    organizations: string;
    places: string;
    events: string;
    tags: string;
  };
}

// ---------------------------------------------------------------------------
// Skeleton while first loading
// ---------------------------------------------------------------------------
function GraphSkeleton() {
  return (
    <div className="flex items-center justify-center h-[460px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 animate-pulse">
      <div className="text-gray-300 dark:text-gray-600">
        <Share2 className="h-16 w-16 mx-auto mb-3 opacity-40" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend item
// ---------------------------------------------------------------------------
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0 border border-white/30"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RelationGraph({
  graph,
  loading,
  generating,
  onGenerate,
  onNodeClick,
  translations: tr,
}: RelationGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Track which node was last clicked (for stable ExploreEmailsModal integration)
  const [, setClickedNode] = useState<EntityGraphNode | null>(null);

  // -----------------------------------------------------------------
  // Mount/update cytoscape when graph data changes
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || !graph || graph.nodes.length === 0) return;

    let destroyed = false;

    const init = async () => {
      const { default: cytoscape } = await import('cytoscape');
      if (destroyed || !containerRef.current) return;

      // Compute min/max for scaling
      const counts = graph.nodes.map((n) => n.count);
      const maxCount = Math.max(...counts, 1);
      const minCount = Math.min(...counts, 1);

      const weights = graph.edges.map((e) => e.weight);
      const maxWeight = Math.max(...weights, 1);

      const elements = [
        ...graph.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            category: node.category,
            count: node.count,
          },
        })),
        ...graph.edges.map((edge) => ({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          },
        })),
      ];

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (ele: cytoscape.NodeSingular) =>
                CATEGORY_COLORS[ele.data('category') as EntityGraphNodeCategory] ?? '#888',
              'border-color': '#fff',
              'border-width': 2,
              label: 'data(label)',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'font-size': '10px',
              color: '#374151',
              'text-margin-y': 4,
              'text-outline-width': 2,
              'text-outline-color': '#ffffff',
              'min-zoomed-font-size': 8,
              width: (ele: cytoscape.NodeSingular) => {
                const ratio =
                  maxCount === minCount
                    ? 0.5
                    : (ele.data('count') - minCount) / (maxCount - minCount);
                return 20 + ratio * 30; // 20px – 50px
              },
              height: (ele: cytoscape.NodeSingular) => {
                const ratio =
                  maxCount === minCount
                    ? 0.5
                    : (ele.data('count') - minCount) / (maxCount - minCount);
                return 20 + ratio * 30;
              },
              'overlay-padding': 6,
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-color': '#efd957',
              'border-width': 3,
            },
          },
          {
            selector: 'edge',
            style: {
              width: (ele: cytoscape.EdgeSingular) =>
                1 + (ele.data('weight') / maxWeight) * 4,
              'line-color': '#d1d5db',
              opacity: 0.7,
              'curve-style': 'bezier',
              'overlay-padding': 3,
            },
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color': '#efd957',
              opacity: 1,
            },
          },
          // Dim unconnected nodes on hover
          {
            selector: '.faded',
            style: { opacity: 0.2 },
          },
          {
            selector: '.highlighted',
            style: { opacity: 1 },
          },
        ],
        layout: {
          name: 'cose',
          animate: false,
          randomize: true,
          nodeRepulsion: () => 8000,
          idealEdgeLength: () => 80,
          edgeElasticity: () => 100,
          gravity: 0.25,
          numIter: 1000,
          initialTemp: 200,
          coolingFactor: 0.95,
          minTemp: 1.0,
        } as cytoscape.CoseLayoutOptions,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        minZoom: 0.2,
        maxZoom: 4,
      });

      // ---- interactions ----

      // Hover: highlight neighbourhood
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        cy.elements().addClass('faded');
        node.removeClass('faded').addClass('highlighted');
        node.connectedEdges().removeClass('faded').addClass('highlighted');
        node.connectedEdges().connectedNodes().removeClass('faded').addClass('highlighted');
      });

      cy.on('mouseout', 'node', () => {
        cy.elements().removeClass('faded highlighted');
      });

      // Click: open explore modal
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeData: EntityGraphNode = {
          id: node.data('id') as string,
          label: node.data('label') as string,
          category: node.data('category') as EntityGraphNodeCategory,
          count: node.data('count') as number,
        };
        setClickedNode(nodeData);
        onNodeClick(nodeData.label, nodeData.category);
      });

      // Fit on layout complete
      cy.on('layoutstop', () => {
        cy.fit(undefined, 30);
      });

      return cy;
    };

    const cyPromise: Promise<cytoscape.Core | undefined> = init();

    return () => {
      destroyed = true;
      cyPromise.then((cy) => cy?.destroy()).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // -----------------------------------------------------------------
  // Format generated date
  // -----------------------------------------------------------------
  const formattedDate = graph?.generatedAt
    ? new Date(graph.generatedAt).toLocaleString()
    : null;

  const isEmpty = graph && graph.nodes.length === 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {graph && !isEmpty && formattedDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {tr.generatedOn.replace('{date}', formattedDate)}
              {' · '}
              {tr.totalEmails.replace('{count}', String(graph.totalEmails))}
            </p>
          )}
        </div>
        <Button
          onClick={onGenerate}
          disabled={generating}
          size="sm"
          variant={graph ? 'ghost' : 'primary'}
        >
          <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
          {generating
            ? tr.generating
            : graph
            ? tr.regenerate
            : tr.generate}
        </Button>
      </div>

      {/* Graph area */}
      {loading && <GraphSkeleton />}

      {!loading && !graph && !generating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <Share2 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <div className="text-center">
            <p className="text-base font-medium text-gray-600 dark:text-gray-400">{tr.noGraph}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">{tr.noGraphDesc}</p>
          </div>
          <Button
            onClick={onGenerate}
            className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
          >
            <Share2 className="h-4 w-4" />
            {tr.generate}
          </Button>
        </div>
      )}

      {!loading && generating && !graph && <GraphSkeleton />}

      {!loading && graph && isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <AlertCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tr.noGraph}</p>
        </div>
      )}

      {!loading && graph && !isEmpty && (
        <>
          {/* Cytoscape container */}
          <div
            ref={containerRef}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
            style={{ height: 460 }}
            aria-label="Entity relation graph"
          />

          {/* Legend + hint */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {tr.legend}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
                  <LegendItem key={cat} color={CATEGORY_COLORS[cat]} label={tr[cat]} />
                ))}
              </div>
            </div>
            <Badge
              variant="secondary"
              className="text-xs shrink-0 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              {tr.nodeClickHint}
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}

// Stable callback utility used by KnowledgeTab
export function useRelationGraph(firebaseUser: { getIdToken: () => Promise<string> } | null) {
  const [graph, setGraph] = useState<EntityRelationGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError('Failed to load relation graph');
    } finally {
      setLoading(false);
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
    } catch {
      setError('Failed to generate relation graph');
    } finally {
      setGenerating(false);
    }
  }, [firebaseUser]);

  return { graph, loading, generating, error, fetchGraph, generateGraph };
}
