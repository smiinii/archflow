import { absolutePosition, type Graph, type Vertex } from "./model";
export const CARD_MIN = { width: 200, height: 148 };
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
export function readableLayout(g: Graph): Graph {
  let nodes = g.nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    width: Math.max(n.width, n.type === "group" ? 240 : CARD_MIN.width),
    height: Math.max(n.height, n.type === "group" ? 200 : CARD_MIN.height),
  }));
  // Pack children first, keeping their parent membership and all graph references.
  for (const group of nodes.filter((n) => n.type === "group")) {
    const children = nodes.filter((n) => n.parentId === group.id);
    const cols = Math.min(
      3,
      Math.max(1, Math.ceil(Math.sqrt(children.length))),
    );
    const cw = Math.max(CARD_MIN.width, ...children.map((n) => n.width)) + 100;
    const ch = Math.max(CARD_MIN.height, ...children.map((n) => n.height)) + 92;
    nodes = nodes.map((n) => {
      const i = children.findIndex((c) => c.id === n.id);
      return i < 0
        ? n
        : {
            ...n,
            position: {
              x: GROUP_PAD + (i % cols) * cw,
              y: GROUP_TITLE + Math.floor(i / cols) * ch,
            },
          };
    });
  }
  nodes = fitGroups({ ...g, nodes }).nodes;
  const roots = nodes.filter((n) => !n.parentId);
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(roots.length))));
  const cw = Math.max(0, ...roots.map((n) => n.width)) + 160;
  const ch = Math.max(0, ...roots.map((n) => n.height)) + 150;
  nodes = nodes.map((n) => {
    const i = roots.findIndex((r) => r.id === n.id);
    return i < 0
      ? n
      : {
          ...n,
          position: {
            x: 80 + (i % cols) * cw,
            y: 100 + Math.floor(i / cols) * ch,
          },
        };
  });
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
