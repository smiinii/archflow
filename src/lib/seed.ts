import {
  createFlow,
  defaultParams,
  type Graph,
  type Vertex,
  type Workspace,
} from "./model";
const n = (
  id: string,
  catalogId: string,
  name: string,
  x: number,
  y: number,
  ms: number,
  slots: number,
  parentId?: string,
): Vertex => ({
  id,
  type: "component",
  position: { x, y },
  width: 172,
  height: 116,
  parentId,
  data: {
    catalogId,
    name,
    note: "예시입니다. 실제 서비스에 맞게 수정해 주세요.",
    params: {
      ...defaultParams(),
      meanMs: ms,
      slots,
      availability: 99.99,
      networkMs: 3,
      budgetMs: 50,
      basis: "assumption",
    },
  },
});
export function sampleGraph(): Graph {
  const read = {
    ...createFlow("게시글 조회"),
    id: "read",
    route: "/posts/{id}",
    entryId: "client",
    rps: 480,
    hitPercent: 85,
    latencyTarget: 200,
    availabilityTarget: 99.99,
    requiredIds: ["nginx", "api", "redis", "mysql"],
  };
  const upload = {
    ...createFlow("사진 업로드"),
    id: "upload",
    method: "POST" as const,
    route: "/photos",
    entryId: "client",
    rps: 20,
    latencyTarget: 350,
    availabilityTarget: 99.9,
    requiredIds: ["nginx", "api", "s3", "sqs"],
  };
  const e = (
    id: string,
    source: string,
    target: string,
    label: string,
    flowIds: string[],
    kind: "sync" | "async" = "sync",
    traffic: "all" | "cache-miss" = "all",
  ) => ({
    id,
    source,
    target,
    data: { kind, label, flowIds, calls: 1, traffic },
  });
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: "app",
        type: "group",
        position: { x: 40, y: 240 },
        width: 580,
        height: 485,
        data: {
          catalogId: "group",
          name: "APPLICATION & DATA",
          note: "애플리케이션과 데이터 계층",
          params: defaultParams(),
        },
      },
      n("client", "client", "사용자", 80, 40, 0, 1),
      n("nginx", "nginx", "진입 프록시", 390, 40, 2, 16),
      n("api", "api", "게시글 API", 200, 50, 40, 16, "app"),
      n("redis", "redis", "게시글 캐시", 30, 230, 2, 16, "app"),
      n("mysql", "mysql", "게시글 DB", 330, 230, 30, 8, "app"),
      n("s3", "s3", "원본 이미지", 780, 310, 120, 16),
      n("sqs", "sqs", "이미지 작업 큐", 780, 510, 5, 16),
      n("encoder", "generic-encoder", "이미지 인코더", 780, 710, 1000, 4),
    ],
    edges: [
      e("e1", "client", "nginx", "HTTPS", ["read", "upload"]),
      e("e2", "nginx", "api", "HTTP", ["read", "upload"]),
      e("e3", "api", "redis", "캐시 조회", ["read"]),
      e("e4", "redis", "mysql", "캐시 미스", ["read"], "sync", "cache-miss"),
      e("e5", "api", "s3", "원본 저장", ["upload"]),
      e("e6", "api", "sqs", "작업 등록", ["upload"]),
      e("e7", "sqs", "encoder", "이벤트 소비", ["upload"], "async"),
    ],
    flows: [read, upload],
  };
}
export function initialWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    currentProjectId: "sample",
    folders: [{ id: "personal", name: "개인 프로젝트", parentId: null }],
    projects: [
      {
        id: "sample",
        name: "My Backend",
        folderId: "personal",
        graph: sampleGraph(),
        interview: "",
        versions: [],
      },
    ],
    preferences: {
      motion: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      snap: true,
    },
  };
}
