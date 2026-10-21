import { resolveCardStyle } from "./appearance";
import { absolutePosition, type Graph, type Vertex } from "./model";
export const CARD_MIN = { width: 200, height: 140 };
export const GROUP_PAD = 28,
  GROUP_TITLE = 48;
export type Rect = { x: number; y: number; width: number; height: number };
export const overlaps = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y;
export const nodeRect = (n: Vertex, nodes: Vertex[]): Rect => ({
  ...absolutePosition(n, nodes),
  width: n.type === "group" ? n.width : Math.max(n.width, CARD_MIN.width),
  height: n.type === "group" ? n.height : Math.max(n.height, CARD_MIN.height),
});
export function flowView(
  g: Graph,
  flowId: string | null,
  focused: boolean,
): Graph {
  if (!flowId) return g;
  const edges = g.edges.filter((e) => e.data.flowIds.includes(flowId));
  if (!focused) return g;
  const f = g.flows.find((f) => f.id === flowId);
  const ids = new Set(edges.flatMap((e) => [e.source, e.target]));
  for (const id of [f?.entryId, f?.responseId, f?.completionId])
    if (id) ids.add(id);
  for (const n of g.nodes) if (ids.has(n.id) && n.parentId) ids.add(n.parentId);
  return { ...g, nodes: g.nodes.filter((n) => ids.has(n.id)), edges };
}
// Group bounds follow only visible children; relative coordinates retain their absolute locations.
export function fitGroups(g: Graph, onlyId?: string): Graph {
  let nodes = g.nodes.map((n) => ({ ...n, position: { ...n.position } }));
  for (const group of nodes.filter(
    (n) => n.type === "group" && (!onlyId || n.id === onlyId),
  )) {
    const children = nodes.filter((n) => n.parentId === group.id);
    if (!children.length) continue;
    const boxes = children.map((n) => nodeRect(n, nodes));
    const x = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD;
    const y = Math.min(...boxes.map((b) => b.y)) - GROUP_TITLE;
    const width = Math.max(...boxes.map((b) => b.x + b.width)) - x + GROUP_PAD;
    const height =
      Math.max(...boxes.map((b) => b.y + b.height)) - y + GROUP_PAD;
    const shift = { x: group.position.x - x, y: group.position.y - y };
    nodes = nodes.map((n) =>
      n.id === group.id
        ? { ...n, position: { x, y }, width, height }
        : n.parentId === group.id
          ? {
              ...n,
              position: {
                x: n.position.x + shift.x,
                y: n.position.y + shift.y,
              },
            }
          : n,
    );
  }
  return { ...g, nodes };
}
export function layoutWarnings(g: Graph) {
  const warnings: string[] = [];
  const components = g.nodes.filter((n) => n.type === "component");
  for (const n of components) {
    if (n.width < CARD_MIN.width || n.height < CARD_MIN.height)
      warnings.push(
        `${n.data.name}: 최소 ${CARD_MIN.width}×${CARD_MIN.height}px이 필요합니다. 기술·이름 두 줄·상태 영역을 확보합니다.`,
      );
    const parent = g.nodes.find((p) => p.id === n.parentId);
    if (
      parent &&
      (n.position.x < GROUP_PAD ||
        n.position.y < GROUP_TITLE ||
        n.position.x + n.width > parent.width - GROUP_PAD ||
        n.position.y + n.height > parent.height - GROUP_PAD)
    )
      warnings.push(`${n.data.name}: 그룹 제목 또는 경계와 여백이 부족합니다.`);
  }
  for (let i = 0; i < components.length; i++)
    for (let j = i + 1; j < components.length; j++)
      if (
        overlaps(
          nodeRect(components[i], g.nodes),
          nodeRect(components[j], g.nodes),
          8,
        )
      )
        warnings.push(
          `${components[i].data.name} ↔ ${components[j].data.name}: 박스가 겹치거나 간격이 좁습니다.`,
        );
  const groups = g.nodes.filter((n) => n.type === "group");
  for (const group of groups)
    for (const n of g.nodes.filter((n) => !n.parentId && n.id !== group.id))
      if (
        overlaps(nodeRect(group, g.nodes), nodeRect(n, g.nodes), 12) &&
        (n.type !== "group" || group.id < n.id)
      )
        warnings.push(
          `${group.data.name} ↔ ${n.data.name}: 그룹 경계가 겹칩니다.`,
        );
  return warnings;
}
export const positionIsFixed = (n: Vertex, nodes: Vertex[]) =>
  !!n.data.positionLocked ||
  !!nodes.find((p) => p.id === n.parentId)?.data.positionLocked ||
  (n.type === "group" &&
    nodes.some((c) => c.parentId === n.id && c.data.positionLocked));
// Breadth-first columns give a left-to-right reading order. Back edges remain in the graph.
function flowRanks(
  nodes: Vertex[],
  g: Graph,
  collapse: (id: string) => string,
) {
  const ids = new Set(nodes.map((n) => n.id));
  const links = g.edges
    .filter(
      (e) => e.data.kind !== "relation" && e.data.purpose !== "dependency",
    )
    .map((e) => ({ source: collapse(e.source), target: collapse(e.target) }))
    .filter(
      (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
    );
  const ranks = new Map<string, number>();
  const roots = [
    ...new Set([
      ...nodes.filter((n) => n.data.catalogId === "client").map((n) => n.id),
      ...nodes
        .filter((n) => !links.some((e) => e.target === n.id))
        .map((n) => n.id),
      ...g.flows
        .map((f) => (f.entryId ? collapse(f.entryId) : ""))
        .filter((id) => ids.has(id)),
    ]),
  ];
  for (const root of [...roots, ...nodes.map((n) => n.id)]) {
    if (ranks.has(root)) continue;
    ranks.set(root, 0);
    const queue = [root];
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of links.filter((e) => e.source === id))
        if (!ranks.has(e.target)) {
          ranks.set(e.target, ranks.get(id)! + 1);
          queue.push(e.target);
        }
    }
  }
  return ranks;
}
function packColumns(
  nodes: Vertex[],
  ranks: Map<string, number>,
  fixed: Set<string>,
  origin: { x: number; y: number },
) {
  const widths = new Map<number, number>();
  for (const n of nodes)
    widths.set(
      ranks.get(n.id) || 0,
      Math.max(widths.get(ranks.get(n.id) || 0) || 0, n.width),
    );
  const xs = new Map<number, number>();
  let x = origin.x;
  for (const rank of [...widths.keys()].sort((a, b) => a - b)) {
    xs.set(rank, x);
    x += widths.get(rank)! + 76;
  }
  const occupied: Rect[] = nodes
    .filter((n) => fixed.has(n.id))
    .map((n) => ({ ...n.position, width: n.width, height: n.height }));
  const nextY = new Map<number, number>();
  return nodes.map((n) => {
    if (fixed.has(n.id)) return n;
    const rank = ranks.get(n.id) || 0;
    let candidate = {
      x: xs.get(rank) || origin.x,
      y: nextY.get(rank) || origin.y,
      width: n.width,
      height: n.height,
    };
    let blockers = occupied.filter((r) => overlaps(candidate, r, 36));
    while (blockers.length) {
      candidate = {
        ...candidate,
        y: Math.max(...blockers.map((r) => r.y + r.height)) + 40,
      };
      blockers = occupied.filter((r) => overlaps(candidate, r, 36));
    }
    occupied.push(candidate);
    nextY.set(rank, candidate.y + n.height + 48);
    return { ...n, position: { x: candidate.x, y: candidate.y } };
  });
}
export function readableLayout(g: Graph): Graph {
  const fixedRoots = new Set(
    g.nodes
      .filter((n) => !n.parentId && positionIsFixed(n, g.nodes))
      .map((n) => n.id),
  );
  // A group containing an anchored child stays intact, including its local coordinates.
  let nodes = g.nodes.map((n) =>
    fixedRoots.has(n.id) || (n.parentId && fixedRoots.has(n.parentId))
      ? n
      : {
          ...n,
          position: { ...n.position },
          width: n.type === "component" ? CARD_MIN.width : n.width,
          height: n.type === "component" ? CARD_MIN.height : n.height,
        },
  );
  for (const group of nodes.filter(
    (n) => n.type === "group" && !fixedRoots.has(n.id),
  )) {
    const children = nodes.filter((n) => n.parentId === group.id);
    const placed = packColumns(
      children,
      flowRanks(children, g, (id) => id),
      new Set(),
      { x: GROUP_PAD, y: GROUP_TITLE },
    );
    nodes = nodes.map((n) => placed.find((p) => p.id === n.id) || n);
    nodes = fitGroups({ ...g, nodes }, group.id).nodes;
  }
  const roots = nodes.filter((n) => !n.parentId);
  const collapse = (id: string) =>
    nodes.find((n) => n.id === id)?.parentId || id;
  const placed = packColumns(roots, flowRanks(roots, g, collapse), fixedRoots, {
    x: 80,
    y: 100,
  });
  nodes = nodes.map((n) => placed.find((p) => p.id === n.id) || n);
  return { ...g, nodes };
}
export type Change = {
  id: string;
  name: string;
  scope: "node" | "edge";
  kinds: string[];
};
export function compareGraphs(base: Graph, next: Graph): Change[] {
  const changes: Change[] = [];
  for (const n of next.nodes) {
    const prev = base.nodes.find((x) => x.id === n.id);
    const kinds: string[] = [];
    if (!prev) kinds.push("추가");
    else {
      if (
        JSON.stringify(resolveCardStyle(prev.data.style)) !==
        JSON.stringify(resolveCardStyle(n.data.style))
      )
        kinds.push("디자인 변경");
      if (!!prev.data.positionLocked !== !!n.data.positionLocked)
        kinds.push("위치 고정 변경");
      if (prev.parentId !== n.parentId) kinds.push("그룹 변경");
      if (
        JSON.stringify(absolutePosition(prev, base.nodes)) !==
        JSON.stringify(absolutePosition(n, next.nodes))
      )
        kinds.push("이동");
      if (prev.width !== n.width || prev.height !== n.height)
        kinds.push("크기 변경");
      if (
        prev.data.name !== n.data.name ||
        prev.data.catalogId !== n.data.catalogId ||
        prev.type !== n.type
      )
        kinds.push("이름·기술 변경");
    }
    if (kinds.length)
      changes.push({ id: n.id, name: n.data.name, scope: "node", kinds });
  }
  for (const n of base.nodes)
    if (!next.nodes.some((x) => x.id === n.id))
      changes.push({
        id: n.id,
        name: n.data.name,
        scope: "node",
        kinds: ["삭제"],
      });
  for (const e of next.edges) {
    const prev = base.edges.find((x) => x.id === e.id);
    const kinds = !prev
      ? ["추가"]
      : prev.source !== e.source || prev.target !== e.target
        ? ["연결 대상 변경"]
        : prev.data.kind !== e.data.kind ||
            (prev.data.purpose || "delivery") !== (e.data.purpose || "delivery")
          ? ["연결 종류 변경"]
          : [];
    if (kinds.length)
      changes.push({
        id: e.id,
        name: e.data.label || e.id,
        scope: "edge",
        kinds,
      });
  }
  for (const e of base.edges)
    if (!next.edges.some((x) => x.id === e.id))
      changes.push({
        id: e.id,
        name: e.data.label || e.id,
        scope: "edge",
        kinds: ["삭제"],
      });
  return changes;
}
export function sharedLayout(base: Graph, next: Graph): Graph {
  const nodes = next.nodes.map((n) => {
    const old = base.nodes.find((x) => x.id === n.id);
    return old
      ? {
          ...n,
          width: old.width,
          height: old.height,
          data: { ...n.data, name: old.data.name },
          position: { ...absolutePosition(old, base.nodes) },
        }
      : { ...n, position: { ...absolutePosition(n, next.nodes) } };
  });
  return {
    ...next,
    nodes: nodes.map((n) => {
      const parent = nodes.find((x) => x.id === n.parentId);
      return parent
        ? {
            ...n,
            position: {
              x: n.position.x - parent.position.x,
              y: n.position.y - parent.position.y,
            },
          }
        : n;
    }),
  };
}
