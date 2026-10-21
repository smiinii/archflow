import type { Graph } from "./model";
import { functionsFor, type ReadingMode } from "./reading";
export type Purpose = "understand" | "design" | "improve";
export type WorkspaceView = {
  purpose: Purpose;
  mode: ReadingMode;
  featureId: string | null;
  flowId: string | null;
  expandedId: string | null;
};
export const initialView = (
  purpose: Purpose = "understand",
): WorkspaceView => ({
  purpose,
  mode: purpose === "understand" ? "overview" : "all",
  featureId: null,
  flowId: null,
  expandedId: null,
});
export function featureView(g: Graph, id: string): WorkspaceView {
  const feature = functionsFor(g).find((f) => f.id === id);
  return feature
    ? {
        ...initialView(),
        mode: "function",
        featureId: id,
        flowId: feature.flowIds.length === 1 ? feature.flowIds[0] : null,
      }
    : initialView();
}
export function normalizeView(g: Graph, view: WorkspaceView): WorkspaceView {
  const valid = {
    ...view,
    expandedId: g.nodes.some((n) => n.id === view.expandedId)
      ? view.expandedId
      : null,
    flowId: g.flows.some((f) => f.id === view.flowId) ? view.flowId : null,
  };
  if (view.featureId && !functionsFor(g).some((f) => f.id === view.featureId))
    return initialView(view.purpose);
  if (view.mode === "function" && !valid.featureId && !valid.flowId)
    return initialView();
  return valid;
}
export function viewFlowIds(g: Graph, view: WorkspaceView) {
  return (
    functionsFor(g).find((f) => f.id === view.featureId)?.flowIds ||
    (view.flowId ? [view.flowId] : [])
  );
}
export function viewTitle(g: Graph, view: WorkspaceView) {
  return view.expandedId
    ? `${g.nodes.find((n) => n.id === view.expandedId)?.data.name || "구성요소"} · 상세 연결`
    : functionsFor(g).find((f) => f.id === view.featureId)?.name ||
        g.flows.find((f) => f.id === view.flowId)?.name ||
        (view.mode === "overview" ? "전체 구조" : "전체 원본");
}
