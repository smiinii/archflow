import interview from "../../docs/ai-interview-prompt.txt?raw";
import graphHelp from "../../docs/ai-graph-output.txt?raw";
import { catalogMappingText, promptCatalogIds } from "./catalog";
import { defaultCardStyle, resolveCardStyle } from "./appearance";
import { defaultParams, type Graph } from "./model";
export function graphForExchange(graph: Graph): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.type === "component"
        ? { ...n, data: { ...n.data, style: resolveCardStyle(n.data.style) } }
        : n,
    ),
  };
}
export const exampleGraph: Graph = {
  schemaVersion: 1,
  views: {
    features: [
      {
        id: "browse",
        name: "사진 조회",
        flowIds: ["read"],
        mainEdgeIds: ["api-db"],
      },
    ],
  },
  nodes: [
    {
      id: "api",
      type: "component",
      position: { x: 40, y: 100 },
      width: 200,
      height: 140,
      data: {
        catalogId: "api",
        name: "사진 API",
        note: "실제 대수 미확인. replicas 1은 입력 기본값입니다.",
        style: { ...defaultCardStyle },
        params: defaultParams(),
      },
    },
    {
      id: "db",
      type: "component",
      position: { x: 340, y: 100 },
      width: 200,
      height: 140,
      data: {
        catalogId: "tech-postgresql",
        name: "서비스 데이터",
        note: "실제 대수 미확인. 같은 DB의 논리 영역은 그룹과 메모로 구분합니다.",
        params: defaultParams(),
      },
    },
  ],
  edges: [
    {
      id: "api-db",
      source: "api",
      target: "db",
      data: {
        kind: "sync",
        label: "데이터 조회",
        flowIds: ["read"],
        calls: 1,
        callsBasis: "unknown",
        traffic: "all",
        purpose: "delivery",
        detailLevel: "main",
        note: "실제 DB 호출입니다. 호출 수 1은 논리 연결 기본값입니다.",
      },
    },
  ],
  flows: [
    {
      id: "read",
      name: "조회",
      method: "GET",
      route: "/items",
      entryId: "api",
      responseId: null,
      completionId: null,
      rps: null,
      trafficBasis: "unknown",
      hitPercent: 0,
      cacheBasis: "unknown",
      latencyTarget: null,
      availabilityTarget: null,
      requiredIds: ["api", "db"],
    },
  ],
};
export function buildInterviewPrompt(graph: Graph, include = false) {
  return (
    interview +
    "\n" +
    graphHelp +
    "\n[완전한 v1 Graph 예시 · 실제 서비스 구조는 인터뷰로 확인]\n" +
    JSON.stringify(exampleGraph, null, 2) +
    "\n\n[주요 지원 catalogId = 기술명 · 전체 목록은 AI 구조 적용에서 복사 가능]\n" +
    catalogMappingText(
      promptCatalogIds(graph.nodes.map((n) => n.data.catalogId)),
    ) +
    (include
      ? "\n\n[현재 캔버스 — 실제 서비스인지 먼저 확인할 참고 자료]\n" +
        JSON.stringify(graphForExchange(graph), null, 2)
      : "")
  );
}
