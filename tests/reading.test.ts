import { describe, it, expect } from "vitest";
import { sampleGraph } from "../src/lib/seed";
import {
  graphSchema,
  removeElements,
  reconcileViews,
  type Graph,
} from "../src/lib/model";
import { readingView, functionsFor } from "../src/lib/reading";
import { analyze } from "../src/lib/analysis";
import { routeGraph } from "../src/lib/routing";
import { exampleGraph, buildInterviewPrompt } from "../src/lib/aiPrompt";
function fixture(): Graph {
  const n = structuredClone(exampleGraph.nodes[0]);
  const node = (id: string, catalogId: string) => ({
    ...structuredClone(n),
    id,
    position: { x: id.length * 110, y: id.charCodeAt(0) * 7 },
    data: { ...structuredClone(n.data), name: id, catalogId },
  });
  const nodes = [
    node("records", "tech-postgresql"),
    node("relay", "generic-worker"),
    node("queue", "sqs"),
    node("worker", "generic-worker"),
    node("db", "tech-postgresql"),
    node("fcm", "tech-fcm"),
    node("app", "client"),
  ];
  const edge = (
    id: string,
    source: string,
    target: string,
    kind: "sync" | "async",
  ) => ({
    id,
    source,
    target,
    data: {
      kind,
      label: id,
      flowIds: ["push"],
      calls: 1,
      traffic: "all" as const,
      purpose: "delivery" as const,
    },
  });
  return {
    schemaVersion: 1,
    nodes,
    edges: [
      edge("poll", "records", "relay", "async"),
      edge("state", "relay", "records", "sync"),
      edge("publish", "relay", "queue", "sync"),
      edge("consume", "queue", "worker", "async"),
      edge("device", "worker", "db", "sync"),
      edge("send", "worker", "fcm", "sync"),
      edge("read", "worker", "records", "sync"),
      edge("deliver", "fcm", "app", "async"),
    ],
    flows: [
      {
        ...exampleGraph.flows[0],
        id: "push",
        entryId: "records",
        method: "EVENT",
        requiredIds: nodes.map((n) => n.id),
      },
    ],
  };
}
describe("progressive reading views", () => {
  it("filters a complete FCM function without pruning real DB calls, moving cards, or changing calculations", () => {
    const g = fixture(),
      snapshot = structuredClone(g);
    const before = analyze(g, g.flows[0]);
    g.views = {
      features: [
        {
          id: "push-function",
          name: "승인 푸시",
          flowIds: ["push"],
          mainEdgeIds: ["send"],
        },
      ],
    };
    g.edges.find((e) => e.id === "device")!.data.detailLevel = "detail";
    const saved = structuredClone(g);
    const view = readingView(g, "function", ["push"]);
    expect(view.graph.edges).toEqual(g.edges);
    expect(view.graph.nodes).toEqual(g.nodes);
    expect(analyze(g, g.flows[0])).toEqual(before);
    expect(g).toEqual(saved);
    expect(g.nodes).toEqual(snapshot.nodes);
  });
  it("expands all incident connections, including a different function, and folds back without mutation", () => {
    const g = fixture();
    g.edges.find((e) => e.id === "device")!.data.flowIds = [];
    const main = readingView(g, "function", ["push"]);
    const detail = readingView(g, "function", ["push"], "worker");
    expect(main.graph.edges.some((e) => e.id === "device")).toBe(false);
    expect(detail.graph.edges.map((e) => e.id)).toEqual([
      "consume",
      "device",
      "send",
      "read",
    ]);
    expect(detail.graph.nodes.map((n) => n.id)).not.toContain("relay");
    for (const node of detail.graph.nodes)
      expect(node).toBe(g.nodes.find((n) => n.id === node.id));
    expect(readingView(g, "function", ["push"]).graph).toEqual(main.graph);
    expect(readingView(g, "overview").graph).toBe(g);
  });
  it("uses business feature flow IDs and excludes unrelated flows", () => {
    const g = fixture();
    g.flows.push({ ...g.flows[0], id: "approve" });
    g.edges.find((e) => e.id === "device")!.data.flowIds = ["approve"];
    g.views = {
      features: [
        {
          id: "approval",
          name: "승인 알림",
          flowIds: ["approve", "push"],
          mainEdgeIds: ["send"],
        },
      ],
    };
    expect(graphSchema.safeParse(g).success).toBe(true);
    expect(functionsFor(g)).toHaveLength(1);
    expect(
      readingView(g, "function", ["push"]).graph.edges.map((e) => e.id),
    ).not.toContain("device");
    expect(readingView(g, "function", ["approve", "push"]).graph.edges).toEqual(
      g.edges,
    );
  });
  it("shows every original node, group and edge despite old eight-card overview metadata", () => {
    const g = sampleGraph(),
      snapshot = structuredClone(g);
    g.views = {
      overviewNodeIds: [g.nodes[0].id],
      overviewEdgeIds: [g.edges[0].id],
    };
    g.edges[1].data.detailLevel = "detail";
    const saved = structuredClone(g),
      view = readingView(g, "overview");
    expect(view.graph).toBe(g);
    expect(view.graph.nodes).toHaveLength(snapshot.nodes.length);
    expect(view.graph.edges).toHaveLength(snapshot.edges.length);
    expect(view.bundles).toEqual({});
    expect(view.groups).toEqual({});
    expect(view.hiddenEdges).toBe(0);
    expect(g).toEqual(saved);
  });
  it("keeps parent groups, card sizes and relative/absolute positions in filtered and group detail views", () => {
    const g = sampleGraph(),
      snapshot = structuredClone(g);
    const group = g.nodes.find((n) => n.type === "group")!;
    const child = g.nodes.find((n) => n.parentId === group.id)!;
    for (const view of [
      readingView(g, "function", [g.flows[0].id]),
      readingView(g, "overview", [], child.id),
      readingView(g, "overview", [], group.id),
    ]) {
      for (const node of view.graph.nodes) {
        expect(node).toBe(g.nodes.find((n) => n.id === node.id));
        if (node.parentId)
          expect(view.graph.nodes.some((n) => n.id === node.parentId)).toBe(
            true,
          );
      }
      expect(view.graph.nodes).toContain(group);
      expect(view.graph.nodes).toContain(child);
    }
    expect(g).toEqual(snapshot);
  });
  it("keeps full schema compatibility and rejects unknown or unrelated display references", () => {
    const g = fixture();
    expect(graphSchema.parse(g)).toEqual(g);
    g.views = {
      overviewEdgeIds: ["missing"],
      features: [
        {
          id: "one",
          name: "기능",
          flowIds: ["missing"],
          mainEdgeIds: ["missing"],
        },
      ],
    };
    expect(graphSchema.safeParse(g).success).toBe(false);
  });
  it("cleans view references when edges, nodes, or API stages are removed", () => {
    const g = fixture();
    g.views = {
      overviewEdgeIds: ["device"],
      features: [
        {
          id: "one",
          name: "알림",
          flowIds: ["push"],
          mainEdgeIds: ["device", "send"],
        },
      ],
    };
    const next = removeElements(g, ["db"], []);
    expect(next.views?.overviewEdgeIds).toEqual([]);
    expect(next.views?.features?.[0].mainEdgeIds).toEqual(["send"]);
    expect(graphSchema.safeParse(next).success).toBe(true);
    expect(reconcileViews({ ...next, flows: [] }).views?.features).toEqual([]);
  });
  it("includes the hierarchy and display-vs-calculation distinction in the complete AI example", () => {
    expect(graphSchema.safeParse(exampleGraph).success).toBe(true);
    const prompt = buildInterviewPrompt(fixture());
    expect(prompt).toContain("views.features");
    expect(prompt).toContain("detailLevel");
    expect(prompt).toContain("계산 제외 설정이 아닙니다");
    expect(prompt).toContain("어떤 사용자의 어떤 문제");
  });
  it("gives fan-out connections distinct physical exit points and retains all routes", () => {
    const g = fixture();
    g.nodes.forEach((n, i) => {
      n.position = { x: i === 3 ? 300 : 650, y: i * 210 };
    });
    const routes = routeGraph(g);
    const outgoing = g.edges
      .filter((e) => e.source === "worker")
      .map((e) => routes[e.id]);
    expect(outgoing.every((r) => !r.blocked)).toBe(true);
    expect(new Set(outgoing.map((r) => JSON.stringify(r.points[0]))).size).toBe(
      outgoing.length,
    );
  });
});
