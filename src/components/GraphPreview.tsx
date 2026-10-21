import { useEffect, useState } from "react";
import { Canvas } from "./Canvas";
import { type Graph } from "../lib/model";
import { type Change } from "../lib/readability";
export function GraphPreview({
  graph,
  flowId = null,
  changes,
}: {
  graph: Graph;
  flowId?: string | null;
  changes?: Change[];
}) {
  const [selection, select] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  });
  useEffect(() => select({ nodes: [], edges: [] }), [flowId]);
  return (
    <div className="graph-preview" aria-label="구조 미리보기">
      <Canvas
        graph={graph}
        flowId={flowId}
        motion={false}
        snap={false}
        selection={selection}
        source={null}
        tool="pan"
        change={() => {}}
        checkpoint={() => {}}
        select={select}
        nodeClick={(id) => select({ nodes: [id], edges: [] })}
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
        labelMode="all"
      />
      {!!selection.edges.length && (
        <p className="preview-description">
          {graph.edges.find((e) => e.id === selection.edges[0])?.data.label} ·{" "}
          {graph.edges.find((e) => e.id === selection.edges[0])?.data.note}
        </p>
      )}
    </div>
  );
}
