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
  MarkerType,
  Position,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import type { ElkExtendedEdge, ElkEdgeSection } from 'elkjs';
import { AlertCircle, Eye, EyeOff, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { EntityFlowGraph, EntityGraphNodeCategory } from '@/types';
import { CATEGORY_COLORS } from './graphCategoryColors';

// ---------------------------------------------------------------------------
// Node size constants per category shape
// ---------------------------------------------------------------------------
const NODE_DIMS: Record<EntityGraphNodeCategory, { w: number; h: number }> = {
  people: { w: 72, h: 72 },
  organizations: { w: 130, h: 44 },
  places: { w: 92, h: 80 },
  events: { w: 88, h: 64 },
  dates: { w: 96, h: 36 },
  topics: { w: 110, h: 38 },
  tags: { w: 90, h: 32 },
  numbers: { w: 120, h: 36 },
  prices: { w: 100, h: 36 },
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
  isSelected: boolean;
  isConnected: boolean;
  isDimmed: boolean;
};

type FlowNodeEmphasis = 'default' | 'connected' | 'selected' | 'dimmed';

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 8,
  height: 8,
};
const TARGET_HANDLE_POSITION = Position.Left;
const SOURCE_HANDLE_POSITION = Position.Right;
const FLOW_CATEGORY_ORDER: EntityGraphNodeCategory[] = [
  'people',
  'organizations',
  'events',
  'dates',
  'places',
  'topics',
  'tags',
  'numbers',
  'prices',
];
const FLOW_BUCKET_LAYER_SPAN = FLOW_CATEGORY_ORDER.length + 1;
const FLOW_CATEGORY_LAYER_INDEX = new Map(
  FLOW_CATEGORY_ORDER.map((category, index) => [category, index]),
);
const FLOW_EDGE_COLOR_LIGHT = '#475569';
const FLOW_EDGE_COLOR_DARK = '#94a3b8';
const FLOW_EDGE_HIGHLIGHT_COLOR = '#efd957';

function getFlowEdgeColor(isDark: boolean): string {
  return isDark ? FLOW_EDGE_COLOR_DARK : FLOW_EDGE_COLOR_LIGHT;
}

function getFlowNodeEmphasis(data: FlowNodeData): FlowNodeEmphasis {
  if (data.isSelected) return 'selected';
  if (data.isConnected) return 'connected';
  if (data.isDimmed) return 'dimmed';
  return 'default';
}

function getNodeFrameStyle(data: FlowNodeData): React.CSSProperties {
  const emphasis = getFlowNodeEmphasis(data);

  return {
    opacity: emphasis === 'dimmed' ? 0.22 : 1,
    transform: emphasis === 'selected' ? 'scale(1.04)' : undefined,
    filter: emphasis === 'selected' ? 'drop-shadow(0 0 8px rgba(239, 217, 87, 0.45))' : undefined,
    transition:
      'opacity 160ms ease, transform 160ms ease, filter 160ms ease, box-shadow 160ms ease',
  };
}

function getNodeBoxShadow(color: string, data: FlowNodeData, baseBlur: number): string {
  const emphasis = getFlowNodeEmphasis(data);

  if (emphasis === 'selected') {
    return `0 0 0 3px #efd957, 0 0 ${baseBlur + 4}px ${color}66`;
  }

  if (emphasis === 'connected') {
    return `0 0 ${baseBlur + 2}px ${color}55`;
  }

  if (emphasis === 'dimmed') {
    return `0 0 ${Math.max(baseBlur - 4, 2)}px ${color}22`;
  }

  return `0 0 ${baseBlur}px ${color}44`;
}

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
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: '50%',
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 10),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function OrgNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['organizations'];
  const { w, h } = NODE_DIMS['organizations'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 6,
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 10),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
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
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
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
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function EventNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['events'];
  const { w, h } = NODE_DIMS['events'];
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
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
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function TopicNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['topics'];
  const { w, h } = NODE_DIMS['topics'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 9999,
        background: `${color}26`,
        border: `2px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 10),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 14px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ WebkitLineClamp: 1 }} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function TagNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['tags'];
  const { w, h } = NODE_DIMS['tags'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 9999,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 6),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ fontSize: 9, WebkitLineClamp: 1 }} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function NumberNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['numbers'];
  const { w, h } = NODE_DIMS['numbers'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 6,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 6),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ fontSize: 9, WebkitLineClamp: 1 }} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function DateNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['dates'];
  const { w, h } = NODE_DIMS['dates'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 6,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 6),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ fontSize: 9, WebkitLineClamp: 1 }} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

function PriceNode({ data }: NodeProps & { data: FlowNodeData }) {
  const color = CATEGORY_COLORS['prices'];
  const { w, h } = NODE_DIMS['prices'];
  return (
    <div
      title={`${data.bucketLabel} (${data.count})`}
      style={{
        ...getNodeFrameStyle(data),
        width: w,
        height: h,
        borderRadius: 6,
        background: `${color}26`,
        border: `1.5px solid ${color}`,
        boxShadow: getNodeBoxShadow(color, data, 6),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        cursor: 'pointer',
      }}
    >
      <Handle type="target" position={TARGET_HANDLE_POSITION} style={HANDLE_STYLE} />
      <LabelText label={data.label} color={color} style={{ fontSize: 9, WebkitLineClamp: 1 }} />
      <Handle type="source" position={SOURCE_HANDLE_POSITION} style={HANDLE_STYLE} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  people: PeopleNode as unknown as NodeTypes[string],
  organizations: OrgNode as unknown as NodeTypes[string],
  places: PlaceNode as unknown as NodeTypes[string],
  events: EventNode as unknown as NodeTypes[string],
  dates: DateNode as unknown as NodeTypes[string],
  topics: TopicNode as unknown as NodeTypes[string],
  tags: TagNode as unknown as NodeTypes[string],
  numbers: NumberNode as unknown as NodeTypes[string],
  prices: PriceNode as unknown as NodeTypes[string],
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

function ElkEdge({ data, markerEnd, style, animated }: EdgeProps & { data: ElkEdgeData }) {
  const d = data?.elkPath ?? '';
  return (
    <>
      <BaseEdge
        path={d}
        markerEnd={markerEnd}
        style={{
          strokeWidth: data?.strokeWidth ?? 1,
          stroke: data?.stroke ?? FLOW_EDGE_COLOR_LIGHT,
          opacity: data?.opacity ?? 0.5,
          ...style,
        }}
      />
      {animated && d ? (
        <path
          d={d}
          fill="none"
          stroke={data?.stroke ?? FLOW_EDGE_COLOR_LIGHT}
          strokeWidth={(data?.strokeWidth ?? 1) + 0.4}
          strokeLinecap="round"
          strokeDasharray="10 8"
          opacity={0.95}
          className="pointer-events-none"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="18"
            to="0"
            dur="0.7s"
            repeatCount="indefinite"
          />
        </path>
      ) : null}
    </>
  );
}

const EDGE_TYPES: EdgeTypes = {
  elk: ElkEdge as unknown as EdgeTypes[string],
};

// ---------------------------------------------------------------------------
// Build an SVG path string from ELK edge sections (orthogonal straight lines)
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
  // Orthogonal path: straight line segments connecting each waypoint
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// ELK layout: USER_DEFINED layering — bucket and category drive the X layer
// ---------------------------------------------------------------------------
async function computeElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
  hiddenCategories: Set<EntityGraphNodeCategory>,
  defaultEdgeColor: string,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled');
  const elk = new ELK();

  const visibleNodes = rawNodes.filter(
    (n) => !hiddenCategories.has(n.data?.category as EntityGraphNodeCategory),
  );
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = rawEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.layering.strategy': 'USER_DEFINED',
      'elk.layered.spacing.nodeNodeBetweenLayers': '85',
      'elk.spacing.nodeNode': '42',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
    },
    children: visibleNodes.map((n) => {
      const cat = n.data?.category as EntityGraphNodeCategory;
      const dims = NODE_DIMS[cat] ?? { w: 100, h: 40 };
      const bucketIndex = (n.data?.bucketIndex as number) ?? 0;
      const categoryIndex = FLOW_CATEGORY_LAYER_INDEX.get(cat) ?? 0;
      const layerIndex = bucketIndex * FLOW_BUCKET_LAYER_SPAN + categoryIndex;
      return {
        id: n.id,
        width: dims.w,
        height: dims.h,
        layoutOptions: {
          'elk.layered.layering.userDefinedNode.layer': String(layerIndex),
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
        stroke: (e.style?.stroke as string) ?? defaultEdgeColor,
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
      className="flex h-80 items-center justify-center rounded-2xl animate-pulse"
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
  actionLabel: string;
}

function RelationFlowInner({
  graph,
  onNodeClick,
  hiddenCategories,
  actionLabel,
}: RelationFlowInnerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [layouting, setLayouting] = useState(true);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const prevGraphRef = useRef<EntityFlowGraph | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains('dark'));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const baseEdgeColor = useMemo(() => getFlowEdgeColor(isDark), [isDark]);

  const visibleNodeIds = useMemo(
    () => new Set(graph.nodes.filter((n) => !hiddenCategories.has(n.category)).map((n) => n.id)),
    [graph.nodes, hiddenCategories],
  );

  const visibleEdges = useMemo(
    () => graph.edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [graph.edges, visibleNodeIds],
  );

  const highlightedGraph = useMemo(() => {
    const highlightedNodeIds = new Set<string>();
    const highlightedEdgeIds = new Set<string>();

    if (!selectedNodeId || !visibleNodeIds.has(selectedNodeId)) {
      return { highlightedNodeIds, highlightedEdgeIds };
    }

    for (const edge of visibleEdges) {
      if (edge.source === selectedNodeId) {
        highlightedNodeIds.add(edge.target);
        highlightedEdgeIds.add(edge.id);
      } else if (edge.target === selectedNodeId) {
        highlightedNodeIds.add(edge.source);
        highlightedEdgeIds.add(edge.id);
      }
    }

    highlightedNodeIds.add(selectedNodeId);

    return { highlightedNodeIds, highlightedEdgeIds };
  }, [selectedNodeId, visibleEdges, visibleNodeIds]);

  const hasPinnedSelection =
    selectedNodeId !== null && highlightedGraph.highlightedNodeIds.size > 0;

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !visibleNodeIds.has(selectedNodeId)) return null;
    return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [graph.nodes, selectedNodeId, visibleNodeIds]);

  useEffect(() => {
    setSelectedNodeId((current) => {
      if (!current || visibleNodeIds.has(current)) return current;
      return null;
    });
  }, [visibleNodeIds]);

  const handleFlowNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const rawNodes: Node[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.category,
        position: { x: 0, y: 0 },
        zIndex: 1,
        data: {
          label: n.label,
          category: n.category,
          count: n.count,
          bucketLabel: n.bucketLabel,
          bucketIndex: n.bucketIndex,
          // Emphasis fields start neutral; applied by a separate effect post-layout
          isSelected: false,
          isConnected: false,
          isDimmed: false,
        },
      })),
    [graph.nodes],
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
        stroke: baseEdgeColor,
        opacity: 0.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: baseEdgeColor,
        width: 16,
        height: 16,
      },
      animated: false,
    }));
  }, [baseEdgeColor, graph.edges]);

  useEffect(() => {
    const graphChanged = prevGraphRef.current !== graph;
    prevGraphRef.current = graph;
    if (rawNodes.length === 0) {
      setLayouting(false);
      return;
    }
    if (graphChanged) setLayouting(true);
    computeElkLayout(rawNodes, rawEdges, hiddenCategories, baseEdgeColor)
      .then(({ nodes: positioned, edges: routedEdges }) => {
        setNodes(positioned);
        setEdges(routedEdges);
        setLayoutVersion((v) => v + 1);
      })
      .catch(() => {
        const positioned = rawNodes.map((n, i) => ({
          ...n,
          position: { x: (i % 5) * 160, y: Math.floor(i / 5) * 110 },
        }));
        setNodes(positioned);
        setEdges(rawEdges);
        setLayoutVersion((v) => v + 1);
      })
      .finally(() => setLayouting(false));
  }, [baseEdgeColor, rawNodes, rawEdges, hiddenCategories, setNodes, setEdges, graph]);

  // Apply selection/emphasis overlay without re-running ELK layout
  useEffect(() => {
    setNodes((current) =>
      current.map((n) => ({
        ...n,
        zIndex:
          n.id === selectedNodeId ? 20 : highlightedGraph.highlightedNodeIds.has(n.id) ? 10 : 1,
        data: {
          ...n.data,
          isSelected: n.id === selectedNodeId,
          isConnected: highlightedGraph.highlightedNodeIds.has(n.id),
          isDimmed: hasPinnedSelection && !highlightedGraph.highlightedNodeIds.has(n.id),
        },
      })),
    );
  }, [
    selectedNodeId,
    highlightedGraph.highlightedNodeIds,
    hasPinnedSelection,
    setNodes,
    layoutVersion,
  ]);

  useEffect(() => {
    const maxWeight = Math.max(...graph.edges.map((e) => e.weight), 1);
    const weightMap = new Map(graph.edges.map((e) => [e.id, e.weight]));
    setEdges((current) =>
      current.map((e) => {
        if (e.hidden) return e;
        const weight = weightMap.get(e.id) ?? 1;
        const isHighlighted = highlightedGraph.highlightedEdgeIds.has(e.id);
        const stroke = isHighlighted ? FLOW_EDGE_HIGHLIGHT_COLOR : baseEdgeColor;
        const strokeWidth = 0.8 + (weight / maxWeight) * 2.5 + (isHighlighted ? 0.6 : 0);
        const opacity = hasPinnedSelection ? (isHighlighted ? 0.95 : 0.08) : 0.5;
        return {
          ...e,
          animated: isHighlighted,
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
          ...(e.type === 'elk'
            ? { data: { ...e.data, stroke, strokeWidth, opacity } }
            : { style: { ...(e.style ?? {}), strokeWidth, stroke, opacity } }),
        };
      }),
    );
  }, [
    highlightedGraph.highlightedEdgeIds,
    hasPinnedSelection,
    baseEdgeColor,
    graph.edges,
    setEdges,
    layoutVersion,
  ]);

  return (
    <div className="relative h-full w-full">
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
        onNodeClick={handleFlowNodeClick}
        onPaneClick={() => setSelectedNodeId(null)}
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
    dates: string;
    tags: string;
    numbers: string;
    prices: string;
    flowNodeClick: string;
    flowNoGraph: string;
    flowNoGraphDesc: string;
    flowGenerate: string;
    flowGenerating: string;
    flowRegenerate: string;
    flowGeneratedOn: string;
    flowTotalEmails: string;
    openRelatedEmails: string;
    expandFullPage: string;
  };
}

export function RelationFlowChart({
  graph,
  loading,
  generating,
  onGenerate,
  onNodeClick,
  translations: tr,
}: RelationFlowChartProps) {
  const isEmpty = graph && graph.nodes.length === 0;
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
          <div className="h-[calc(50vh-120px)] sm:h-125">
            <ReactFlowProvider>
              <RelationFlowInner
                graph={graph}
                onNodeClick={onNodeClick}
                hiddenCategories={hiddenCategories}
                actionLabel={tr.openRelatedEmails}
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
    | 'legend'
    | 'flowNodeClick'
    | 'openRelatedEmails'
    | 'topics'
    | 'people'
    | 'organizations'
    | 'places'
    | 'events'
    | 'dates'
    | 'tags'
    | 'numbers'
    | 'prices'
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
            actionLabel={tr.openRelatedEmails}
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
