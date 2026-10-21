import { createContext, useContext, useMemo, useRef, useState } from "react";
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
  getSmoothStepPath,
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
  Check,
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
} from "lucide-react";
import { getItem } from "../lib/catalog";
import { allMetrics, analyze, fmt, type Metric } from "../lib/analysis";
import {
  absolutePosition,
  sortNodes,
  type Graph,
  type Link,
  type Vertex,
} from "../lib/model";
import { snapPosition, type Guide } from "../lib/alignment";
import { TechIcon } from "./Icons";
import "@xyflow/react/dist/style.css";
type Selection = { nodes: string[]; edges: string[] };
type Props = {
  graph: Graph;
  flowId: string | null;
  motion: boolean;
  snap: boolean;
  selection: Selection;
  source: string | null;
  tool: "select" | "pan";
  change: (fn: (g: Graph) => Graph) => void;
  checkpoint: () => void;
  select: (s: Selection) => void;
  nodeClick: (id: string) => void;
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
  active: Set<string> | null;
  source: string | null;
  checkpoint: () => void;
}>({ metrics: {}, active: null, source: null, checkpoint: () => {} });
function ComponentNode({
  id,
  data,
  selected,
}: NodeProps<Node<Vertex["data"]>>) {
  const context = useContext(CanvasContext),
    m = context.metrics[id];
  const item = getItem(data.catalogId),
    muted = context.active && !context.active.has(id);
  return (
    <div
      className={
        "architecture-node " +
        (m?.bad ? "problem " : "") +
        (selected ? "chosen " : "") +
        (context.source === id ? "source " : "") +
        (muted ? "faded" : "")
      }
    >
      <NodeResizer
        isVisible={selected}
        minWidth={156}
        minHeight={114}
        onResizeStart={context.checkpoint}
        handleClassName="resize-dot"
        lineClassName="resize-line"
      />
      <Handle type="target" position={Position.Top} id="top-in" />
      <Handle type="target" position={Position.Left} id="left-in" />
      <div className="node-tech">
        <TechIcon id={data.catalogId} />
        <span>{item.title}</span>
      </div>
      <strong title={data.name}>{data.name}</strong>
      <div className="node-status">
        <span>
          {m?.demand == null
            ? item.structural
              ? "구성 관계"
              : "부하 미지정"
            : fmt(m.demand) + " RPS"}
        </span>
        <span>
          {m?.bad ? (
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
      <Handle type="source" position={Position.Bottom} id="bottom-out" />
      <Handle type="source" position={Position.Right} id="right-out" />
    </div>
  );
}
function GroupNode({ data, selected }: NodeProps<Node<Vertex["data"]>>) {
  const { checkpoint } = useContext(CanvasContext);
  return (
    <div className={"architecture-group " + (selected ? "chosen" : "")}>
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        onResizeStart={checkpoint}
        handleClassName="resize-dot"
        lineClassName="resize-line"
      />
      <div className="group-title">
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
  const [path, x, y] = getSmoothStepPath({ ...props, borderRadius: 12 });
  const d = props.data as {
    kind: Link["data"]["kind"];
    label: string;
    motion: boolean;
    bad: boolean;
  };
  const color = d.bad ? "#ce5b6b" : props.selected ? "#7565d5" : "#aaaebc";
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={22}
        style={{
          stroke: color,
          strokeWidth: props.selected ? 2 : 1.4,
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
      <EdgeLabelRenderer>
        <span
          className="edge-label"
          style={{
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
          }}
        >
          {d.label}
          {d.kind === "async"
            ? " · 비동기"
            : d.kind === "relation"
              ? " · 구성"
              : ""}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
const nodeTypes = { component: ComponentNode, group: GroupNode },
  edgeTypes = { flow: FlowEdge };
export function Canvas(props: Props) {
  return (
    <ReactFlowProvider key={props.graph === undefined ? "empty" : "canvas"}>
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
  const metrics = useMemo(() => allMetrics(g, p.flowId), [g, p.flowId]);
  const active = useMemo(
    () =>
      p.flowId
        ? analyze(
            g,
            g.flows.find((f) => f.id === p.flowId)!,
          ).reached
        : null,
    [g, p.flowId],
  );
  const nodes = sortNodes(g.nodes).map((n) => ({
    ...n,
    measured: { width: n.width, height: n.height },
    style: { width: n.width, height: n.height },
    selected: p.selection.nodes.includes(n.id),
    dragHandle: n.type === "group" ? ".group-title" : undefined,
    zIndex: n.type === "group" ? 0 : 2,
  })) as Node[];
  const edges = g.edges
    .filter((e) => !p.flowId || e.data.flowIds.includes(p.flowId))
    .map((e) => ({
      ...e,
      type: "flow",
      selected: p.selection.edges.includes(e.id),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: metrics[e.target]?.bad ? "#ce5b6b" : "#aaaebc",
      },
      data: { ...e.data, motion: p.motion, bad: metrics[e.target]?.bad },
    })) as Edge[];
  function changeNodes(changes: NodeChange[]) {
    const selections = changes.filter((c) => c.type === "select");
    if (selections.length) {
      const next = new Set(p.selection.nodes);
      for (const c of selections)
        if (c.type === "select") {
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
      p.select({ ...p.selection, nodes: [...next] });
    }
    const edits = changes.filter(
      (c) =>
        c.type === "position" || (c.type === "dimensions" && c.setAttributes),
    );
    if (!edits.length) return;
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
            if (c.type === "position" && c.position)
              next = {
                ...next,
                position: { x: c.position.x + dx, y: c.position.y + dy },
              };
            if (c.type === "dimensions" && c.dimensions && c.setAttributes)
              next = {
                ...next,
                width: Math.max(140, c.dimensions.width),
                height: Math.max(100, c.dimensions.height),
              };
          }
        return next;
      }),
    }));
  }
  const view = api.getViewport();
  return (
    <CanvasContext.Provider
      value={{ metrics, active, source: p.source, checkpoint: p.checkpoint }}
    >
      <div
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
              api.fitView({ padding: 0.18, maxZoom: 1 });
              lastFit.current = p.fitKey;
            }
          }}
          onNodesChange={changeNodes}
          onEdgesChange={(changes) => {
            const selected = new Set(p.selection.edges);
            for (const c of changes)
              if (c.type === "select") {
                if (c.selected) selected.add(c.id);
                else selected.delete(c.id);
              }
            p.select({ ...p.selection, edges: [...selected] });
          }}
          onNodeClick={(_e, n) => p.nodeClick(n.id)}
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
          fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={2}
          deleteKeyCode={null}
          selectionOnDrag={p.tool === "select"}
          selectionMode={SelectionMode.Partial}
          panOnDrag={p.tool === "pan" ? [0, 1, 2] : [1, 2]}
          panActivationKeyCode="Space"
          multiSelectionKeyCode="Shift"
          selectionKeyCode={null}
          nodesDraggable={p.tool === "select"}
          nodesConnectable
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
          <Controls showInteractive={false} />
          <MiniMap
            className="minimap"
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
        <div className="canvas-caption">
          <span>
            {p.flowId
              ? g.flows.find((f) => f.id === p.flowId)?.name
              : "전체 아키텍처"}
          </span>
          <small>
            {p.flowId ? "선택한 요청의 경로" : "서비스 · 데이터 · 배포 관계"}
          </small>
        </div>
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
        <div
          className="canvas-dock"
          role="toolbar"
          aria-label="캔버스 편집 도구"
        >
          <button
            aria-label="선택 도구"
            aria-pressed={p.tool === "select"}
            onClick={() => p.setTool("select")}
          >
            <MousePointer2 size={17} />
          </button>
          <button
            aria-label="화면 이동"
            aria-pressed={p.tool === "pan"}
            onClick={() => p.setTool("pan")}
          >
            <Hand size={17} />
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
          <button aria-label="실행 취소" disabled={!p.canUndo} onClick={p.undo}>
            <Undo2 size={17} />
          </button>
          <button aria-label="다시 실행" disabled={!p.canRedo} onClick={p.redo}>
            <Redo2 size={17} />
          </button>
          <button
            aria-label="선택 삭제"
            onClick={p.remove}
            disabled={!p.selection.nodes.length && !p.selection.edges.length}
          >
            <Trash2 size={17} />
          </button>
          <button
            aria-label="전체 맞춤"
            onClick={() => api.fitView({ padding: 0.18, maxZoom: 1 })}
          >
            <Maximize size={17} />
          </button>
        </div>
      </div>
    </CanvasContext.Provider>
  );
}
