import { absolutePosition, type Graph, type Link, type Vertex } from "./model";
import { readableLayout } from "./readability";
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
const storage = (n?: Vertex) =>
  !!n &&
  /postgres|mysql|sql|redis|cache|s3|storage|blob|db|mongo/.test(
    n.data.catalogId,
  );
// A conservative legacy summary. Explicit AI/user mainEdgeIds always take priority.
export function primaryEdges(g: Graph, flowIds: string[]) {
  const edges = g.edges.filter((e) =>
    flowIds.some((id) => e.data.flowIds.includes(id)),
  );
  const explicit = g.views?.features?.find(
    (f) =>
      f.flowIds.length === flowIds.length &&
      f.flowIds.every((id) => flowIds.includes(id)),
  )?.mainEdgeIds;
  if (explicit)
    return edges.filter(
      (e) => explicit.includes(e.id) && e.data.detailLevel !== "detail",
    );
  const chosen = new Set<string>();
  for (const fid of flowIds) {
    const flow = g.flows.find((f) => f.id === fid);
    if (!flow) continue;
    const candidates = edges.filter(
      (e) =>
        e.data.flowIds.includes(fid) &&
        e.data.detailLevel !== "detail" &&
        e.data.purpose !== "dependency" &&
        e.data.kind !== "relation",
    );
    const seen = new Set<string>();
    const queue = flow.entryId ? [flow.entryId] : [];
    for (const e of candidates)
      if (
        e.target === flow.entryId &&
        g.nodes.find((n) => n.id === e.source)?.data.catalogId === "client"
      )
        chosen.add(e.id);
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const outgoing = candidates.filter((e) => e.source === id);
      const continuation = outgoing.some(
        (e) => !storage(g.nodes.find((n) => n.id === e.target)),
      );
      for (const e of outgoing) {
        if (seen.has(e.target)) continue;
        if (
          continuation &&
          storage(g.nodes.find((n) => n.id === e.target)) &&
          e.data.detailLevel !== "main"
        )
          continue;
        chosen.add(e.id);
        queue.push(e.target);
      }
    }
    // A disconnected explicitly marked main edge remains visible.
    for (const e of candidates)
      if (e.data.detailLevel === "main") chosen.add(e.id);
  }
  return edges.filter((e) => chosen.has(e.id));
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
  if (mode === "all")
    return {
      graph: g,
      bundles,
      groups,
      boundaries,
      hiddenEdges: 0,
      automatic: false,
    };
  let selected: Link[];
  if (expandedId) {
    const family = new Set([
      expandedId,
      ...g.nodes.filter((n) => n.parentId === expandedId).map((n) => n.id),
    ]);
    const incident = g.edges.filter(
      (e) => family.has(e.source) || family.has(e.target),
    );
    selected = incident;
  } else if (mode === "function") selected = primaryEdges(g, flowIds);
  else
    selected = g.views?.overviewEdgeIds
      ? g.edges.filter((e) => g.views!.overviewEdgeIds!.includes(e.id))
      : g.edges.filter(
          (e) =>
            e.data.detailLevel !== "detail" && e.data.purpose !== "dependency",
        );
  let nodes: Vertex[];
  if (mode === "overview" && !expandedId) {
    const root = (id: string) =>
      g.nodes.find((n) => n.id === id)?.parentId || id;
    const pairs = new Map<string, Link>();
    for (const e of selected) {
      const source = root(e.source),
        target = root(e.target);
      if (source === target) continue;
      const key = [source, target, e.data.kind].join(":");
      const prev = pairs.get(key);
      if (prev) {
        bundles[prev.id].push(e.id);
        prev.data.flowIds = [
          ...new Set([...prev.data.flowIds, ...e.data.flowIds]),
        ];
        prev.data.label = `연결 ${bundles[prev.id].length}개`;
      } else {
        const copy = {
          ...e,
          source,
          target,
          sourceHandle: null,
          targetHandle: null,
          data: { ...e.data, flowIds: [...e.data.flowIds] },
        };
        pairs.set(key, copy);
        bundles[e.id] = [e.id];
      }
    }
    selected = [...pairs.values()];
    const included = g.views?.overviewNodeIds
      ? new Set(g.views.overviewNodeIds.map(root))
      : null;
    const compactLegacy =
      !included &&
      g.nodes.some((n) => n.type === "group") &&
      g.nodes.filter((n) => !n.parentId).length > 8;
    nodes = g.nodes
      .filter(
        (n) =>
          !n.parentId &&
          (!included || included.has(n.id)) &&
          (!compactLegacy ||
            n.type === "group" ||
            !/queue|sqs|kafka|lambda|worker/.test(n.data.catalogId)),
      )
      .map((n) => {
        if (n.type !== "group") return n;
        groups[n.id] = g.nodes.filter((c) => c.parentId === n.id).length;
        return {
          ...n,
          type: "component" as const,
          width: 200,
          height: 140,
          data: { ...n.data, style: { backgroundColor: "#F8FAFC" as const } },
        };
      });
  } else {
    const ids = new Set(selected.flatMap((e) => [e.source, e.target]));
    if (expandedId) {
      ids.add(expandedId);
      for (const n of g.nodes) if (n.parentId === expandedId) ids.add(n.id);
    }
    for (const fid of expandedId ? [] : flowIds) {
      const f = g.flows.find((f) => f.id === fid);
      if (f?.entryId) ids.add(f.entryId);
    }
    nodes = g.nodes
      .filter((n) => ids.has(n.id) && n.type === "component")
      .map((n) => {
        if (n.parentId)
          boundaries[n.id] =
            g.nodes.find((p) => p.id === n.parentId)?.data.name || "";
        return {
          ...n,
          parentId: undefined,
          position: absolutePosition(n, g.nodes),
        };
      });
    selected = selected.filter(
      (e) =>
        nodes.some((n) => n.id === e.source) &&
        nodes.some((n) => n.id === e.target),
    );
  }
  const visibleIds = new Set(nodes.map((n) => n.id));
  selected = selected.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );
  const view = readableLayout({ ...g, nodes, edges: selected });
  // Read left-to-right in short rows, rather than shrinking an unbounded chain.
  const ordered = [...view.nodes].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  );
  const columns = Math.min(
    4,
    Math.max(1, Math.ceil(Math.sqrt(ordered.length * 1.5))),
  );
  const positions = new Map(
    ordered.map((n, i) => [
      n.id,
      { x: 80 + (i % columns) * 300, y: 100 + Math.floor(i / columns) * 240 },
    ]),
  );
  if (mode === "overview" && !expandedId) {
    const clients = ordered.filter((n) => n.data.catalogId === "client");
    const others = ordered
      .filter((n) => n.data.catalogId !== "client")
      .sort(
        (a, b) =>
          (b.data.catalogId === "group" ? 1 : 0) -
          (a.data.catalogId === "group" ? 1 : 0),
      );
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(others.length))));
    clients.forEach((n, i) => positions.set(n.id, { x: 80, y: 100 + i * 240 }));
    others.forEach((n, i) =>
      positions.set(n.id, {
        x: 80 + ((i % cols) + (clients.length ? 1 : 0)) * 300,
        y: 100 + Math.floor(i / cols) * 240,
      }),
    );
  }
  view.nodes = view.nodes.map((n) =>
    g.nodes.find((o) => o.id === n.id)?.data.positionLocked
      ? n
      : { ...n, position: positions.get(n.id)! },
  );
  const represented = new Set(selected.flatMap((e) => bundles[e.id] || [e.id]));
  return {
    graph: view,
    bundles,
    groups,
    boundaries,
    hiddenEdges: g.edges.filter((e) => !represented.has(e.id)).length,
    automatic: !g.views,
  };
}
