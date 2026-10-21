import { absolutePosition, type Vertex } from "./model";
export type Guide = {
  axis: "x" | "y";
  value: number;
  from: number;
  to: number;
  label: string;
};
export function snapPosition(
  moving: Vertex,
  nodes: Vertex[],
  excluded: string[],
  tolerance = 6,
) {
  const p = absolutePosition(moving, nodes),
    w = moving.width,
    h = moving.height;
  const refs = nodes
    .filter(
      (n) => !excluded.includes(n.id) && !excluded.includes(n.parentId || ""),
    )
    .map((n) => ({ ...absolutePosition(n, nodes), w: n.width, h: n.height }));
  const xs: { d: number; g: Guide }[] = [],
    ys: { d: number; g: Guide }[] = [];
  for (const r of refs) {
    for (const f of [0, 0.5, 1]) {
      const dx = r.x + r.w * f - (p.x + w * f),
        dy = r.y + r.h * f - (p.y + h * f);
      xs.push({
        d: dx,
        g: {
          axis: "x",
          value: r.x + r.w * f,
          from: Math.min(p.y, r.y) - 16,
          to: Math.max(p.y + h, r.y + r.h) + 16,
          label: f === 0.5 ? "중심" : "변 정렬",
        },
      });
      ys.push({
        d: dy,
        g: {
          axis: "y",
          value: r.y + r.h * f,
          from: Math.min(p.x, r.x) - 16,
          to: Math.max(p.x + w, r.x + r.w) + 16,
          label: f === 0.5 ? "중심" : "변 정렬",
        },
      });
    }
  }
  for (let i = 0; i < refs.length; i++)
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i],
        b = refs[j];
      if (Math.abs(a.y - b.y) < 12) {
        const target = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
        xs.push({
          d: target - (p.x + w / 2),
          g: {
            axis: "x",
            value: target,
            from: Math.min(a.y, b.y, p.y) - 20,
            to: Math.max(a.y + a.h, b.y + b.h, p.y + h) + 20,
            label: "좌우 대칭",
          },
        });
        const left = a.x < b.x ? a : b,
          right = a.x < b.x ? b : a;
        if (left.x + left.w <= p.x && right.x >= p.x + w) {
          const x = (left.x + left.w + right.x - w) / 2;
          xs.push({
            d: x - p.x,
            g: {
              axis: "x",
              value: x + w / 2,
              from: p.y - 15,
              to: p.y + h + 15,
              label: "같은 간격",
            },
          });
        }
      }
      if (Math.abs(a.x - b.x) < 12) {
        const top = a.y < b.y ? a : b,
          bottom = a.y < b.y ? b : a;
        if (top.y + top.h <= p.y && bottom.y >= p.y + h) {
          const y = (top.y + top.h + bottom.y - h) / 2;
          ys.push({
            d: y - p.y,
            g: {
              axis: "y",
              value: y + h / 2,
              from: p.x - 15,
              to: p.x + w + 15,
              label: "같은 간격",
            },
          });
        }
      }
    }
  const nearest = (a: typeof xs) =>
    a
      .filter((c) => Math.abs(c.d) <= tolerance)
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
  const x = nearest(xs),
    y = nearest(ys);
  return {
    dx: x?.d || 0,
    dy: y?.d || 0,
    guides: [x?.g, y?.g].filter(Boolean) as Guide[],
  };
}
