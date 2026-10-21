import { type Graph, type Link } from "./model";
import { nodeRect, overlaps, type Rect } from "./readability";
export type Point = { x: number; y: number };
export type Route = {
  points: Point[];
  path: string;
  sourceHandle: string;
  targetHandle: string;
  label: (Rect & { text: string; anchor?: Point }) | null;
  blocked: boolean;
};
const length = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function crosses(a: Point, b: Point, r: Rect) {
  return a.x === b.x
    ? a.x > r.x &&
        a.x < r.x + r.width &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.height
    : a.y === b.y &&
        a.y > r.y &&
        a.y < r.y + r.height &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.width;
}
const inflate = (r: Rect, gap: number): Rect => ({
  x: r.x - gap,
  y: r.y - gap,
  width: r.width + gap * 2,
  height: r.height + gap * 2,
});
function port(r: Rect, side: string, offset = 0): Point {
  if (side === "left") return { x: r.x, y: r.y + r.height / 2 + offset };
  if (side === "right")
    return { x: r.x + r.width, y: r.y + r.height / 2 + offset };
  if (side === "top") return { x: r.x + r.width / 2 + offset, y: r.y };
  return { x: r.x + r.width / 2 + offset, y: r.y + r.height };
}
function extend(p: Point, side: string, gap: number): Point {
  return {
    x: p.x + (side === "right" ? gap : side === "left" ? -gap : 0),
    y: p.y + (side === "bottom" ? gap : side === "top" ? -gap : 0),
  };
}
class Heap {
  a: { key: string; score: number }[] = [];
  push(value: { key: string; score: number }) {
    let i = this.a.push(value) - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (this.a[p].score <= value.score) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = value;
  }
  pop() {
    const first = this.a[0],
      last = this.a.pop()!;
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1].score < this.a[c].score) c++;
        if (last.score <= this.a[c].score) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = last;
    }
    return first;
  }
}
// Rectilinear A*: route outside expanded cards. A bounded search reports failures instead of drawing through a card.
function search(
  a: Point,
  b: Point,
  obstacles: Rect[],
  used: Point[][],
  lane: number,
): Point[] | null {
  const margin = 10 + lane * 9;
  const xs = [
    ...new Set([
      a.x,
      b.x,
      ...obstacles.flatMap((r) => [r.x - margin, r.x + r.width + margin]),
    ]),
  ].sort((x, y) => x - y);
  const ys = [
    ...new Set([
      a.y,
      b.y,
      ...obstacles.flatMap((r) => [r.y - margin, r.y + r.height + margin]),
    ]),
  ].sort((x, y) => x - y);
  const start = `${xs.indexOf(a.x)},${ys.indexOf(a.y)},0`;
  const heap = new Heap();
  heap.push({ key: start, score: length(a, b) });
  const cost = new Map([[start, 0]]),
    prev = new Map<string, string>(),
    closed = new Set<string>();
  let end: string | null = null;
  while (heap.a.length && closed.size < 12000) {
    const key = heap.pop().key;
    if (closed.has(key)) continue;
    closed.add(key);
    const [xi, yi, dir] = key.split(",").map(Number);
    const p = { x: xs[xi], y: ys[yi] };
    if (p.x === b.x && p.y === b.y) {
      end = key;
      break;
    }
    for (const [dx, dy, nextDir] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 2],
      [0, -1, 2],
    ]) {
      const nx = xi + dx,
        ny = yi + dy;
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const q = { x: xs[nx], y: ys[ny] };
      if (obstacles.some((r) => crosses(p, q, r))) continue;
      const nextKey = `${nx},${ny},${nextDir}`;
      const shared = used.some((points) =>
        points.some((u, i) => {
          const v = points[i + 1];
          return (
            v &&
            ((u.x === v.x &&
              p.x === q.x &&
              p.x === u.x &&
              Math.min(p.y, q.y) < Math.max(u.y, v.y) &&
              Math.max(p.y, q.y) > Math.min(u.y, v.y)) ||
              (u.y === v.y &&
                p.y === q.y &&
                p.y === u.y &&
                Math.min(p.x, q.x) < Math.max(u.x, v.x) &&
                Math.max(p.x, q.x) > Math.min(u.x, v.x)))
          );
        }),
      );
      const value =
        cost.get(key)! +
        length(p, q) +
        (dir && dir !== nextDir ? 25 : 0) +
        (shared ? length(p, q) * 2 + 60 : 0);
      if (value >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, value);
      prev.set(nextKey, key);
      heap.push({ key: nextKey, score: value + length(q, b) });
    }
  }
  if (!end) return null;
  const points: Point[] = [];
  for (let key: string | undefined = end; key; key = prev.get(key)) {
    const [x, y] = key.split(",").map(Number);
    points.unshift({ x: xs[x], y: ys[y] });
  }
  return points.filter(
    (p, i) =>
      i === 0 ||
      i === points.length - 1 ||
      !(
        (points[i - 1].x === p.x && points[i + 1].x === p.x) ||
        (points[i - 1].y === p.y && points[i + 1].y === p.y)
      ),
  );
}
export function shortLabel(e: Link) {
  const label =
    e.data.label || (e.data.purpose === "dependency" ? "상태 확인" : "연결");
  const text = Array.from(label);
  return (
    (text.length > 12 ? text.slice(0, 12).join("") + "…" : label) +
    (e.data.traffic === "cache-miss"
      ? " · 미스"
      : e.data.condition
        ? " · 조건"
        : "") +
    (e.data.purpose === "dependency" ? " · 참조" : "")
  );
}
export function routeGraph(g: Graph): Record<string, Route> {
  const rects = new Map(g.nodes.map((n) => [n.id, nodeRect(n, g.nodes)]));
  const boxes = g.nodes
    .filter((n) => n.type !== "group")
    .map((n) => rects.get(n.id)!);
  const titles = g.nodes
    .filter((n) => n.type === "group")
    .map((n) => {
      const r = rects.get(n.id)!;
      return {
        x: r.x + 8,
        y: r.y + 6,
        width: Math.min(
          r.width - 16,
          Math.max(80, Array.from(n.data.name).length * 11 + 30),
        ),
        height: 28,
      };
    });
  const obstacles = [
    ...boxes.map((r) => inflate(r, 12)),
    ...titles.map((r) => inflate(r, 4)),
  ];
  const labels: Rect[] = [],
    used: Point[][] = [],
    result: Record<string, Route> = {};
  const siblings = new Map<string, number>();
  for (const e of g.edges) {
    const a = rects.get(e.source),
      b = rects.get(e.target);
    if (!a || !b) continue;
    const pair = [e.source, e.target].sort().join(":");
    const lane = siblings.get(pair) || 0;
    siblings.set(pair, lane + 1);
    const dx = b.x + b.width / 2 - a.x - a.width / 2,
      dy = b.y + b.height / 2 - a.y - a.height / 2;
    const sourceSide =
      e.sourceHandle?.split("-")[0] ||
      (Math.abs(dx) > Math.abs(dy)
        ? dx >= 0
          ? "right"
          : "left"
        : dy >= 0
          ? "bottom"
          : "top");
    const targetSide =
      e.targetHandle?.split("-")[0] ||
      { right: "left", left: "right", bottom: "top", top: "bottom" }[
        sourceSide
      ]!;
    const start = port(a, sourceSide, 6),
      end = port(b, targetSide, -6),
      out = extend(start, sourceSide, 26 + lane * 18),
      into = extend(end, targetSide, 26 + lane * 18);
    const middle = search(out, into, obstacles, used, lane);
    const blocked =
      !middle ||
      boxes.some(
        (r) =>
          (r !== a && crosses(start, out, inflate(r, 4))) ||
          (r !== b && crosses(into, end, inflate(r, 4))),
      );
    const points = middle ? [start, ...middle, end] : [];
    if (middle) used.push(points);
    const text = shortLabel(e),
      width = Math.min(
        220,
        Array.from(text).reduce(
          (w, c) => w + (/[\u2e80-\uffff]/.test(c) ? 11 : 6.5),
          20,
        ),
      );
    let label: Route["label"] = null;
    const segments = points
      .slice(1)
      .map((p, i) => ({ a: points[i], b: p }))
      .sort((a, b) => length(b.a, b.b) - length(a.a, a.b));
    for (const s of segments) {
      if (label) break;
      const size = length(s.a, s.b);
      if (size < 28) continue;
      for (const offset of [
        0, 28, -28, 56, -56, 140, -140, 220, -220, 360, -360,
      ]) {
        if (label) break;
        for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const anchor = {
            x: s.a.x + (s.b.x - s.a.x) * t,
            y: s.a.y + (s.b.y - s.a.y) * t,
          };
          const center = {
            x: anchor.x + (s.a.x === s.b.x ? offset : 0),
            y: anchor.y + (s.a.y === s.b.y ? offset : 0),
          };
          const candidate = {
            x: center.x - width / 2,
            y: center.y - 13,
            width,
            height: 26,
          };
          if (
            ![...boxes, ...titles, ...labels].some((r) =>
              overlaps(candidate, r, 8),
            ) &&
            ![...boxes, ...titles].some((r) => crosses(anchor, center, r))
          ) {
            label = { ...candidate, text, anchor: offset ? anchor : undefined };
            labels.push(candidate);
            break;
          }
        }
      }
    }
    result[e.id] = {
      points,
      path: points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
      sourceHandle: `${sourceSide}-out`,
      targetHandle: `${targetSide}-in`,
      label,
      blocked,
    };
  }
  return result;
}
