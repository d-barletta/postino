'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  Panel,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import { Share2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EntityRelationGraph, EntityGraphNodeCategory } from '@/types';
import { CATEGORY_COLORS } from './RelationGraph';

// ---------------------------------------------------------------------------
// Node size constants per category shape
// ---------------------------------------------------------------------------
const NODE_DIMS: Record<EntityGraphNodeCategory, { w: number; h: number }> = {
  people: { w: 68, h: 68 },         // circle
  organizations: { w: 130, h: 44 }, // rectangle
  places: { w: 90, h: 78 },         // hexagon
  events: { w: 84, h: 62 },         // diamond
  topics: { w: 110, h: 38 },        // pill
  tags: { w: 90, h: 32 },           // tag/pill (small)
};

// ---------------------------------------------------------------------------
// Custom node data type
// ---------------------------------------------------------------------------
type FlowNodeData = {
  label: string;
  category: EntityGraphNodeCategory;
  count: number;
  onNodeClick: (label: string, category: EntityGraphNodeCategory) => void;
};

// ---------------------------------------------------------------------------
// Shared handle styles (invisible – connections are visible via edges)
// ---------------------------------------------------------------------------
const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 8,
  height: 8,
};

// ---------------------------------------------------------------------------
// Helper: entity label text style
// ---------------------------------------------------------------------------
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
// PeopleNode — circle
// ---------------------------------------------------------------------------
function PeopleNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['people'];
  const { w, h } = NODE_DIMS['people'];
  return (
    <div
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

// ---------------------------------------------------------------------------
// OrgNode — rounded rectangle
// ---------------------------------------------------------------------------
function OrgNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['organizations'];
  const { w, h } = NODE_DIMS['organizations'];
  return (
    <div
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

// ---------------------------------------------------------------------------
// PlaceNode — hexagon (SVG-based)
// ---------------------------------------------------------------------------
function PlaceNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['places'];
  const { w, h } = NODE_DIMS['places'];
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 1;
  const ry = h / 2 - 1;
  // Flat-top hexagon points
  const pts = [
    [cx + rx * Math.cos((Math.PI / 180) * 30), cy + ry * Math.sin((Math.PI / 180) * 30)],
    [cx + rx * Math.cos((Math.PI / 180) * 90), cy + ry * Math.sin((Math.PI / 180) * 90)],
    [cx + rx * Math.cos((Math.PI / 180) * 150), cy + ry * Math.sin((Math.PI / 180) * 150)],
    [cx + rx * Math.cos((Math.PI / 180) * 210), cy + ry * Math.sin((Math.PI / 180) * 210)],
    [cx + rx * Math.cos((Math.PI / 180) * 270), cy + ry * Math.sin((Math.PI / 180) * 270)],
    [cx + rx * Math.cos((Math.PI / 180) * 330), cy + ry * Math.sin((Math.PI / 180) * 330)],
  ]
    .map((p) => p.join(','))
    .join(' ');

  return (
    <div
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

// ---------------------------------------------------------------------------
// EventNode — diamond (SVG-based)
// ---------------------------------------------------------------------------
function EventNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['events'];
  const { w, h } = NODE_DIMS['events'];
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;

  return (
    <div
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

// ---------------------------------------------------------------------------
// TopicNode — pill / ellipse
// ---------------------------------------------------------------------------
function TopicNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['topics'];
  const { w, h } = NODE_DIMS['topics'];
  return (
    <div
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

// ---------------------------------------------------------------------------
// TagNode — small rounded pill
// ---------------------------------------------------------------------------
function TagNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['tags'];
  const { w, h } = NODE_DIMS['tags'];
  return (
    <div
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

// ---------------------------------------------------------------------------
// Node types registry
// ---------------------------------------------------------------------------
const NODE_TYPES: NodeTypes = {
  people: PeopleNode,
  organizations: OrgNode,
  places: PlaceNode,
  events: EventNode,
  topics: TopicNode,
  tags: TagNode,
};

// ---------------------------------------------------------------------------
// ELK layout helper
// ---------------------------------------------------------------------------
async function computeElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
  hiddenCategories: Set<EntityGraphNodeCategory>,
): Promise<Node[]> {
  const ELKModule = await import('elkjs/lib/elk.bundled.js');
  const ELK = ELKModule.default;
  const elk = new ELK();

  const visibleNodes = rawNodes.filter(
    (n) => !hiddenCategories.has(n.data?.category as EntityGraphNodeCategory),
  );
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = rawEdges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  );

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
    },
    children: visibleNodes.map((n) => {
      const cat = n.data?.category as EntityGraphNodeCategory;
      const dims = NODE_DIMS[cat] ?? { w: 100, h: 40 };
      return { id: n.id, width: dims.w, height: dims.h };
    }),
    edges: visibleEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const layout = await elk.layout(elkGraph);

  return rawNodes.map((n) => {
    const child = layout.children?.find((c) => c.id === n.id);
    if (!child) {
      // Hidden node — place off-screen
      return { ...n, position: { x: -9999, y: -9999 }, hidden: true };
    }
    return {
      ...n,
      position: { x: child.x ?? 0, y: child.y ?? 0 },
      hidden: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Legend item
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
      <Share2 className="h-16 w-16 opacity-10 text-gray-600 dark:text-white" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner flow component (needs to be inside ReactFlowProvider)
// ---------------------------------------------------------------------------
interface RelationFlowInnerProps {
  graph: EntityRelationGraph;
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
  };
}

function RelationFlowInner({ graph, onNodeClick, translations: tr }: RelationFlowInnerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layouting, setLayouting] = useState(true);

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

  // Build raw nodes/edges from graph data (memoized to avoid unnecessary ELK re-runs)
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
        strokeWidth: 0.8 + (e.weight / maxWeight) * 2,
        stroke: '#475569',
        opacity: 0.55,
      },
      animated: false,
    }));
  }, [graph.edges]);

  // Run ELK layout whenever graph data or hidden categories change
  useEffect(() => {
    if (rawNodes.length === 0) {
      setLayouting(false);
      return;
    }
    setLayouting(true);
    computeElkLayout(rawNodes, rawEdges, hiddenCategories)
      .then((positioned) => {
        setNodes(positioned);
        setEdges(rawEdges);
      })
      .catch(() => {
        // Fallback: simple grid positioning
        const positioned = rawNodes.map((n, i) => ({
          ...n,
          position: { x: (i % 5) * 160, y: Math.floor(i / 5) * 100 },
        }));
        setNodes(positioned);
        setEdges(rawEdges);
      })
      .finally(() => setLayouting(false));
  }, [rawNodes, rawEdges, hiddenCategories, setNodes, setEdges]);

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  return (
    <div className="relative h-full w-full">
      {layouting && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 dark:bg-gray-900/60">
          <Share2 className="h-10 w-10 opacity-20 animate-pulse text-gray-600 dark:text-white" />
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: false }}
        style={{
          background: 'transparent',
          borderRadius: '1rem',
        }}
        nodesDraggable={true}
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
        <Controls
          position="bottom-right"
          showInteractive={false}
          style={{
            background: isDark ? '#1f2937' : '#ffffff',
            border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        />
        <Panel position="bottom-left" style={{ margin: 12 }}>
          <div
            className="space-y-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 px-3 py-2.5 backdrop-blur-sm"
            style={{ minWidth: 140 }}
          >
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {tr.legend}
            </p>
            <div className="flex flex-col gap-1">
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
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 pt-1 border-t border-gray-100 dark:border-gray-800">
              {tr.flowNodeClick}
            </p>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
export interface RelationFlowChartProps {
  graph: EntityRelationGraph | null;
  loading: boolean;
  generating: boolean;
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
    noGraph: string;
    noGraphDesc: string;
  };
}

export function RelationFlowChart({
  graph,
  loading,
  generating,
  onNodeClick,
  translations: tr,
}: RelationFlowChartProps) {
  const isEmpty = graph && graph.nodes.length === 0;

  if (loading) return <FlowSkeleton />;

  if (!graph && !generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
        <Share2 className="h-12 w-12 text-gray-300 dark:text-gray-600" />
        <div className="text-center">
          <p className="text-base font-medium text-gray-600 dark:text-gray-400">{tr.noGraph}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
            {tr.noGraphDesc}
          </p>
        </div>
      </div>
    );
  }

  if (generating && !graph) return <FlowSkeleton />;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
        <AlertCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr.noGraph}</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(50vh-120px)] sm:h-[500px]">
      <ReactFlowProvider>
        <RelationFlowInner graph={graph!} onNodeClick={onNodeClick} translations={tr} />
      </ReactFlowProvider>
    </div>
  );
}
