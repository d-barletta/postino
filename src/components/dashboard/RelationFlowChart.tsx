'use client';

import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  Position,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import type { ElkExtendedEdge, ElkEdgeSection } from 'elkjs';
import { toast } from 'sonner';
import { AlertCircle, Eye, EyeOff, Maximize2, RefreshCw, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import type { EntityFlowGraph, EntityGraphNodeCategory } from '@/types';
import { CATEGORY_COLORS } from './RelationGraph';

// ---------------------------------------------------------------------------
// Node size constants per category shape
// ---------------------------------------------------------------------------
const NODE_DIMS: Record<EntityGraphNodeCategory, { w: number; h: number }> = {
  people: { w: 72, h: 72 },
  organizations: { w: 130, h: 44 },
  places: { w: 92, h: 80 },
  events: { w: 88, h: 64 },
  topics: { w: 110, h: 38 },
  tags: { w: 90, h: 32 },
};

// ---------------------------------------------------------------------------
// Custom node data type
// ---------------------------------------------------------------------------
type FlowNodeData = {
  label: string;
  category: EntityGraphNodeCategory;
  count: number;
  bucketLabel: string;
  bucketIndex: number;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
};

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 8,
  height: 8,
};

function LabelText({
  label,
  color,
  style,
}: {
  label: string;
  color: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        color,
        textAlign: 'center',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
        lineHeight: 1.3,
        maxWidth: '100%',
        ...style,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Node shapes
// ---------------------------------------------------------------------------
function PeopleNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['people'];
  const { w, h } = NODE_DIMS['people'];
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'people')}
      style={{
        width: w,
        height: h,
        borderRadius: '50%',
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: `0 0 10px ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

function OrgNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['organizations'];
  const { w, h } = NODE_DIMS['organizations'];
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'organizations')}
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: `0 0 10px ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

function PlaceNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['places'];
  const { w, h } = NODE_DIMS['places'];
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 1;
  const ry = h / 2 - 1;
  const pts = [0, 60, 120, 180, 240, 300]
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return `${cx + rx * Math.cos(rad)},${cy + ry * Math.sin(rad)}`;
    })
    .join(' ');
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'places')}
      style={{ width: w, height: h, position: 'relative', cursor: 'pointer' }}
    >
      <Handle type="target" position={Position.Top} style={{ ...HANDLE_STYLE, top: 2 }} />
      <svg
        width={w}
        height={h}
        style={{ position: 'absolute', top: 0, left: 0 }}
        overflow="visible"
      >
        <polygon
          points={pts}
          fill={`${color}26`}
          stroke={color}
          strokeWidth={2}
          filter={`drop-shadow(0 0 4px ${color}66)`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 10,
        }}
      >
        <LabelText label={data.label} color={color} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ ...HANDLE_STYLE, bottom: 2 }} />
    </div>
  );
}

function EventNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['events'];
  const { w, h } = NODE_DIMS['events'];
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'events')}
      style={{ width: w, height: h, position: 'relative', cursor: 'pointer' }}
    >
      <Handle type="target" position={Position.Top} style={{ ...HANDLE_STYLE, top: 0 }} />
      <svg
        width={w}
        height={h}
        style={{ position: 'absolute', top: 0, left: 0 }}
        overflow="visible"
      >
        <polygon
          points={points}
          fill={`${color}26`}
          stroke={color}
          strokeWidth={2}
          filter={`drop-shadow(0 0 4px ${color}66)`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 14px',
        }}
      >
        <LabelText label={data.label} color={color} style={{ fontSize: 9 }} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ ...HANDLE_STYLE, bottom: 0 }} />
    </div>
  );
}

function TopicNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['topics'];
  const { w, h } = NODE_DIMS['topics'];
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'topics')}
      style={{
        width: w,
        height: h,
        borderRadius: 9999,
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: `0 0 10px ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 14px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ WebkitLineClamp: 1 }} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

function TagNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['tags'];
  const { w, h } = NODE_DIMS['tags'];
  return (
    <div
      title={data.bucketLabel}
      onClick={() => data.onNodeClick(data.label, 'tags')}
      style={{
        width: w,
        height: h,
        borderRadius: 9999,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 6px ${color}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ fontSize: 9, WebkitLineClamp: 1 }} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  people: PeopleNode as unknown as NodeTypes[string],
  organizations: OrgNode as unknown as NodeTypes[string],
  places: PlaceNode as unknown as NodeTypes[string],
  events: EventNode as unknown as NodeTypes[string],
  topics: TopicNode as unknown as NodeTypes[string],
  tags: TagNode as unknown as NodeTypes[string],
};

// ---------------------------------------------------------------------------
// Custom edge type — draws the path ELK calculated (section waypoints)
// ---------------------------------------------------------------------------
type ElkEdgeData = {
  elkPath: string;
  strokeWidth: number;
  stroke: string;
  opacity: number;
};

function ElkEdge({ data, markerEnd, style }: EdgeProps & { data: ElkEdgeData }) {
  const d = data?.elkPath ?? '';
  return (
    <BaseEdge
      path={d}
      markerEnd={markerEnd}
      style={{
        strokeWidth: data?.strokeWidth ?? 1,
        stroke: data?.stroke ?? '#475569',
        opacity: data?.opacity ?? 0.5,
        ...style,
      }}
    />
  );
}

const EDGE_TYPES: EdgeTypes = {
  elk: ElkEdge as unknown as EdgeTypes[string],
};

// ---------------------------------------------------------------------------
// Build an SVG path string from ELK edge sections
// ---------------------------------------------------------------------------
type ElkPoint = { x: number; y: number };

function elkSectionsToPath(sections: ElkEdgeSection[]): string {
  if (!sections || sections.length === 0) return '';
  const points: ElkPoint[] = [];
  for (const sec of sections) {
    if (points.length === 0) points.push(sec.startPoint);
    if (sec.bendPoints) points.push(...sec.bendPoints);
    points.push(sec.endPoint);
  }
  if (points.length < 2) return '';
  // Build a smooth cubic bezier through all waypoints (Catmull-Rom → Bezier)
  // This produces a natural curve that faithfully follows ELK's routing
  let d = `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    d += ` L ${points[1].x} ${points[1].y}`;
    return d;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    // Catmull-Rom to cubic bezier (tension = 0.5)
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// ELK layout: USER_DEFINED layering — bucketIndex drives the Y layer
// ---------------------------------------------------------------------------
async function computeElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
  hiddenCategories: Set<EntityGraphNodeCategory>,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const ELKModule = await import('elkjs/lib/elk.bundled.js');
  const ELK = ELKModule.default;
  const elk = new ELK();

  const visibleNodes = rawNodes.filter(
    (n) => !hiddenCategories.has(n.data?.category as EntityGraphNodeCategory),
  );
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = rawEdges.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.layering.strategy': 'USER_DEFINED',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '55',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeRouting': 'SPLINES',
      'elk.layered.edgeRouting.splines.mode': 'SLOPPY',
    },
    children: visibleNodes.map((n) => {
      const cat = n.data?.category as EntityGraphNodeCategory;
      const dims = NODE_DIMS[cat] ?? { w: 100, h: 40 };
      const bucketIndex = (n.data?.bucketIndex as number) ?? 0;
      return {
        id: n.id,
        width: dims.w,
        height: dims.h,
        layoutOptions: {
          'elk.layered.layering.userDefinedNode.layer': String(bucketIndex),
        },
      };
    }),
    edges: visibleEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(elkGraph);

  // Map positioned nodes
  const positionedNodes = rawNodes.map((n) => {
    const child = layout.children?.find((c) => c.id === n.id);
    if (!child) {
      return { ...n, position: { x: -9999, y: -9999 }, hidden: true };
    }
    return {
      ...n,
      position: { x: child.x ?? 0, y: child.y ?? 0 },
      hidden: false,
    };
  });

  // Build edges with ELK-calculated paths
  const elkEdgeMap = new Map<string, ElkEdgeSection[]>();
  if (layout.edges) {
    for (const el of layout.edges as ElkExtendedEdge[]) {
      if (el.sections && el.sections.length > 0) {
        elkEdgeMap.set(el.id, el.sections);
      }
    }
  }

  const routedEdges: Edge[] = rawEdges.map((e) => {
    const sections = elkEdgeMap.get(e.id);
    const elkPath = sections ? elkSectionsToPath(sections) : '';
    if (!elkPath) {
      // Edge not routed (hidden node) — keep as-is but mark hidden
      return { ...e, hidden: true };
    }
    return {
      ...e,
      type: 'elk',
      hidden: false,
      data: {
        ...(e.data ?? {}),
        elkPath,
        strokeWidth: (e.style?.strokeWidth as number) ?? 1,
        stroke: (e.style?.stroke as string) ?? '#475569',
        opacity: (e.style?.opacity as number) ?? 0.5,
      },
    };
  });

  return { nodes: positionedNodes, edges: routedEdges };
}

// ---------------------------------------------------------------------------
// Legend item (matches RelationGraph style)
// ---------------------------------------------------------------------------
function FlowLegendItem({
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
// Skeleton
// ---------------------------------------------------------------------------
function FlowSkeleton() {
  return (
    <div
      className="flex items-center justify-center h-[500px] rounded-2xl animate-pulse"
      style={{ backgroundColor: 'var(--surface-muted)' }}
    >
      <Workflow className="h-16 w-16 opacity-10 text-gray-600 dark:text-white" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner ReactFlow canvas (must be inside ReactFlowProvider)
// ---------------------------------------------------------------------------
interface RelationFlowInnerProps {
  graph: EntityFlowGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  hiddenCategories: Set<EntityGraphNodeCategory>;
}

function RelationFlowInner({ graph, onNodeClick, hiddenCategories }: RelationFlowInnerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layouting, setLayouting] = useState(true);
  const prevGraphRef = useRef<EntityFlowGraph | null>(null);

  const rawNodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.category,
        position: { x: 0, y: 0 },
        data: {
          label: n.label,
          category: n.category,
          count: n.count,
          bucketLabel: n.bucketLabel,
          bucketIndex: n.bucketIndex,
          onNodeClick,
        },
      })),
    [graph.nodes, onNodeClick],
  );

  const rawEdges: Edge[] = useMemo(() => {
    const maxWeight = Math.max(...graph.edges.map((e) => e.weight), 1);
    return graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: {
        strokeWidth: 0.8 + (e.weight / maxWeight) * 2.5,
        stroke: '#475569',
        opacity: 0.5,
      },
      animated: false,
    }));
  }, [graph.edges]);

  useEffect(() => {
    const graphChanged = prevGraphRef.current !== graph;
    prevGraphRef.current = graph;
    if (rawNodes.length === 0) {
      setLayouting(false);
      return;
    }
    if (graphChanged) setLayouting(true);
    computeElkLayout(rawNodes, rawEdges, hiddenCategories)
      .then(({ nodes: positioned, edges: routedEdges }) => {
        setNodes(positioned);
        setEdges(routedEdges);
      })
      .catch(() => {
        const positioned = rawNodes.map((n, i) => ({
          ...n,
          position: { x: (i % 5) * 160, y: Math.floor(i / 5) * 110 },
        }));
        setNodes(positioned);
        setEdges(rawEdges);
      })
      .finally(() => setLayouting(false));
  }, [rawNodes, rawEdges, hiddenCategories, setNodes, setEdges, graph]);

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  return (
    <div className="relative h-full w-full">
      {layouting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 dark:bg-gray-900/60">
          <Workflow className="h-10 w-10 opacity-20 animate-pulse text-gray-600 dark:text-white" />
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: false }}
        style={{ background: 'transparent', borderRadius: '1rem' }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.1}
        maxZoom={4}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? '#374151' : '#d1d5db'}
        />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export interface RelationFlowChartProps {
  graph: EntityFlowGraph | null;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  onExpandFullPage?: () => void;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  translations: {
    legend: string;
    topics: string;
    people: string;
    organizations: string;
    places: string;
    events: string;
    tags: string;
    flowNodeClick: string;
    flowNoGraph: string;
    flowNoGraphDesc: string;
    flowGenerate: string;
    flowGenerating: string;
    flowRegenerate: string;
    flowGeneratedOn: string;
    flowTotalEmails: string;
    expandFullPage: string;
  };
}

export function RelationFlowChart({
  graph,
  loading,
  generating,
  onGenerate,
  onExpandFullPage,
  onNodeClick,
  translations: tr,
}: RelationFlowChartProps) {
  const isEmpty = graph && graph.nodes.length === 0;
  const isResolvingInitialState = loading && !graph && !generating;
  const formattedDate = graph?.generatedAt ? new Date(graph.generatedAt).toLocaleString() : null;

  const [hiddenCategories, setHiddenCategories] = useState<Set<EntityGraphNodeCategory>>(
    () => new Set<EntityGraphNodeCategory>(['tags']),
  );

  const toggleCategory = useCallback((cat: EntityGraphNodeCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
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
              {tr.flowGeneratedOn.replace('{date}', formattedDate)}
              {' · '}
              {tr.flowTotalEmails.replace('{count}', String(graph.totalEmails))}
            </p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {graph && !isEmpty && onExpandFullPage && (
            <Button size="sm" variant="ghost" onClick={onExpandFullPage}>
              <Maximize2 className="h-4 w-4" />
              {tr.expandFullPage}
            </Button>
          )}
          {isResolvingInitialState ? (
            <div
              className="h-9 w-36 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"
              aria-label="Loading flow actions"
            />
          ) : (
            <Button
              onClick={onGenerate}
              disabled={generating}
              size="sm"
              variant={graph ? 'ghost' : 'primary'}
            >
              <RefreshCw className={cn('h-4 w-4', generating && 'animate-spin')} />
              {generating ? tr.flowGenerating : graph ? tr.flowRegenerate : tr.flowGenerate}
            </Button>
          )}
        </div>
      </div>

      {/* Flow area */}
      {loading && <FlowSkeleton />}

      {!loading && !graph && !generating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <Workflow className="h-12 w-12 text-gray-300 dark:text-gray-600" />
          <div className="text-center">
            <p className="text-base font-medium text-gray-600 dark:text-gray-400">
              {tr.flowNoGraph}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
              {tr.flowNoGraphDesc}
            </p>
          </div>
          <Button
            onClick={onGenerate}
            className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
          >
            <Workflow className="h-4 w-4" />
            {tr.flowGenerate}
          </Button>
        </div>
      )}

      {!loading && generating && !graph && <FlowSkeleton />}

      {!loading && graph && isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <AlertCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tr.flowNoGraph}</p>
        </div>
      )}

      {!loading && graph && !isEmpty && (
        <>
          {/* Canvas */}
          <div className="h-[calc(50vh-120px)] sm:h-[500px]">
            <ReactFlowProvider>
              <RelationFlowInner
                graph={graph}
                onNodeClick={onNodeClick}
                hiddenCategories={hiddenCategories}
              />
            </ReactFlowProvider>
          </div>

          {/* Legend — below the chart, not inside the canvas */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {tr.legend}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
                <FlowLegendItem
                  key={cat}
                  color={CATEGORY_COLORS[cat]}
                  label={tr[cat]}
                  active={!hiddenCategories.has(cat)}
                  onClick={() => toggleCategory(cat)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
              <span className="text-xs text-gray-400 dark:text-gray-500">{tr.flowNodeClick}</span>
              {graph.buckets && graph.buckets.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {graph.buckets[0].label} → {graph.buckets[graph.buckets.length - 1].label}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-page content component (used inside the full-screen Dialog)
// ---------------------------------------------------------------------------
export function RelationFlowChartFullPageContent({
  graph,
  onNodeClick,
  translations: tr,
}: {
  graph: EntityFlowGraph;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
  translations: Pick<
    RelationFlowChartProps['translations'],
    'legend' | 'flowNodeClick' | 'topics' | 'people' | 'organizations' | 'places' | 'events' | 'tags'
  >;
}) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<EntityGraphNodeCategory>>(
    () => new Set<EntityGraphNodeCategory>(['tags']),
  );

  const toggleCategory = useCallback((cat: EntityGraphNodeCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <RelationFlowInner
            graph={graph}
            onNodeClick={onNodeClick}
            hiddenCategories={hiddenCategories}
          />
        </ReactFlowProvider>
      </div>
      <div className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {tr.legend}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(Object.keys(CATEGORY_COLORS) as EntityGraphNodeCategory[]).map((cat) => (
              <FlowLegendItem
                key={cat}
                color={CATEGORY_COLORS[cat]}
                label={tr[cat]}
                active={!hiddenCategories.has(cat)}
                onClick={() => toggleCategory(cat)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">{tr.flowNodeClick}</span>
            {graph.buckets && graph.buckets.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {graph.buckets[0].label} → {graph.buckets[graph.buckets.length - 1].label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// useFlowGraph hook — dedicated hook for the date-based flow API
// ---------------------------------------------------------------------------
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
