import { z } from "zod";
import { cardStyleSchema } from "./appearance";

const id = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_-]+$/);
const num = (max = 1e9) => z.number().finite().min(0).max(max);
const point = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
});
export const paramsSchema = z.object({
  meanMs: num(600000).nullable(),
  slots: z.number().int().min(1).max(100000).nullable(),
  replicas: z.number().int().min(1).max(10000),
  availability: num(100).nullable(),
  networkMs: num(600000).nullable(),
  budgetMs: num(600000).nullable(),
  demand: num().nullable(),
  basis: z.enum(["assumption", "measured", "unknown"]),
});
export const vertexSchema = z.object({
  id,
  type: z.enum(["component", "group"]),
  position: point,
  width: z.number().min(140).max(10000),
  height: z.number().min(100).max(10000),
  parentId: id.optional(),
  data: z.object({
    catalogId: z.string().max(180),
    name: z.string().min(1).max(80),
    note: z.string().max(4000),
    params: paramsSchema,
    style: cardStyleSchema.optional(),
    positionLocked: z.boolean().optional(),
  }),
});
export const linkSchema = z.object({
  id,
  source: id,
  target: id,
  sourceHandle: z
    .enum(["top-out", "right-out", "bottom-out", "left-out"])
    .nullable()
    .optional(),
  targetHandle: z
    .enum(["top-in", "right-in", "bottom-in", "left-in"])
    .nullable()
    .optional(),
  data: z.object({
    kind: z.enum(["sync", "async", "relation"]),
    label: z.string().max(100),
    flowIds: z.array(id).max(200),
    calls: num(10000),
    traffic: z.enum(["all", "cache-miss"]),
    purpose: z.enum(["delivery", "dependency"]).optional(),
    detailLevel: z.enum(["main", "detail"]).optional(),
    note: z.string().max(4000).optional(),
    condition: z.string().max(200).optional(),
    callsBasis: z.enum(["assumption", "measured", "unknown"]).optional(),
  }),
});
export const flowSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "EVENT"]),
  route: z.string().max(200),
  entryId: id.nullable(),
  rps: num().nullable(),
  hitPercent: num(100),
  trafficBasis: z.enum(["assumption", "measured", "unknown"]).optional(),
  cacheBasis: z.enum(["assumption", "measured", "unknown"]).optional(),
  responseId: id.nullable().optional(),
  completionId: id.nullable().optional(),
  latencyTarget: num(600000).nullable(),
  availabilityTarget: num(100).nullable(),
  requiredIds: z.array(id).max(1000),
});
export const graphSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(vertexSchema).max(1000),
    edges: z.array(linkSchema).max(4000),
    flows: z.array(flowSchema).max(200),
    views: z
      .object({
        overviewEdgeIds: z.array(id).max(4000).optional(),
        overviewNodeIds: z.array(id).max(1000).optional(),
        features: z
          .array(
            z.object({
              id,
              name: z.string().min(1).max(80),
              flowIds: z.array(id).min(1).max(200),
              mainEdgeIds: z.array(id).max(4000).optional(),
            }),
          )
          .max(200)
          .optional(),
      })
      .optional(),
  })
  .superRefine((g, ctx) => {
    const nodes = new Map(g.nodes.map((n) => [n.id, n]));
    const flows = new Set(g.flows.map((f) => f.id));
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    for (const key of ["nodes", "edges", "flows"] as const) {
      const seen = new Set<string>();
      g[key].forEach((item, i) => {
        if (seen.has(item.id))
          issue(
            [key, i, "id"],
            `중복 ID ${item.id}입니다. 서로 다른 ID를 지정해 주세요.`,
          );
        seen.add(item.id);
      });
    }
    const edgeIds = new Set(g.edges.map((e) => e.id));
    const featureIds = new Set<string>();
    g.views?.overviewNodeIds?.forEach((nid, i) => {
      if (!nodes.has(nid))
        issue(
          ["views", "overviewNodeIds", i],
          `존재하는 구성요소 ID를 지정해 주세요: ${nid}`,
        );
    });
    g.views?.overviewEdgeIds?.forEach((eid, i) => {
      if (!edgeIds.has(eid))
        issue(
          ["views", "overviewEdgeIds", i],
          `존재하는 연결 ID를 지정해 주세요: ${eid}`,
        );
    });
    g.views?.features?.forEach((f, i) => {
      if (featureIds.has(f.id))
        issue(["views", "features", i, "id"], "기능 ID가 중복됩니다.");
      featureIds.add(f.id);
      f.flowIds.forEach((fid, j) => {
        if (!flows.has(fid))
          issue(
            ["views", "features", i, "flowIds", j],
            `존재하는 요청 ID를 지정해 주세요: ${fid}`,
          );
      });
      f.mainEdgeIds?.forEach((eid, j) => {
        const e = g.edges.find((e) => e.id === eid);
        if (!e || !e.data.flowIds.some((fid) => f.flowIds.includes(fid)))
          issue(
            ["views", "features", i, "mainEdgeIds", j],
            `이 기능에 포함된 연결 ID를 지정해 주세요: ${eid}`,
          );
      });
    });
    g.nodes.forEach((n, i) => {
      if (n.type === "group" && n.data.style)
        issue(
          ["nodes", i, "data", "style"],
          "카드 디자인은 component에만 지정합니다. 그룹의 data.style을 제거해 주세요.",
        );
      if (
        n.parentId &&
        (n.type === "group" ||
          n.parentId === n.id ||
          nodes.get(n.parentId)?.type !== "group" ||
          nodes.get(n.parentId)?.parentId)
      )
        issue(
          ["nodes", i, "parentId"],
          "부모 그룹 ID를 확인해 주세요. 중첩 그룹은 지원하지 않습니다.",
        );
    });
    g.edges.forEach((e, i) => {
      for (const field of ["source", "target"] as const)
        if (!nodes.has(e[field]))
          issue(["edges", i, field], `${e[field]} 구성요소가 없습니다.`);
      if (e.source === e.target)
        issue(["edges", i, "target"], "자기 자신을 연결할 수 없습니다.");
      const seen = new Set<string>();
      e.data.flowIds.forEach((id, j) => {
        if (!flows.has(id) || seen.has(id))
          issue(
            ["edges", i, "data", "flowIds", j],
            `존재하는 요청 ID를 중복 없이 지정해 주세요: ${id}`,
          );
        seen.add(id);
      });
    });
    g.flows.forEach((f, i) => {
      for (const key of ["entryId", "responseId", "completionId"] as const)
        if (f[key] && !nodes.has(f[key]!))
          issue(["flows", i, key], `${f[key]} 구성요소가 없습니다.`);
      const seen = new Set<string>();
      f.requiredIds.forEach((id, j) => {
        if (!nodes.has(id) || seen.has(id))
          issue(
            ["flows", i, "requiredIds", j],
            `존재하는 구성요소를 중복 없이 지정해 주세요: ${id}`,
          );
        seen.add(id);
      });
    });
  });
export type Params = z.infer<typeof paramsSchema>;
export type Vertex = z.infer<typeof vertexSchema>;
export type Link = z.infer<typeof linkSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type Graph = z.infer<typeof graphSchema>;
const versionSchema = z.object({
  id,
  name: z.string().max(100),
  createdAt: z.string(),
  graph: graphSchema,
  source: z.enum(["manual", "ai"]),
});
export const projectSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  folderId: id.nullable(),
  graph: graphSchema,
  interview: z.string().max(100000),
  versions: z.array(versionSchema).max(30),
});
export const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    currentProjectId: id,
    folders: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(80),
          parentId: id.nullable(),
        }),
      )
      .max(200),
    projects: z.array(projectSchema).min(1).max(100),
    preferences: z.object({ motion: z.boolean(), snap: z.boolean() }),
  })
  .superRefine((w, ctx) => {
    const ps = new Set(w.projects.map((p) => p.id)),
      fs = new Map(w.folders.map((f) => [f.id, f]));
    if (
      ps.size !== w.projects.length ||
      fs.size !== w.folders.length ||
      !ps.has(w.currentProjectId)
    )
      ctx.addIssue({
        code: "custom",
        message: "프로젝트 참조가 잘못되었습니다.",
      });
    for (const p of w.projects)
      if (p.folderId && !fs.has(p.folderId))
        ctx.addIssue({ code: "custom", message: "저장 폴더가 없습니다." });
    for (const f of w.folders) {
      const seen = new Set([f.id]);
      let parent = f.parentId;
      while (parent) {
        if (seen.has(parent) || !fs.has(parent)) {
          ctx.addIssue({
            code: "custom",
            message: "폴더 순환 또는 잘못된 상위 폴더입니다.",
          });
          break;
        }
        seen.add(parent);
        parent = fs.get(parent)!.parentId;
      }
    }
  });
export type Project = z.infer<typeof projectSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export const uid = () => crypto.randomUUID();
export const defaultParams = (): Params => ({
  meanMs: null,
  slots: null,
  replicas: 1,
  availability: null,
  networkMs: null,
  budgetMs: null,
  demand: null,
  basis: "unknown",
});
export const emptyGraph = (): Graph => ({
  schemaVersion: 1,
  nodes: [],
  edges: [],
  flows: [],
});
export const createFlow = (name = "새 요청"): Flow => ({
  id: uid(),
  name,
  method: "GET",
  route: "/",
  entryId: null,
  rps: null,
  hitPercent: 0,
  trafficBasis: "unknown",
  cacheBasis: "unknown",
  latencyTarget: null,
  availabilityTarget: null,
  requiredIds: [],
});
export function reconcileViews(g: Graph): Graph {
  if (!g.views) return g;
  const edges = new Map(g.edges.map((e) => [e.id, e]));
  const flows = new Set(g.flows.map((f) => f.id));
  return {
    ...g,
    views: {
      ...g.views,
      ...(g.views.overviewNodeIds
        ? {
            overviewNodeIds: g.views.overviewNodeIds.filter((id) =>
              g.nodes.some((n) => n.id === id),
            ),
          }
        : {}),
      ...(g.views.overviewEdgeIds
        ? {
            overviewEdgeIds: g.views.overviewEdgeIds.filter((id) =>
              edges.has(id),
            ),
          }
        : {}),
      ...(g.views.features
        ? {
            features: g.views.features
              .map((f) => ({
                ...f,
                flowIds: f.flowIds.filter((id) => flows.has(id)),
                ...(f.mainEdgeIds
                  ? {
                      mainEdgeIds: f.mainEdgeIds.filter((id) =>
                        edges
                          .get(id)
                          ?.data.flowIds.some((fid) => f.flowIds.includes(fid)),
                      ),
                    }
                  : {}),
              }))
              .filter((f) => f.flowIds.length),
          }
        : {}),
    },
  };
}
export function removeElements(
  g: Graph,
  nodeIds: string[],
  edgeIds: string[],
): Graph {
  const removed = new Set(nodeIds);
  const nodes = g.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) =>
      n.parentId && removed.has(n.parentId)
        ? { ...n, parentId: undefined, position: absolutePosition(n, g.nodes) }
        : n,
    );
  return reconcileViews({
    ...g,
    nodes,
    edges: g.edges.filter(
      (e) =>
        !removed.has(e.source) &&
        !removed.has(e.target) &&
        !edgeIds.includes(e.id),
    ),
    flows: g.flows.map((f) => ({
      ...f,
      entryId: f.entryId && removed.has(f.entryId) ? null : f.entryId,
      ...(f.responseId && removed.has(f.responseId)
        ? { responseId: null }
        : {}),
      ...(f.completionId && removed.has(f.completionId)
        ? { completionId: null }
        : {}),
      requiredIds: f.requiredIds.filter((id) => !removed.has(id)),
    })),
  });
}
export function absolutePosition(n: Vertex, nodes: Vertex[]) {
  const parent = nodes.find((p) => p.id === n.parentId);
  return parent
    ? {
        x: n.position.x + parent.position.x,
        y: n.position.y + parent.position.y,
      }
    : n.position;
}
export function sortNodes(nodes: Vertex[]) {
  return [
    ...nodes.filter((n) => n.type === "group"),
    ...nodes.filter((n) => n.type !== "group"),
  ];
}
export function parseGraph(text: string): Graph {
  if (
    text.length > 5_000_000 ||
    new TextEncoder().encode(text).byteLength > 5_000_000
  )
    throw new Error("JSON은 5MB 이하로 가져와 주세요.");
  return graphSchema.parse(JSON.parse(text));
}
