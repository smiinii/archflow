import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type CSSProperties,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  NodeResizer,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  useViewport,
  MarkerType,
  SelectionMode,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import {
  AlertCircle,
  Hand,
  Magnet,
  MousePointer2,
  Plus,
  Undo2,
  Redo2,
  Group,
  Ungroup,
  Trash2,
  Maximize,
  Link2,
} from "lucide-react";
import { resolveCardStyle } from "../lib/appearance";
import { getItem } from "../lib/catalog";
import { allMetrics, fmt, type Metric } from "../lib/analysis";
import {
  absolutePosition,
  sortNodes,
  type Graph,
  type Link,
  type Vertex,
} from "../lib/model";
import {
  CARD_MIN,
  flowView,
  positionIsFixed,
  type Change,
} from "../lib/readability";
import { readingView, type ReadingMode } from "../lib/reading";
import { routeGraph, type Route } from "../lib/routing";
import { snapPosition, type Guide } from "../lib/alignment";
import { TechIcon } from "./Icons";
import "@xyflow/react/dist/style.css";
type Selection = { nodes: string[]; edges: string[] };
export type LabelMode = "hidden" | "selected" | "all";
type Props = {
  readingMode?: ReadingMode;
  preview?: boolean;
  readingTitle?: string;
  readingFlows?: string[];
  expandedId?: string | null;
  focused?: boolean;
  labelMode?: LabelMode;
  readOnly?: boolean;
  changes?: Change[];
  graph: Graph;
  flowId: string | null;
  motion: boolean;
  snap: boolean;
  selection: Selection;
  source: string | null;
  tool: "select" | "pan";
  change: (fn: (g: Graph) => Graph) => void;
  checkpoint: () => void;
  select: Dispatch<SetStateAction<Selection>>;
  nodeClick: (id: string) => void;
  edgeClick: (id: string) => void;
  startConnect: (id: string) => void;
  connect: (c: Connection) => void;
  setTool: (t: "select" | "pan") => void;
  toggleSnap: () => void;
  add: () => void;
  group: () => void;
  ungroup: () => void;
  remove: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  fitKey: number;
};
const CanvasContext = createContext<{
  metrics: Record<string, Metric>;
  groups?: Record<string, number>;
  groupProblems?: Record<string, number>;
  boundaries?: Record<string, string>;
  readOnly?: boolean;
  active: Set<string> | null;
  source: string | null;
  checkpoint: () => void;
  startConnect: (id: string) => void;
  changes?: Change[];
  edgeSelect?: (id: string) => void;
}>({
  metrics: {},
  active: null,
  source: null,
  checkpoint: () => {},
  startConnect: () => {},
});
function ComponentNode({
  id,
  data,
  selected,
}: NodeProps<Node<Vertex["data"]>>) {
  const context = useContext(CanvasContext),
    m = context.metrics[id];
  const item = getItem(data.catalogId),
    muted = context.active && !context.active.has(id);
  const look = resolveCardStyle(data.style);
  return (
    <div
      style={
        {
          backgroundColor: look.backgroundColor,
          "--card-role-size": `${look.fontSize}px`,
          "--card-role-weight": look.fontWeight,
          "--card-icon-size": `${look.iconSize}px`,
        } as CSSProperties
      }
      className={
        "architecture-node " +
        (m?.bad || context.groupProblems?.[id] ? "problem " : "") +
        (selected ? "chosen " : "") +
        (context.source === id ? "source " : "") +
        (muted ? "faded " : "") +
        (context.changes
          ?.find((c) => c.scope === "node" && c.id === id)
          ?.kinds.includes("삭제")
          ? "diff-removed "
          : context.changes
                ?.find((c) => c.scope === "node" && c.id === id)
                ?.kinds.includes("추가")
            ? "diff-added "
            : context.changes?.some(
                  (c) => c.scope === "node" && c.id === id && c.kinds.length,
                )
              ? "diff-changed "
              : "")
      }
    >
      <NodeResizer
        isVisible={selected && !context.readOnly}
        minWidth={CARD_MIN.width}
        minHeight={CARD_MIN.height}
        onResizeStart={context.checkpoint}
        handleClassName="resize-dot"
        lineClassName="resize-line"
      />
      {Object.entries({
        top: Position.Top,
        right: Position.Right,
        bottom: Position.Bottom,
        left: Position.Left,
      }).map(([side, position]) => (
        <Handle
          key={side}
          type="target"
          position={position}
          id={`${side}-in`}
        />
      ))}
      <div className="node-tech">
        {context.groups?.[id] !== undefined ? (
          <Group size={look.iconSize} />
        ) : (
          <TechIcon id={data.catalogId} size={look.iconSize} />
        )}
        <span title={item.title}>
          {context.groups?.[id] !== undefined
            ? `실행·데이터 경계 · ${context.groups[id]}개 요소`
            : item.title}
        </span>
      </div>
      {context.boundaries?.[id] && (
        <span className="node-boundary" title={context.boundaries[id]}>
          {context.boundaries[id]}
        </span>
      )}
      <strong title={data.name}>{data.name}</strong>
      {selected && !context.readOnly && (
        <button
          className="node-connect-button nodrag nopan"
          aria-label={data.name + "에서 연결하기"}
          onClick={(e) => {
            e.stopPropagation();
            context.startConnect(id);
          }}
        >
          <Link2 size={13} />
          연결
        </button>
      )}
      <div className="node-status">
        <span>
          {context.groups?.[id] !== undefined
            ? "클릭하여 내부 연결 보기"
            : m?.demand == null
              ? item.structural
                ? "구성 관계"
                : "부하 미지정"
              : fmt(m.demand) + " RPS"}
        </span>
        <span>
          {context.groupProblems?.[id] ? (
            <>
              <AlertCircle size={12} />
              내부 문제 {context.groupProblems[id]}곳
            </>
          ) : m?.bad ? (
            <>
              <AlertCircle size={12} />
              {m.overload ? "용량 초과" : "시간 초과"}
            </>
          ) : m?.ratio != null ? (
            fmt(m.ratio * 100, 0) + "%"
          ) : data.catalogId === "client" ? (
            "시작"
          ) : (
            ""
          )}
        </span>
      </div>
      {Object.entries({
        top: Position.Top,
        right: Position.Right,
        bottom: Position.Bottom,
        left: Position.Left,
      }).map(([side, position]) => (
        <Handle
          key={side}
          type="source"
          position={position}
          id={`${side}-out`}
        />
      ))}
    </div>
  );
}
function GroupNode({ id, data, selected }: NodeProps<Node<Vertex["data"]>>) {
  const { checkpoint, changes, readOnly } = useContext(CanvasContext);
  return (
    <div
      className={
        "architecture-group " +
        (selected ? "chosen " : "") +
        (changes
          ?.find((c) => c.scope === "node" && c.id === id)
          ?.kinds.includes("삭제")
          ? "diff-removed"
          : changes?.some(
                (c) => c.scope === "node" && c.id === id && c.kinds.length,
              )
            ? "diff-changed"
            : "")
      }
    >
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected && !readOnly}
        onResizeStart={checkpoint}
        handleClassName="resize-dot"
        lineClassName="resize-line"
      />
      <div className="group-title" title={data.name}>
        <Group size={13} />
        {data.name}
      </div>
      {["top", "right", "bottom", "left"].map((side) => (
        <button
          type="button"
          key={side}
          className={"group-border nodrag " + side}
          aria-label={data.name + " " + side + " 경계 선택"}
        />
      ))}
    </div>
  );
}
function FlowEdge(props: EdgeProps) {
  const { zoom } = useViewport();
  const ctx = useContext(CanvasContext);
  const d = props.data as {
    kind: Link["data"]["kind"];
    label: string;
    note?: string;
    condition?: string;
    purpose?: string;
    traffic: string;
    motion: boolean;
    bad: boolean;
    route: Route;
    labelMode: LabelMode;
    changed: boolean;
    removed: boolean;
    faded: boolean;
  };
  const route = d.route;
  if (!route?.path || route.blocked) return null;
  const path = route.path;
  const color = d.removed
    ? "#ce6873"
    : d.changed
      ? "#c58a38"
      : d.bad
        ? "#ce5b6b"
        : props.selected
          ? "#7565d5"
          : d.purpose === "dependency"
            ? "#91a3b4"
            : "#aaaebc";
  const full = [
    d.label,
    d.kind === "async"
      ? "비동기 · 작업 완료는 별도"
      : d.kind === "sync"
        ? "동기 · 응답 대기"
        : "구성 관계",
    d.purpose === "dependency"
      ? "상태 확인·의존 연결 (전달 계산 제외)"
      : "주 전달 경로",
    d.traffic === "cache-miss" ? "캐시 미스일 때" : "",
    d.condition,
    d.note,
  ]
    .filter(Boolean)
    .join(" · ");
  const visible =
    (!d.faded || props.selected) &&
    route.label &&
    zoom >= 0.7 &&
    d.labelMode !== "hidden" &&
    (d.labelMode === "all" || props.selected);
  return (
    <>
      <title>{full}</title>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={22}
        style={{
          stroke: color,
          opacity: d.faded ? 0.18 : 1,
          strokeWidth: props.selected
            ? 2.3
            : d.purpose === "dependency"
              ? 1
              : 1.5,
          strokeDasharray:
            d.kind === "async"
              ? "7 5"
              : d.kind === "relation"
                ? "2 5"
                : undefined,
        }}
      />
      {d.motion &&
        d.kind !== "relation" &&
        d.purpose !== "dependency" &&
        [0, 1].map((i) => (
          <circle
            key={i}
            r={3}
            fill={d.bad ? "#ce5b6b" : "#8c7bd7"}
            className="request-dot"
          >
            <animateMotion
              dur="3.6s"
              begin={`${i * -1.8}s`}
              repeatCount="indefinite"
              path={path}
            />
          </circle>
        ))}
      {visible && route.label?.anchor && (
        <path
          d={`M ${route.label.anchor.x} ${route.label.anchor.y} L ${route.label.x + route.label.width / 2} ${route.label.y + route.label.height / 2}`}
          stroke="#c4bfd1"
          strokeWidth={0.8}
          fill="none"
          pointerEvents="none"
        />
      )}
      {visible && route.label && (
        <EdgeLabelRenderer>
          <button
            className="edge-label nodrag nopan"
            title={full}
            aria-label={full}
            style={{
              transform: `translate(${route.label.x}px,${route.label.y}px)`,
              width: route.label.width,
              height: route.label.height,
            }}
            onClick={() => ctx.edgeSelect?.(props.id)}
            onFocus={() => ctx.edgeSelect?.(props.id)}
          >
            {route.label.text}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { component: ComponentNode, group: GroupNode },
  edgeTypes = { flow: FlowEdge };
const fitOptions = {
  padding: { top: "64px", right: "16px", bottom: "136px", left: "16px" },
  minZoom: 0.85,
  maxZoom: 1,
} as const;
export function Canvas(props: Props) {
  // Overview proxies reuse group IDs; don't carry handle bounds across node-type changes.
  return (
    <ReactFlowProvider
      key={props.graph === undefined ? "empty" : props.readingMode || "canvas"}
    >
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
function CanvasInner(p: Props) {
  const { graph: g } = p;
  const [guides, setGuides] = useState<Guide[]>([]),
    [alt, setAlt] = useState(false);
  const api = useReactFlow();
  const lastFit = useRef(-1);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    let previous = { width: element.clientWidth, height: element.clientHeight };
    const observer = new ResizeObserver(() => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      if (
        previous.width &&
        previous.height &&
        (next.width !== previous.width || next.height !== previous.height)
      ) {
        const v = api.getViewport();
        void api.setViewport(
          {
            ...v,
            x: v.x + (next.width - previous.width) / 2,
            y: v.y + (next.height - previous.height) / 2,
          },
          { duration: 0 },
        );
      }
      previous = next;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [api]);
  const metrics = useMemo(
    () =>
      allMetrics(
        p.readingFlows?.length
          ? {
              ...g,
              flows: g.flows.filter((f) => p.readingFlows!.includes(f.id)),
            }
          : g,
        p.flowId,
      ),
    [g, p.flowId, p.readingFlows],
  );
  const reading = useMemo(
    () =>
      p.readingMode
        ? readingView(g, p.readingMode, p.readingFlows || [], p.expandedId)
        : null,
    [g, p.readingMode, p.readingFlows, p.expandedId],
  );
  const active = useMemo(
    () =>
      p.flowId
        ? new Set(
            g.edges
              .filter((e) => e.data.flowIds.includes(p.flowId!))
              .flatMap((e) => [e.source, e.target])
              .concat(g.flows.find((f) => f.id === p.flowId)?.entryId || []),
          )
        : null,
    [g, p.flowId],
  );
  const visibleGraph = useMemo(() => {
    const view = reading?.graph || flowView(g, p.flowId, p.focused ?? true);
    return view;
  }, [g, p.flowId, p.focused, reading]);
  const routes = useMemo(() => routeGraph(visibleGraph), [visibleGraph]);
  const nodes = sortNodes(visibleGraph.nodes).map((n) => ({
    ...n,
    width: n.type === "group" ? n.width : Math.max(n.width, CARD_MIN.width),
    height: n.type === "group" ? n.height : Math.max(n.height, CARD_MIN.height),
    measured: {
      width: n.type === "group" ? n.width : Math.max(n.width, CARD_MIN.width),
      height:
        n.type === "group" ? n.height : Math.max(n.height, CARD_MIN.height),
    },
    style: {
      width: n.type === "group" ? n.width : Math.max(n.width, CARD_MIN.width),
      height:
        n.type === "group" ? n.height : Math.max(n.height, CARD_MIN.height),
    },
    selected: p.selection.nodes.includes(n.id),
    draggable:
      !p.readOnly && p.tool === "select" && !positionIsFixed(n, g.nodes),
    dragHandle: n.type === "group" ? ".group-title" : undefined,
    zIndex: n.type === "group" ? 0 : 2,
  })) as Node[];
  const edges = visibleGraph.edges
    .filter((e) => routes[e.id])
    .map((e) => ({
      ...e,
      sourceHandle: routes[e.id].sourceHandle,
      targetHandle: routes[e.id].targetHandle,
      type: "flow",
      selected: p.selection.edges.includes(e.id),
      domAttributes: { onFocus: () => p.edgeClick(e.id) },
      ariaLabel: `${e.data.label || "연결"} · ${e.data.note || ""} · ${e.data.kind} · Enter로 선택 후 아래 상세 정보에서 확인`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: metrics[e.target]?.bad ? "#ce5b6b" : "#aaaebc",
      },
      data: {
        ...e.data,
        route: routes[e.id],
        labelMode: p.labelMode || "selected",
        motion: p.motion && (!p.flowId || e.data.flowIds.includes(p.flowId)),
        faded:
          !p.readingMode && !!p.flowId && !e.data.flowIds.includes(p.flowId),
        bad: metrics[e.target]?.bad,
        changed: p.changes?.some(
          (c) => c.scope === "edge" && c.id === e.id && c.kinds.length,
        ),
        removed: p.changes?.some(
          (c) =>
            c.scope === "edge" && c.id === e.id && c.kinds.includes("삭제"),
        ),
      },
    })) as Edge[];
  const currentFit = {
    ...fitOptions,
    ...(p.readingMode && p.readingMode !== "all"
      ? {
          minZoom: p.readingMode === "overview" ? 0.45 : 0.65,
          padding: {
            top: "56px",
            right: "20px",
            bottom: "56px",
            left: "20px",
          } as const,
        }
      : {}),
    ...(p.preview ? { minZoom: 0.15 } : {}),
    nodes: visibleGraph.nodes
      .filter((n) => n.type !== "group")
      .map((n) => ({ id: n.id })),
  };
  const signature = `${p.flowId}:${p.focused}:${p.fitKey}:${p.readingMode}:${p.readingFlows?.join(",")}:${p.expandedId}:${!!visibleGraph.nodes.length}`;
  async function fitReadable() {
    await api.fitView({ ...currentFit, duration: 0 });
    const components = visibleGraph.nodes.filter((n) => n.type !== "group");
    if (!components.length || !wrap.current) return;
    const rectangles = components.map((n) => ({
      ...absolutePosition(n, visibleGraph.nodes),
      width: n.width,
      height: n.height,
    }));
    const width =
      Math.max(...rectangles.map((r) => r.x + r.width)) -
      Math.min(...rectangles.map((r) => r.x));
    const height =
      Math.max(...rectangles.map((r) => r.y + r.height)) -
      Math.min(...rectangles.map((r) => r.y));
    const minimum = currentFit.minZoom;
    if (
      !p.preview &&
      p.readingMode !== "overview" &&
      (width * minimum > wrap.current.clientWidth - 40 ||
        height * minimum >
          wrap.current.clientHeight -
            (p.readingMode === "function" ? 112 : 150))
    )
      navigate(
        g.flows.find((f) => f.id === p.flowId)?.entryId || components[0].id,
      );
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitReadable();
    }, 80);
    return () => clearTimeout(timer);
  }, [signature]);
  const navigate = (id: string) => {
    const n = visibleGraph.nodes.find((n) => n.id === id);
    if (!n) return;
    const r = nodeRectForView(n);
    void api.setCenter(
      r.x + n.width / 2,
      r.y + n.height / 2 + (p.flowId ? 45 : 20),
      {
        zoom: 1,
        duration: 0,
      },
    );
  };
  function nodeRectForView(n: Vertex) {
    return absolutePosition(n, visibleGraph.nodes);
  }
  function changeNodes(changes: NodeChange[]) {
    const selections = changes.filter((c) => c.type === "select");
    if (selections.length) {
      p.select((previous) => {
        const next = new Set(previous.nodes);
        for (const c of selections)
          if (c.type === "select") {
            if (c.selected) next.add(c.id);
            else next.delete(c.id);
          }
        return { ...previous, nodes: [...next] };
      });
    }
    const edits = changes.filter(
      (c) =>
        c.type === "position" || (c.type === "dimensions" && c.setAttributes),
    );
    if (!edits.length || p.readOnly) return;
    let dx = 0,
      dy = 0;
    const moving = edits.find(
      (c) => c.type === "position" && c.dragging && c.position,
    );
    if (moving?.type === "position" && moving.position && p.snap && !alt) {
      const origin = g.nodes.find((n) => n.id === moving.id);
      if (origin) {
        const result = snapPosition(
          { ...origin, position: moving.position },
          g.nodes,
          p.selection.nodes.length ? p.selection.nodes : [moving.id],
          6 / api.getZoom(),
        );
        dx = result.dx;
        dy = result.dy;
        setGuides(result.guides);
      }
    } else setGuides([]);
    p.change((graph) => ({
      ...graph,
      nodes: graph.nodes.map((n) => {
        let next = n;
        for (const c of edits)
          if ("id" in c && c.id === n.id) {
            if (
              c.type === "position" &&
              c.position &&
              !positionIsFixed(n, graph.nodes)
            )
              next = {
                ...next,
                position: { x: c.position.x + dx, y: c.position.y + dy },
              };
            if (c.type === "dimensions" && c.dimensions && c.setAttributes)
              next = {
                ...next,
                width: Math.max(
                  n.type === "group" ? 200 : CARD_MIN.width,
                  c.dimensions.width,
                ),
                height: Math.max(
                  n.type === "group" ? 160 : CARD_MIN.height,
                  c.dimensions.height,
                ),
              };
          }
        return next;
      }),
    }));
  }
  const view = api.getViewport();
  return (
    <CanvasContext.Provider
      value={{
        metrics,
        groups: reading?.groups,
        groupProblems: Object.fromEntries(
          Object.keys(reading?.groups || {}).map((id) => [
            id,
            g.nodes.filter((n) => n.parentId === id && metrics[n.id]?.bad)
              .length,
          ]),
        ),
        boundaries: reading?.boundaries,
        readOnly: p.readOnly,
        active: p.readingMode ? null : active,
        source: p.source,
        checkpoint: p.checkpoint,
        startConnect: p.readOnly ? () => {} : p.startConnect,
        changes: p.changes,
        edgeSelect: p.edgeClick,
      }}
    >
      <div
        ref={wrap}
        className={"canvas-wrap " + (p.tool === "pan" ? "pan-tool" : "")}
        onPointerMove={(e) => setAlt(e.altKey)}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={() => {
            if (lastFit.current !== p.fitKey) {
              void fitReadable();
              lastFit.current = p.fitKey;
            }
          }}
          onNodesChange={changeNodes}
          onEdgesChange={(changes) => {
            p.select((previous) => {
              const selected = new Set(previous.edges);
              for (const c of changes)
                if (c.type === "select") {
                  if (c.selected) selected.add(c.id);
                  else selected.delete(c.id);
                }
              return { ...previous, edges: [...selected] };
            });
          }}
          onNodeClick={(_e, n) => p.nodeClick(n.id)}
          onEdgeClick={(_e, edge) => p.edgeClick(edge.id)}
          onNodeDragStart={p.checkpoint}
          onNodeDragStop={() => setGuides([])}
          onSelectionDragStart={p.checkpoint}
          onSelectionDragStop={() => setGuides([])}
          onPaneClick={() => p.select({ nodes: [], edges: [] })}
          onConnect={p.connect}
          isValidConnection={(c) =>
            c.source !== c.target &&
            !g.nodes.some(
              (n) =>
                (n.id === c.source || n.id === c.target) && n.type === "group",
            )
          }
          onMoveEnd={() => setGuides([])}
          fitView
          fitViewOptions={currentFit}
          zoomOnScroll={false}
          preventScrolling={false}
          zoomActivationKeyCode="Control"
          minZoom={0.15}
          maxZoom={2}
          deleteKeyCode={null}
          selectionOnDrag={p.tool === "select"}
          selectionMode={SelectionMode.Partial}
          panOnDrag={p.tool === "pan" ? [0, 1, 2] : [1, 2]}
          panActivationKeyCode="Space"
          multiSelectionKeyCode="Shift"
          selectionKeyCode={null}
          nodesDraggable={!p.readOnly && p.tool === "select"}
          nodesConnectable={!p.readOnly}
          proOptions={{ hideAttribution: false }}
          ariaLabelConfig={{
            "node.a11yDescription.default":
              "Enter로 선택하고 방향키로 이동합니다. Delete로 삭제합니다.",
            "controls.zoomIn.ariaLabel": "확대",
            "controls.zoomOut.ariaLabel": "축소",
            "controls.fitView.ariaLabel": "전체 보기",
          }}
        >
          <Background color="#d9dce4" gap={20} size={1} />
          <Controls
            showInteractive={false}
            fitViewOptions={currentFit}
            onFitView={() => void fitReadable()}
          />
          <MiniMap
            className="minimap"
            style={{ width: 105, height: 80 }}
            pannable
            zoomable
            nodeColor={(n) => (n.type === "group" ? "#eceaf4" : "#c6bfdc")}
          />
        </ReactFlow>
        <svg className="alignment-overlay" aria-hidden="true">
          {guides.map((q, i) => {
            const z = view.zoom,
              v = q.value * z + (q.axis === "x" ? view.x : view.y),
              from = q.from * z + (q.axis === "x" ? view.y : view.x),
              to = q.to * z + (q.axis === "x" ? view.y : view.x);
            return (
              <g key={i}>
                <line
                  x1={q.axis === "x" ? v : from}
                  y1={q.axis === "x" ? from : v}
                  x2={q.axis === "x" ? v : to}
                  y2={q.axis === "x" ? to : v}
                />
                <text
                  x={q.axis === "x" ? v + 5 : from + 5}
                  y={q.axis === "x" ? from - 5 : v - 6}
                >
                  {q.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div
          className="canvas-caption"
          title={
            g.flows.find((f) => f.id === p.flowId)?.name || "전체 아키텍처"
          }
        >
          <span>
            {p.readingTitle ||
              (p.flowId
                ? g.flows.find((f) => f.id === p.flowId)?.name
                : p.readingMode === "overview"
                  ? "전체 개요"
                  : "전체 아키텍처")}
          </span>
          <small>
            {p.readingMode === "function"
              ? "주요 흐름 · 구성요소를 선택해 상세 연결 보기"
              : p.flowId
                ? p.focused !== false
                  ? "선택 흐름만 보기"
                  : "전체 안에서 강조"
                : p.readingMode === "overview"
                  ? "경계를 묶은 요약 · 기능이나 요소를 선택하세요"
                  : "서비스 · 데이터 · 배포 관계"}
          </small>
        </div>
        <div className="canvas-navigation nodrag nopan">
          <span>
            {p.readingMode === "overview"
              ? "전체 개요 · 기능을 선택해 자세히 보기"
              : "읽기 크기 유지 · 손 도구로 이동"}
          </span>
          <button
            className="outline"
            onClick={() => void api.fitView({ ...currentFit, minZoom: 0.15 })}
          >
            전체 윤곽
          </button>
          <select
            aria-label="구성요소로 이동"
            value=""
            onChange={(e) => navigate(e.target.value)}
          >
            <option value="">요소로 이동…</option>
            {visibleGraph.nodes
              .filter((n) => n.type !== "group")
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data.name}
                </option>
              ))}
          </select>
          {Object.values(routes).some((r) => r.blocked) && (
            <strong role="status">
              겹친 박스로 연결{" "}
              {Object.values(routes).filter((r) => r.blocked).length}개를 표시할
              수 없습니다. 배치 미리보기로 간격을 확보하세요.
            </strong>
          )}
        </div>
        {p.selection.edges.length === 1 && (
          <div className="canvas-edge-detail" role="status">
            <strong>
              {g.edges.find((e) => e.id === p.selection.edges[0])?.data.label}
            </strong>
            <span>
              {g.edges.find((e) => e.id === p.selection.edges[0])?.data.note ||
                "상세 설정은 아래 속성에서 확인하세요."}
            </span>
          </div>
        )}
        {p.flowId && (
          <div className="flow-navigator" aria-label="흐름 구성요소 탐색">
            <span>
              연결 따라가기 <small>실행 순서·병렬 여부는 확인 필요</small>
            </span>
            <div>
              {(() => {
                const flow = g.flows.find((f) => f.id === p.flowId);
                const seen = new Set<string>();
                const queue = flow?.entryId ? [flow.entryId] : [];
                const ordered: string[] = [];
                while (queue.length) {
                  const id = queue.shift()!;
                  if (seen.has(id)) continue;
                  seen.add(id);
                  ordered.push(id);
                  for (const e of visibleGraph.edges.filter(
                    (e) =>
                      e.data.flowIds.includes(p.flowId!) &&
                      e.source === id &&
                      e.data.purpose !== "dependency" &&
                      e.data.kind !== "relation",
                  ))
                    if (!seen.has(e.target)) queue.push(e.target);
                }
                return ordered.map((id, i) => (
                  <button
                    key={id}
                    title={g.nodes.find((n) => n.id === id)?.data.name}
                    onClick={() => navigate(id)}
                  >
                    <span>↳</span>
                    {g.nodes.find((n) => n.id === id)?.data.name}
                  </button>
                ));
              })()}
            </div>
          </div>
        )}
        {reading && reading.hiddenEdges > 0 && (
          <div className="reading-note">
            상세 연결 {reading.hiddenEdges}개 접힘 · 원본과 계산은 유지됩니다
          </div>
        )}
        {!g.nodes.length && (
          <div className="canvas-empty">
            <div className="empty-icon">
              <Plus size={26} />
            </div>
            <h2>구조를 그려볼까요?</h2>
            <p>구성요소를 추가하거나 AI 인터뷰로 시작하세요.</p>
            <button className="primary" onClick={p.add}>
              구성요소 추가
            </button>
          </div>
        )}
        {!p.readOnly && (
          <div
            className="canvas-dock"
            role="toolbar"
            aria-label="캔버스 편집 도구"
          >
            <button
              aria-label="선택 도구"
              title="선택 · 빈 공간을 드래그하면 여러 요소 선택"
              aria-pressed={p.tool === "select"}
              onClick={() => p.setTool("select")}
            >
              <MousePointer2 size={17} />
              <span>선택</span>
            </button>
            <button
              aria-label="화면 이동"
              title="이동 · 마우스를 누른 채 끌어 캔버스 이동"
              aria-pressed={p.tool === "pan"}
              onClick={() => p.setTool("pan")}
            >
              <Hand size={17} />
              <span>이동</span>
            </button>
            <span className="separator" />
            <button
              aria-label="자동 정렬 맞춤"
              aria-pressed={p.snap}
              onClick={p.toggleSnap}
            >
              <Magnet size={17} />
            </button>
            <button aria-label="구성요소 추가" onClick={p.add}>
              <Plus size={18} />
            </button>
            <button
              aria-label="선택을 그룹으로 묶기"
              onClick={p.group}
              disabled={!p.selection.nodes.length}
            >
              <Group size={18} />
            </button>
            <button
              aria-label="그룹 해제"
              onClick={p.ungroup}
              disabled={!p.selection.nodes.length}
            >
              <Ungroup size={18} />
            </button>
            <span className="separator" />
            <button
              aria-label="실행 취소"
              disabled={!p.canUndo}
              onClick={p.undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="다시 실행"
              disabled={!p.canRedo}
              onClick={p.redo}
            >
              <Redo2 size={17} />
            </button>
            <button
              aria-label="선택 삭제"
              onClick={p.remove}
              disabled={!p.selection.nodes.length && !p.selection.edges.length}
            >
              <Trash2 size={17} />
            </button>
            <button aria-label="전체 맞춤" onClick={() => void fitReadable()}>
              <Maximize size={17} />
            </button>
          </div>
        )}
      </div>
    </CanvasContext.Provider>
  );
}
