'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { RefreshCw, Share2, AlertCircle, Maximize2 } from 'lucide-react';
import type { EntityRelationGraph, EntityGraphNodeCategory } from '@/types';

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------
export const CATEGORY_COLORS: Record<EntityGraphNodeCategory, string> = {
  topics: '#818cf8',      // indigo-400
  people: '#4ade80',      // green-400
  organizations: '#fb923c', // orange-400
  places: '#38bdf8',      // sky-400
  events: '#f472b6',      // pink-400
  tags: '#c084fc',        // purple-400
};



// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RelationGraphProps {
  graph: EntityRelationGraph | null;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  /** Called when a node is clicked a second time (already selected). */
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  onExpandFullPage?: () => void;
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
    nodeClickHint2: string;
    expandFullPage: string;
    closeFullPage: string;
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
    <div className="flex items-center justify-center h-130 rounded-2xl bg-gray-100 dark:bg-[#0d1117] animate-pulse">
      <Share2 className="h-16 w-16 opacity-10 text-gray-600 dark:text-white" />
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
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core cytoscape canvas — shared between inline and full-page
// ---------------------------------------------------------------------------
function CytoscapeCanvas({
  graph,
  onNodeClick,
}: {
  graph: EntityRelationGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const root = document.documentElement;

    const syncTheme = () => setIsDarkMode(root.classList.contains('dark'));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    cy.nodes().style('color', isDarkMode ? '#e2e8f0' : '#1f2937');
    cy.nodes().style('text-background-color', isDarkMode ? '#0d1117' : '#f3f4f6');
    cy.style().update();
  }, [isDarkMode]);

  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return;

    let destroyed = false;

    const init = async (): Promise<cytoscape.Core | undefined> => {
      const { default: cytoscape } = await import('cytoscape');
      if (destroyed || !containerRef.current) return undefined;

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

      // Set deterministic initial positions so the cose layout converges
      // to the same result every time (randomize: false uses current positions).
      const nodeCount = elements.filter((e) => !('source' in e.data)).length;
      const initialRadius = Math.max(150, nodeCount * 20);
      const positionedElements = elements.map((el, i) => {
        if ('source' in el.data) return el; // edge — no position needed
        const nodeIndex = elements.filter((e, j) => j < i && !('source' in e.data)).length;
        const angle = (2 * Math.PI * nodeIndex) / nodeCount;
        return {
          ...el,
          position: {
            x: initialRadius * Math.cos(angle),
            y: initialRadius * Math.sin(angle),
          },
        };
      });

      const cy = cytoscape({
        container: containerRef.current,
        elements: positionedElements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (ele: cytoscape.NodeSingular) =>
                CATEGORY_COLORS[ele.data('category') as EntityGraphNodeCategory] ?? '#888',
              'border-color': (ele: cytoscape.NodeSingular) =>
                CATEGORY_COLORS[ele.data('category') as EntityGraphNodeCategory] ?? '#888',
              'border-width': 0.5,
              'border-opacity': 0.6,
              label: 'data(label)',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'font-size': '10px',
              'font-weight': 400,
              color: isDarkMode ? '#e2e8f0' : '#1f2937',
              'text-margin-y': 6,
              'text-outline-width': 0,
              'text-background-color': isDarkMode ? '#0d1117' : '#f3f4f6',
              'text-background-opacity': 0.58,
              'text-background-padding': '2px',
              'text-background-shape': 'roundrectangle',
              'text-wrap': 'ellipsis',
              'text-max-width': '100px',
              'min-zoomed-font-size': 7,
              width: (ele: cytoscape.NodeSingular) => {
                const ratio =
                  maxCount === minCount
                    ? 0.5
                    : (ele.data('count') - minCount) / (maxCount - minCount);
                return 18 + ratio * 28;
              },
              height: (ele: cytoscape.NodeSingular) => {
                const ratio =
                  maxCount === minCount
                    ? 0.5
                    : (ele.data('count') - minCount) / (maxCount - minCount);
                return 18 + ratio * 28;
              },
              'outline-color': (ele: cytoscape.NodeSingular) =>
                CATEGORY_COLORS[ele.data('category') as EntityGraphNodeCategory] ?? '#888',
              'outline-width': 2,
              'outline-opacity': 0.35,
              'outline-offset': 2,
              'overlay-padding': 8,
            },
          },
          {
            selector: 'edge',
            style: {
              width: (ele: cytoscape.EdgeSingular) =>
                0.8 + (ele.data('weight') / maxWeight) * 2.5,
              'line-color': '#334155',
              opacity: 0.6,
              'curve-style': 'bezier',
              'overlay-padding': 4,
            },
          },
          {
            selector: '.faded',
            style: { opacity: 0.08 },
          },
          {
            selector: '.highlighted',
            style: { opacity: 1 },
          },
          {
            selector: '.edge-highlighted',
            style: {
              'line-color': '#64748b',
              opacity: 0.7,
            },
          },
          {
            selector: '.node-selected',
            style: {
              'border-color': '#efd957',
              'border-width': 3,
              'border-opacity': 1,
              'outline-color': '#efd957',
              'outline-width': 10,
              'outline-opacity': 0.6,
              'outline-offset': 2,
            },
          },
        ],
        layout: {
          name: 'cose',
          animate: true,
          randomize: false,
          nodeRepulsion: () => 150000,
          idealEdgeLength: () => 50,
          edgeElasticity: () => 150,
          nodeOverlap: 350,
          gravity: 0.15,
          numIter: 1500,
          initialTemp: 250,
          coolingFactor: 0.95,
          minTemp: 1.0,
        } as cytoscape.CoseLayoutOptions,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        minZoom: 0.15,
        maxZoom: 5,
      });

      // ---- interactions ----
      let pinnedNodeId: string | null = null;

      const applyPinnedHighlight = (nodeId: string | null) => {
        cy.elements().removeClass('faded highlighted node-selected edge-highlighted');
        if (nodeId) {
          const pinned = cy.getElementById(nodeId);
          cy.elements().addClass('faded');
          pinned.removeClass('faded').addClass('highlighted node-selected');
          const connEdges = pinned.connectedEdges();
          connEdges.removeClass('faded').addClass('edge-highlighted');
          connEdges.connectedNodes().removeClass('faded').addClass('highlighted');
        }
      };

      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        if (pinnedNodeId) return; // don't disturb pinned highlight on hover
        cy.elements().removeClass('faded highlighted edge-highlighted');
        cy.elements().addClass('faded');
        node.removeClass('faded').addClass('highlighted');
        const connEdges = node.connectedEdges();
        connEdges.removeClass('faded').addClass('edge-highlighted');
        connEdges.connectedNodes().removeClass('faded').addClass('highlighted');
      });

      cy.on('mouseout', 'node', () => {
        if (pinnedNodeId) return;
        cy.elements().removeClass('faded highlighted edge-highlighted');
      });

      // First click → pin selection highlight only
      // Second click on same node → open modal
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeId = node.id() as string;
        if (pinnedNodeId === nodeId) {
          // second tap: open modal, keep selection
          onNodeClick(
            node.data('label') as string,
            node.data('category') as EntityGraphNodeCategory,
          );
        } else {
          // first tap: select only
          pinnedNodeId = nodeId;
          applyPinnedHighlight(pinnedNodeId);
        }
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          pinnedNodeId = null;
          applyPinnedHighlight(null);
        }
      });

      cy.on('layoutstop', () => {
        if (!destroyed && !cy.destroyed()) cy.fit(undefined, 40);
      });

      cyRef.current = cy;
      return cy;
    };

    const cyPromise = init();
    return () => {
      destroyed = true;
      cyPromise.then((cy) => {
        if (!cy || cy.destroyed()) return;
        if (cyRef.current === cy) cyRef.current = null;
        cy.removeAllListeners();
        cy.destroy();
      }).catch(() => {});
    };
  }, [graph, onNodeClick]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-[#0d1117]"
      aria-label="Entity relation graph"
    />
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
  onExpandFullPage,
  translations: tr,
}: RelationGraphProps) {
  const formattedDate = graph?.generatedAt
    ? new Date(graph.generatedAt).toLocaleString()
    : null;

  const isEmpty = graph && graph.nodes.length === 0;
  const isResolvingInitialState = loading && !graph && !generating;

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
        <div className="flex items-center gap-2">
          {graph && !isEmpty && onExpandFullPage && (
            <Button size="sm" variant="ghost" onClick={onExpandFullPage}>
              <Maximize2 className="h-4 w-4" />
              {tr.expandFullPage}
            </Button>
          )}
          {isResolvingInitialState ? (
            <div
              className="h-9 w-32 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"
              aria-label="Loading graph actions"
            />
          ) : (
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
          )}
        </div>
      </div>

      {/* Graph area */}
      {loading && <GraphSkeleton />}

      {!loading && !graph && !generating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
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
        <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <AlertCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tr.noGraph}</p>
        </div>
      )}

      {!loading && graph && !isEmpty && (
        <>
          {/* Cytoscape container */}
          <div style={{ height: 500 }}>
            <CytoscapeCanvas graph={graph} onNodeClick={onNodeClick} />
          </div>

          {/* Legend + hint */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {tr.legend}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
                  <LegendItem key={cat} color={CATEGORY_COLORS[cat]} label={tr[cat]} />
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-gray-400 dark:text-gray-500">{tr.nodeClickHint}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{tr.nodeClickHint2}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-page graph dialog content (canvas only, used inside RelationsTab dialog)
// ---------------------------------------------------------------------------
export function RelationGraphFullPageContent({
  graph,
  onNodeClick,
}: {
  graph: EntityRelationGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
}) {
  return <CytoscapeCanvas graph={graph} onNodeClick={onNodeClick} />;
}

// ---------------------------------------------------------------------------
// useRelationGraph hook
// ---------------------------------------------------------------------------
export function useRelationGraph(firebaseUser: { getIdToken: () => Promise<string> } | null) {
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
      setError('Failed to load relation graph');
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
    } catch {
      setError('Failed to generate relation graph');
    } finally {
      setGenerating(false);
    }
  }, [firebaseUser]);

  return { graph, hasFetched, loading, generating, error, fetchGraph, generateGraph };
}

