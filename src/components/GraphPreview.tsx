import { useEffect, useState } from "react";
import { Canvas, type LabelMode } from "./Canvas";
import type { Graph } from "../lib/model";
import type { Change } from "../lib/readability";
import { functionsFor } from "../lib/reading";
import {
  initialView,
  featureView,
  normalizeView,
  viewFlowIds,
  viewTitle,
  type WorkspaceView,
} from "../lib/workspaceView";
export function GraphPreview({
  graph,
  flowId = null,
  changes,
  view: controlledView,
  onViewChange,
  controls = false,
  labelMode = "selected",
}: {
  graph: Graph;
  flowId?: string | null;
  changes?: Change[];
  view?: WorkspaceView;
  onViewChange?: (v: WorkspaceView) => void;
  controls?: boolean;
  labelMode?: LabelMode;
}) {
  const [selection, select] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  });
  const [localView, setLocalView] = useState<WorkspaceView>(() =>
    initialView(),
  );
  const view = normalizeView(
    graph,
    controlledView ||
      (controls
        ? localView
        : flowId
          ? { ...initialView(), mode: "function", flowId }
          : initialView("design")),
  );
  const changeView = (v: WorkspaceView) => {
    select({ nodes: [], edges: [] });
    if (onViewChange) onViewChange(v);
    else setLocalView(v);
  };
  const features = functionsFor(graph);
  useEffect(
    () => select({ nodes: [], edges: [] }),
    [view.mode, view.featureId, view.flowId],
  );
  return (
    <>
      <div className="preview-view-controls">
        <strong>
          {view.purpose === "understand"
            ? "이해하기"
            : view.purpose === "improve"
              ? "개선하기"
              : "설계하기"}{" "}
          · {viewTitle(graph, view)}
        </strong>
        {controls && (
          <>
            <button
              type="button"
              aria-pressed={view.mode === "overview"}
              onClick={() => changeView(initialView())}
            >
              전체 개요
            </button>
            <select
              aria-label="미리보기 기능"
              value={view.featureId || ""}
              onChange={(e) => changeView(featureView(graph, e.target.value))}
            >
              <option value="" disabled>
                기능 선택…
              </option>
              {features.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={view.mode === "all"}
              onClick={() => changeView(initialView("design"))}
            >
              원본 배치
            </button>
            {view.expandedId && (
              <button
                type="button"
                onClick={() => changeView({ ...view, expandedId: null })}
              >
                상세 접기
              </button>
            )}
          </>
        )}
      </div>
      <div className="graph-preview" aria-label="구조 미리보기">
        <Canvas
          graph={graph}
          flowId={view.flowId}
          readingMode={view.mode}
          readingFlows={viewFlowIds(graph, view)}
          expandedId={view.expandedId}
          readingTitle={viewTitle(graph, view)}
          preview
          motion={false}
          snap={false}
          selection={selection}
          source={null}
          tool="pan"
          change={() => {}}
          checkpoint={() => {}}
          select={select}
          nodeClick={(id) => {
            select({ nodes: [id], edges: [] });
            if (controls && view.mode !== "all") {
              const next = { ...view, expandedId: id };
              if (onViewChange) onViewChange(next);
              else setLocalView(next);
            }
          }}
          edgeClick={(id) => select({ nodes: [], edges: [id] })}
          startConnect={() => {}}
          connect={() => {}}
          setTool={() => {}}
          toggleSnap={() => {}}
          add={() => {}}
          group={() => {}}
          ungroup={() => {}}
          remove={() => {}}
          undo={() => {}}
          redo={() => {}}
          canUndo={false}
          canRedo={false}
          fitKey={0}
          readOnly
          changes={changes}
          labelMode={labelMode}
        />
        {!!selection.edges.length && (
          <p className="preview-description">
            {graph.edges.find((e) => e.id === selection.edges[0])?.data.label} ·{" "}
            {graph.edges.find((e) => e.id === selection.edges[0])?.data.note}
          </p>
        )}
      </div>
    </>
  );
}
