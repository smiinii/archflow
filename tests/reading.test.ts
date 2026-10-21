import { describe, it, expect } from "vitest";
import { sampleGraph } from "../src/lib/seed";
import {
  graphSchema,
  removeElements,
  reconcileViews,
  type Graph,
} from "../src/lib/model";
import { readingView, functionsFor, primaryEdges } from "../src/lib/reading";
import { analyze } from "../src/lib/analysis";
import { routeGraph } from "../src/lib/routing";
import { exampleGraph, buildInterviewPrompt } from "../src/lib/aiPrompt";
function fixture(): Graph {
  const n = structuredClone(exampleGraph.nodes[0]);
  const node = (id: string, catalogId: string) => ({
    ...structuredClone(n),
    id,
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
  it("opens the primary FCM chain, folding actual DB queries without excluding their calculations", () => {
    const g = fixture(),
      snapshot = structuredClone(g),
      before = analyze(g, g.flows[0]);
    const view = readingView(g, "function", ["push"]);
    expect(view.graph.edges.map((e) => e.id)).toEqual([
      "poll",
      "publish",
      "consume",
      "send",
      "deliver",
    ]);
    expect(view.graph.nodes.some((n) => n.id === "fcm")).toBe(true);
    expect(
      view.graph.nodes.find((n) => n.id === "app")!.position.x,
    ).toBeGreaterThan(view.graph.nodes.find((n) => n.id === "fcm")!.position.x);
    expect(analyze(g, g.flows[0])).toEqual(before);
    expect(g).toEqual(snapshot);
    expect(g.edges.find((e) => e.id === "device")!.data.purpose).toBe(
      "delivery",
    );
  });
  it("expands all real incident calls for a selected component and folds back without mutation", () => {
    const g = fixture();
    const main = readingView(g, "function", ["push"]);
    const detail = readingView(g, "function", ["push"], "worker");
    expect(detail.graph.edges.map((e) => e.id)).toEqual(
      expect.arrayContaining(["device", "read", "consume", "send"]),
    );
    expect(
      main.graph.edges.some((e) => e.id === "device" || e.id === "read"),
    ).toBe(false);
    expect(detail.graph.nodes.map((n) => n.id)).not.toContain("relay");
    expect(readingView(g, "all").graph).toBe(g);
  });
  it("uses explicit business functions and main IDs instead of treating each API as a separate feature", () => {
    const g = fixture();
    g.flows.push({ ...g.flows[0], id: "approve" });
    g.views = {
      features: [
        {
          id: "approval",
          name: "승인 알림",
          flowIds: ["approve", "push"],
          mainEdgeIds: ["poll", "publish", "consume", "send", "deliver"],
        },
      ],
    };
    expect(graphSchema.safeParse(g).success).toBe(true);
    expect(functionsFor(g)).toHaveLength(1);
    expect(primaryEdges(g, ["approve", "push"]).map((e) => e.id)).not.toContain(
      "device",
    );
  });
  it("collapses a shared execution boundary and bundles parallel edges with original IDs retained", () => {
    const g = sampleGraph();
    const snapshot = structuredClone(g);
    const view = readingView(g, "overview");
    const group = g.nodes.find((n) => n.type === "group")!;
    expect(view.groups[group.id]).toBeGreaterThan(0);
    expect(view.graph.nodes.every((n) => !n.parentId)).toBe(true);
    expect(view.graph.edges.every((e) => e.source !== e.target)).toBe(true);
    expect(
      Object.values(view.bundles)
        .flat()
        .every((id) => g.edges.some((e) => e.id === id)),
    ).toBe(true);
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
