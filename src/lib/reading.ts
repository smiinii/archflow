import type { Graph, Link } from "./model";
export type ReadingMode = "overview" | "function" | "all";
export function functionsFor(g: Graph) {
  return g.views?.features?.length
    ? g.views.features
    : g.flows.map((f) => ({
        id: f.id,
        name: f.name,
        flowIds: [f.id],
        mainEdgeIds: undefined,
      }));
}
export function readingView(
  g: Graph,
  mode: ReadingMode,
  flowIds: string[] = [],
  expandedId: string | null = null,
) {
  const bundles: Record<string, string[]> = {};
  const groups: Record<string, number> = {};
  const boundaries: Record<string, string> = {};
  // Reading is a filter over the saved graph, never a second layout or summary.
  // Legacy overview metadata stays in storage but must not hide any real elements.
  if (mode === "all" || (mode === "overview" && !expandedId))
    return {
      graph: g,
      bundles,
      groups,
      boundaries,
      hiddenEdges: 0,
      automatic: false,
    };
  const ids = new Set<string>();
  let selected: Link[];
  if (expandedId) {
    const family = new Set([
      expandedId,
      ...g.nodes.filter((n) => n.parentId === expandedId).map((n) => n.id),
    ]);
    for (const id of family) ids.add(id);
    // Details include all incident calls, even those in a different function.
    selected = g.edges.filter(
      (e) => family.has(e.source) || family.has(e.target),
    );
  } else {
    selected = g.edges.filter((e) =>
      flowIds.some((id) => e.data.flowIds.includes(id)),
    );
    for (const flow of g.flows.filter((f) => flowIds.includes(f.id))) {
      if (flow.entryId) ids.add(flow.entryId);
      for (const id of flow.requiredIds) ids.add(id);
    }
  }
  for (const edge of selected) {
    ids.add(edge.source);
    ids.add(edge.target);
  }
  // Keep original parents and relative coordinates; do not flatten or resize groups.
  for (const node of g.nodes)
    if (ids.has(node.id) && node.parentId) ids.add(node.parentId);
  const nodes = g.nodes.filter((n) => ids.has(n.id));
  return {
    graph: { ...g, nodes, edges: selected },
    bundles,
    groups,
    boundaries,
    hiddenEdges: g.edges.length - selected.length,
    automatic: false,
  };
}
