'use client';

import { toast } from 'sonner';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type cytoscape from 'cytoscape';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Share2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { EntityRelationGraph, EntityGraphNodeCategory } from '@/types';

// ---------------------------------------------------------------------------
// Category colours
// ---------------------------------------------------------------------------
export const CATEGORY_COLORS: Record<EntityGraphNodeCategory, string> = {
  topics: '#818cf8', // indigo-400
  people: '#4ade80', // green-400
  organizations: '#fb923c', // orange-400
  places: '#38bdf8', // sky-400
  events: '#f9a8d4', // pink-300
  numbers: '#f87171', // red-400
  tags: '#c084fc', // purple-400
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
    openRelatedEmails: string;
    expandFullPage: string;
    closeFullPage: string;
    legend: string;
    topics: string;
    people: string;
    organizations: string;
    places: string;
    events: string;
    tags: string;
    numbers: string;
  };
}

type SelectedGraphNode = {
  id: string;
  label: string;
  category: EntityGraphNodeCategory;
};

// ---------------------------------------------------------------------------
// Skeleton while first loading
// ---------------------------------------------------------------------------
function GraphSkeleton() {
  return (
    <div
      className="flex items-center justify-center h-90 rounded-2xl animate-pulse"
      style={{ backgroundColor: 'var(--surface-muted)' }}
    >
      <Share2 className="h-16 w-16 opacity-10 text-gray-600 dark:text-white" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend item – interactive toggle
// ---------------------------------------------------------------------------
function LegendItem({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded px-1 -mx-1 transition-opacity cursor-pointer select-none',
        active ? 'opacity-100' : 'opacity-35',
      )}
      title={label}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{
          backgroundColor: color,
          boxShadow: active ? `0 0 5px ${color}` : undefined,
        }}
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      {active ? (
        <Eye className="h-3 w-3 text-gray-400 dark:text-gray-500" />
      ) : (
        <EyeOff className="h-3 w-3 text-gray-400 dark:text-gray-500" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Apply hidden categories to a cytoscape instance
// ---------------------------------------------------------------------------
function applyHiddenCategories(cy: cytoscape.Core, hiddenCategories: Set<EntityGraphNodeCategory>) {
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const cat = node.data('category') as EntityGraphNodeCategory;
      node.style('display', hiddenCategories.has(cat) ? 'none' : 'element');
    });
    cy.edges().forEach((edge) => {
      const srcHidden = hiddenCategories.has(
        edge.source().data('category') as EntityGraphNodeCategory,
      );
      const tgtHidden = hiddenCategories.has(
        edge.target().data('category') as EntityGraphNodeCategory,
      );
      edge.style('display', srcHidden || tgtHidden ? 'none' : 'element');
    });
  });
}

// ---------------------------------------------------------------------------
// Core cytoscape canvas — shared between inline and full-page
// ---------------------------------------------------------------------------
function CytoscapeCanvas({
  graph,
  onNodeClick,
  actionLabel,
  hiddenCategories = new Set<EntityGraphNodeCategory>(),
}: {
  graph: EntityRelationGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  actionLabel: string;
  hiddenCategories?: Set<EntityGraphNodeCategory>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const pinnedNodeIdRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<SelectedGraphNode | null>(null);
  const hiddenCategoriesRef = useRef(hiddenCategories);
  const [selectedNode, setSelectedNode] = useState<SelectedGraphNode | null>(null);
  const [isReady, setIsReady] = useState(false);
  hiddenCategoriesRef.current = hiddenCategories;

  const updateSelectedNode = useCallback((next: SelectedGraphNode | null) => {
    selectedNodeRef.current = next;
    setSelectedNode(next);
  }, []);

  const getLabelThemeColors = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return {
        labelColor: '#1f2937',
        labelBackgroundColor: '#f3f4f6',
        edgeColor: '#334155',
        edgeHighlightedColor: '#64748b',
      };
    }

    const styles = getComputedStyle(container);
    const labelColor = styles.getPropertyValue('--rg-label-color').trim() || '#1f2937';
    const labelBackgroundColor = styles.getPropertyValue('--rg-label-bg').trim() || '#f3f4f6';
    const edgeColor = styles.getPropertyValue('--rg-edge-color').trim() || '#334155';
    const edgeHighlightedColor =
      styles.getPropertyValue('--rg-edge-highlighted-color').trim() || '#64748b';

    return { labelColor, labelBackgroundColor, edgeColor, edgeHighlightedColor };
  }, []);

  const applyLabelThemeToCy = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const { labelColor, labelBackgroundColor, edgeColor, edgeHighlightedColor } =
      getLabelThemeColors();
    cy.nodes().style('color', labelColor);
    cy.nodes().style('text-background-color', labelBackgroundColor);
    cy.edges().not('.edge-highlighted').style('line-color', edgeColor);
    cy.edges('.edge-highlighted').style('line-color', edgeHighlightedColor);
    cy.style().update();
  }, [getLabelThemeColors]);

  const applyPinnedHighlight = useCallback((nodeId: string | null) => {
    const cy = cyRef.current;
    pinnedNodeIdRef.current = nodeId;
    if (!cy || cy.destroyed()) return;

    cy.elements().removeClass('faded highlighted node-selected edge-highlighted');
    if (nodeId) {
      const pinned = cy.getElementById(nodeId);
      cy.elements().addClass('faded');
      pinned.removeClass('faded').addClass('highlighted node-selected');
      const connEdges = pinned.connectedEdges();
      connEdges.removeClass('faded').addClass('edge-highlighted');
      connEdges.connectedNodes().removeClass('faded').addClass('highlighted');
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    applyLabelThemeToCy();

    const observer = new MutationObserver(() => {
      applyLabelThemeToCy();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, [applyLabelThemeToCy]);

  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return;

    let destroyed = false;
    setIsReady(false);
    updateSelectedNode(null);
    pinnedNodeIdRef.current = null;

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

      const { labelColor, labelBackgroundColor, edgeColor, edgeHighlightedColor } =
        getLabelThemeColors();

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
              'font-size': '8px',
              'font-weight': 400,
              color: labelColor,
              'text-margin-y': 6,
              'text-outline-width': 0,
              'text-background-color': labelBackgroundColor,
              'text-background-opacity': 0.58,
              'text-background-padding': '2px',
              'text-background-shape': 'roundrectangle',
              'text-wrap': 'ellipsis',
              'text-max-width': '100px',
              'min-zoomed-font-size': 6,
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
              width: (ele: cytoscape.EdgeSingular) => 0.8 + (ele.data('weight') / maxWeight) * 2.5,
              'line-color': edgeColor,
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
              'line-color': edgeHighlightedColor,
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

      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        if (pinnedNodeIdRef.current) return; // don't disturb pinned highlight on hover
        cy.elements().removeClass('faded highlighted edge-highlighted');
        cy.elements().addClass('faded');
        node.removeClass('faded').addClass('highlighted');
        const connEdges = node.connectedEdges();
        connEdges.removeClass('faded').addClass('edge-highlighted');
        connEdges.connectedNodes().removeClass('faded').addClass('highlighted');
      });

      cy.on('mouseout', 'node', () => {
        if (pinnedNodeIdRef.current) return;
        cy.elements().removeClass('faded highlighted edge-highlighted');
      });

      // First click pins selection. Re-click keeps selection; related emails open from overlay button.
      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeId = node.id() as string;
        if (pinnedNodeIdRef.current === nodeId) return;

        applyPinnedHighlight(nodeId);
        updateSelectedNode({
          id: nodeId,
          label: node.data('label') as string,
          category: node.data('category') as EntityGraphNodeCategory,
        });
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          updateSelectedNode(null);
          applyPinnedHighlight(null);
        }
      });

      cy.on('layoutstop', () => {
        if (!destroyed && !cy.destroyed()) {
          cy.fit(undefined, 40);
          applyHiddenCategories(cy, hiddenCategoriesRef.current);
          setIsReady(true);
        }
      });

      cyRef.current = cy;
      applyLabelThemeToCy();
      applyHiddenCategories(cy, hiddenCategoriesRef.current);

      const currentSelection = selectedNodeRef.current;
      if (currentSelection && hiddenCategoriesRef.current.has(currentSelection.category)) {
        updateSelectedNode(null);
        applyPinnedHighlight(null);
      }

      return cy;
    };

    const cyPromise = init();
    return () => {
      destroyed = true;
      cyPromise
        .then((cy) => {
          if (!cy || cy.destroyed()) return;
          if (cyRef.current === cy) cyRef.current = null;
          cy.removeAllListeners();
          cy.destroy();
          updateSelectedNode(null);
          pinnedNodeIdRef.current = null;
        })
        .catch(() => {});
    };
  }, [graph, applyLabelThemeToCy, applyPinnedHighlight, getLabelThemeColors, updateSelectedNode]);

  // Apply hidden categories whenever the set changes (after cy is initialised)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    applyHiddenCategories(cy, hiddenCategories);
    if (selectedNodeRef.current && hiddenCategories.has(selectedNodeRef.current.category)) {
      updateSelectedNode(null);
      applyPinnedHighlight(null);
    }
  }, [applyPinnedHighlight, hiddenCategories, updateSelectedNode]);

  return (
    <div className="relative h-full w-full">
      {!isReady && (
        <div className="absolute inset-0 z-10">
          <GraphSkeleton />
        </div>
      )}
      {selectedNode ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
          <Button
            type="button"
            size="sm"
            onClick={() => onNodeClick(selectedNode.label, selectedNode.category)}
            className="pointer-events-auto border border-[#efd957]/80 bg-white/95 text-gray-900 shadow-sm backdrop-blur hover:bg-[#fff4b0] dark:bg-gray-900/95 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {actionLabel}
          </Button>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={cn(
          'w-full h-full rounded-2xl overflow-hidden [--rg-label-color:#1f2937] [--rg-label-bg:#f3f4f6] [--rg-edge-color:#94a3b8] [--rg-edge-highlighted-color:#cbd5e1] dark:[--rg-label-color:#e2e8f0] dark:[--rg-label-bg:#1f2937] dark:[--rg-edge-color:#64748b] dark:[--rg-edge-highlighted-color:#94a3b8] transition-opacity duration-300',
          isReady ? 'opacity-100' : 'opacity-0',
        )}
        style={{ backgroundColor: 'transparent' }}
        aria-label="Entity relation graph"
      />
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
  const formattedDate = graph?.generatedAt ? new Date(graph.generatedAt).toLocaleString() : null;

  const isEmpty = graph && graph.nodes.length === 0;

  // Tags hidden by default; toggling a legend item shows/hides that category
  const [hiddenCategories, setHiddenCategories] = useState<Set<EntityGraphNodeCategory>>(
    () => new Set<EntityGraphNodeCategory>(['tags']),
  );

  const toggleCategory = useCallback((cat: EntityGraphNodeCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

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
      </div>

      {/* Graph area */}
      {loading && <GraphSkeleton />}

      {!loading && !graph && !generating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <Share2 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <div className="text-center">
            <p className="text-base font-medium text-gray-600 dark:text-gray-400">{tr.noGraph}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
              {tr.noGraphDesc}
            </p>
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
          {/* Cytoscape container — calc(50vh - 120px) on mobile, 500 px on sm+ */}
          <div className="h-[calc(50vh-120px)] sm:h-125">
            <CytoscapeCanvas
              graph={graph}
              onNodeClick={onNodeClick}
              actionLabel={tr.openRelatedEmails}
              hiddenCategories={hiddenCategories}
            />
          </div>

          {/* Legend + hint */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {tr.legend}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
                  <LegendItem
                    key={cat}
                    color={CATEGORY_COLORS[cat]}
                    label={tr[cat]}
                    active={!hiddenCategories.has(cat)}
                    onClick={() => toggleCategory(cat)}
                  />
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
// Full-page graph dialog content (canvas + legend, used inside RelationsTab dialog)
// ---------------------------------------------------------------------------
export function RelationGraphFullPageContent({
  graph,
  onNodeClick,
  translations: tr,
}: {
  graph: EntityRelationGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  translations: Pick<
    RelationGraphProps['translations'],
    | 'legend'
    | 'nodeClickHint'
    | 'nodeClickHint2'
    | 'openRelatedEmails'
    | 'topics'
    | 'people'
    | 'organizations'
    | 'places'
    | 'events'
    | 'tags'
    | 'numbers'
  >;
}) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<EntityGraphNodeCategory>>(
    () => new Set<EntityGraphNodeCategory>(['tags']),
  );

  const toggleCategory = useCallback((cat: EntityGraphNodeCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <CytoscapeCanvas
          graph={graph}
          onNodeClick={onNodeClick}
          actionLabel={tr.openRelatedEmails}
          hiddenCategories={hiddenCategories}
        />
      </div>
      <div className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {tr.legend}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
                <LegendItem
                  key={cat}
                  color={CATEGORY_COLORS[cat]}
                  label={tr[cat]}
                  active={!hiddenCategories.has(cat)}
                  onClick={() => toggleCategory(cat)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">{tr.nodeClickHint}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{tr.nodeClickHint2}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useRelationGraph hook
// ---------------------------------------------------------------------------
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
