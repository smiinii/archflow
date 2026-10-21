import { getItem } from "./catalog";
import type { Flow, Graph, Params } from "./model";
export type Metric = {
  demand: number | null;
  capacity: number | null;
  ratio: number | null;
  overload: boolean;
  slow: boolean;
  bad: boolean;
};
export function capacity(p: Params) {
  return p.basis !== "unknown" &&
    p.meanMs !== null &&
    p.meanMs > 0 &&
    p.slots !== null
    ? (p.slots * p.replicas * 1000) / p.meanMs
    : null;
}
export function analyze(g: Graph, flow: Flow) {
  const nodes = new Map(
    g.nodes
      .filter(
        (n) => n.type === "component" && !getItem(n.data.catalogId).structural,
      )
      .map((n) => [n.id, n]),
  );
  const edges = g.edges.filter(
    (e) =>
      e.data.flowIds.includes(flow.id) &&
      e.data.kind !== "relation" &&
      e.data.purpose !== "dependency" &&
      nodes.has(e.source) &&
      nodes.has(e.target),
  );
  const root = flow.entryId && nodes.has(flow.entryId) ? flow.entryId : null;
  const reachable = (sync = false) => {
    const seen = new Set<string>(root ? [root] : []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (sync && e.data.kind !== "sync") continue;
        if (seen.has(e.source) && !seen.has(e.target)) {
          seen.add(e.target);
          changed = true;
        }
      }
    }
    return seen;
  };
  const reached = reachable(),
    sync = reachable(true);
  const indegree = new Map(
    [...reached].map((id) => [
      id,
      edges.filter((e) => reached.has(e.source) && e.target === id).length,
    ]),
  );
  const queue = [...reached].filter((id) => indegree.get(id) === 0),
    order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of edges.filter((e) => e.source === id)) {
      indegree.set(e.target, indegree.get(e.target)! - 1);
      if (indegree.get(e.target) === 0) queue.push(e.target);
    }
  }
  const cyclic = order.length < reached.size;
  const loads = new Map<string, number | null>();
  if (root) loads.set(root, flow.trafficBasis === "unknown" ? null : flow.rps);
  if (!cyclic)
    for (const id of order) {
      const incoming = edges.filter(
        (e) => e.target === id && reached.has(e.source),
      );
      if (incoming.length)
        loads.set(
          id,
          incoming.some(
            (e) =>
              loads.get(e.source) == null ||
              e.data.callsBasis === "unknown" ||
              (e.data.traffic === "cache-miss" &&
                flow.cacheBasis === "unknown"),
          )
            ? null
            : incoming.reduce(
                (sum, e) =>
                  sum +
                  loads.get(e.source)! *
                    e.data.calls *
                    (e.data.traffic === "cache-miss"
                      ? 1 - flow.hitPercent / 100
                      : 1),
                0,
              ),
        );
    }
  const required = flow.requiredIds.filter(
    (id) => sync.has(id) && nodes.get(id)?.data.catalogId !== "client",
  );
  // Longest synchronous dependency chain, never a sum of parallel siblings.
  const costs = new Map<string, number | null>(),
    chains = new Map<string, string[]>();
  if (root) {
    const entry = nodes.get(root)!;
    const p = entry.data.params;
    const client = entry.data.catalogId === "client";
    costs.set(
      root,
      client
        ? 0
        : p.basis === "unknown" || p.meanMs === null || p.networkMs === null
          ? null
          : p.meanMs + p.networkMs,
    );
    chains.set(root, client ? [] : [root]);
  }
  if (!cyclic)
    for (const id of order) {
      if (id === root || !sync.has(id)) continue;
      const p = nodes.get(id)!.data.params;
      const prev = edges.filter(
        (e) => e.target === id && e.data.kind === "sync" && sync.has(e.source),
      );
      if (
        p.basis === "unknown" ||
        p.meanMs === null ||
        p.networkMs === null ||
        prev.some((e) => costs.get(e.source) == null)
      ) {
        costs.set(id, null);
        continue;
      }
      const critical = prev.reduce(
        (a, b) =>
          (costs.get(a.source) || 0) >= (costs.get(b.source) || 0) ? a : b,
        prev[0],
      );
      if (critical) {
        costs.set(id, costs.get(critical.source)! + p.meanMs + p.networkMs);
        chains.set(id, [...(chains.get(critical.source) || []), id]);
      }
    }
  const targets = required.length ? required : [];
  const delayKnown =
    !!root &&
    !cyclic &&
    targets.length > 0 &&
    targets.every((id) => costs.get(id) != null);
  const last = delayKnown
    ? targets.reduce((a, b) => (costs.get(a)! >= costs.get(b)! ? a : b))
    : null;
  const latency = last ? costs.get(last)! : null;
  const availability =
    !cyclic &&
    required.length &&
    required.every(
      (id) =>
        nodes.get(id)!.data.params.basis !== "unknown" &&
        nodes.get(id)!.data.params.availability !== null,
    )
      ? required.reduce(
          (product, id) =>
            (product * nodes.get(id)!.data.params.availability!) / 100,
          1,
        ) * 100
      : null;
  return {
    loads,
    reached,
    sync,
    required,
    cyclic,
    latency,
    criticalPath: last ? chains.get(last) || [] : [],
    availability,
    hasEntry: !!root,
  };
}
export function allMetrics(
  g: Graph,
  flowId: string | null,
): Record<string, Metric> {
  const results = g.flows
    .filter((f) => !flowId || f.id === flowId)
    .map((f) => analyze(g, f));
  return Object.fromEntries(
    g.nodes.map((n) => {
      const p = n.data.params;
      const relevant = results.filter((r) => r.reached.has(n.id));
      const structural =
        n.type === "group" || getItem(n.data.catalogId).structural;
      const demand = structural
        ? null
        : ((p.basis === "unknown" ? null : p.demand) ??
          (relevant.length && !relevant.some((r) => r.loads.get(n.id) == null)
            ? relevant.reduce((s, r) => s + r.loads.get(n.id)!, 0)
            : null));
      const c =
          structural || n.data.catalogId === "client" ? null : capacity(p),
        ratio = demand !== null && c !== null ? demand / c : null,
        overload = ratio !== null && ratio >= 1,
        slow =
          p.basis !== "unknown" &&
          demand !== null &&
          demand > 0 &&
          p.meanMs !== null &&
          p.budgetMs !== null &&
          p.meanMs > p.budgetMs;
      return [
        n.id,
        { demand, capacity: c, ratio, overload, slow, bad: overload || slow },
      ];
    }),
  );
}
export const fmt = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "미지정"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(
        n,
      );
export const percent = (n: number | null) =>
  n === null ? "미지정" : fmt(n, 4) + "%";
