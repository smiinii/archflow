import { describe, expect, it } from "vitest";
import {
  defaultParams,
  graphSchema,
  type Graph,
  type Vertex,
} from "../src/lib/model";
import {
  CARD_MIN,
  compareGraphs,
  fitGroups,
  flowView,
  layoutWarnings,
  nodeRect,
  overlaps,
  readableLayout,
  sharedLayout,
} from "../src/lib/readability";
import { crosses, routeGraph, shortLabel } from "../src/lib/routing";
import { inspectImport, jsonFieldRange } from "../src/lib/importing";
import { analyze, capacity } from "../src/lib/analysis";
import { catalogMap, iconSource } from "../src/lib/catalog";
const card = (id: string, x: number, y: number, parentId?: string): Vertex => ({
  id,
  type: "component",
  position: { x, y },
  width: 280,
  height: 220,
  parentId,
  data: { catalogId: "api", name: id, note: "", params: defaultParams() },
});
const edge = (
  id: string,
  source: string,
  target: string,
  kind: "sync" | "async" = "sync",
) => ({
  id,
  source,
  target,
  data: {
    kind,
    label: "아주 긴 연결 설명입니다. 자세한 근거는 상세 정보에서 확인합니다.",
    flowIds: ["f"],
    calls: 1,
    traffic: "all" as const,
  },
});
function dense(): Graph {
  const nodes = Array.from({ length: 15 }, (_, i) =>
    card("n" + i, (i % 5) * 430, Math.floor(i / 5) * 390),
  );
  return {
    schemaVersion: 1,
    nodes,
    edges: [
      ...Array.from({ length: 14 }, (_, i) =>
        edge("e" + i, "n" + i, "n" + (i + 1)),
      ),
      ...Array.from({ length: 9 }, (_, i) =>
        edge("p" + i, "n" + i, "n" + (i + 5), i % 2 ? "sync" : "async"),
      ),
    ],
    flows: [
      {
        id: "f",
        name: "선택 흐름",
        method: "EVENT",
        route: "",
        entryId: "n0",
        rps: null,
        hitPercent: 0,
        latencyTarget: null,
        availabilityTarget: null,
        requiredIds: [],
      },
    ],
  };
}
describe("readable architecture geometry", () => {
  it("routes 23 dense connections outside every unrelated card and separates labels", () => {
    const g = dense(),
      r = routeGraph(g),
      labels: { x: number; y: number; width: number; height: number }[] = [];
    expect(Object.keys(r)).toHaveLength(23);
    for (const e of g.edges) {
      const route = r[e.id];
      expect(route.blocked, e.id).toBe(false);
      for (let i = 1; i < route.points.length; i++)
        for (const n of g.nodes.filter(
          (n) => n.id !== e.source && n.id !== e.target,
        ))
          expect(
            crosses(route.points[i - 1], route.points[i], nodeRect(n, g.nodes)),
            e.id + " crosses " + n.id,
          ).toBe(false);
      if (route.label) {
        for (const n of g.nodes)
          expect(overlaps(route.label, nodeRect(n, g.nodes))).toBe(false);
        for (const label of labels)
          expect(overlaps(route.label, label)).toBe(false);
        labels.push(route.label);
      }
    }
    expect(labels.length).toBe(23);
  });
  it("separates parallel and reverse edges without silently losing them", () => {
    const g = dense();
    g.edges = [
      edge("a", "n0", "n2"),
      edge("b", "n0", "n2"),
      edge("c", "n2", "n0"),
    ];
    const r = routeGraph(g);
    expect(new Set(Object.values(r).map((r) => r.path)).size).toBe(3);
    expect(Object.values(r).every((r) => !r.blocked)).toBe(true);
  });
  it("fits groups while preserving absolute child positions, and packs only after explicit layout", () => {
    const g = dense();
    g.nodes[0] = { ...card("group", 400, 200), type: "group" };
    g.nodes[1] = { ...g.nodes[1], parentId: "group", position: { x: 4, y: 5 } };
    const before = nodeRect(g.nodes[1], g.nodes);
    const fit = fitGroups(g, "group");
    expect(nodeRect(fit.nodes[1], fit.nodes)).toEqual(before);
    expect(fit.nodes[1].position.y).toBe(48);
    const placed = readableLayout(g);
    expect(layoutWarnings(placed)).toEqual([]);
    expect(placed.edges).toEqual(g.edges);
    expect(g.nodes[1].position.y).toBe(5);
  });
  it("focuses all included endpoints and ancestors, even upstream of the declared entry", () => {
    const g = dense();
    g.edges = [edge("a", "n1", "n2")];
    g.nodes.push({ ...card("group", 100, 100), type: "group" });
    g.nodes[2].parentId = "group";
    const view = flowView(g, "f", true);
    expect(view.nodes.map((n) => n.id).sort()).toEqual([
      "group",
      "n0",
      "n1",
      "n2",
    ]);
    expect(flowView(g, "f", false).nodes).toHaveLength(16);
  });
  it("compares node parent and absolute position separately; shared view preserves roles and geometry", () => {
    const g = dense(),
      next = structuredClone(g);
    next.nodes[0].position.x = 300;
    next.nodes[0].data.name = "개선안 이름";
    next.edges[0].data.kind = "async";
    const diff = compareGraphs(g, next);
    expect(diff.find((c) => c.id === "n0")?.kinds).toContain("이동");
    expect(diff.find((c) => c.id === "e0")?.kinds).toContain("연결 종류 변경");
    expect(sharedLayout(g, next).nodes[0]).toMatchObject({
      position: g.nodes[0].position,
      data: { name: g.nodes[0].data.name },
    });
    expect(next.nodes[0].position.x).toBe(300);
  });
  it("shows minimum size warnings but preserves imported dimensions", () => {
    const g = dense();
    g.nodes[0].width = 140;
    g.nodes[0].height = 100;
    expect(layoutWarnings(g).some((x) => x.includes("최소"))).toBe(true);
    const parsed = inspectImport(JSON.stringify(g)).graph!;
    expect(parsed.nodes[0].width).toBe(140);
    expect(nodeRect(parsed.nodes[0], parsed.nodes).width).toBe(CARD_MIN.width);
  });
  it("does not equate label schema limits with visible label length", () => {
    const e = edge("a", "x", "y");
    e.data.label = "긴".repeat(100);
    expect(shortLabel(e)).toBe("긴".repeat(12) + "…");
  });
});
describe("AI mapping and actionable validation", () => {
  it("identifies entity name, length and required numeric field, and locates repeated keys correctly", () => {
    const g = dense();
    g.edges[1].data.label = "가".repeat(101);
    (g.nodes[2].data.params as unknown as { replicas: null }).replicas = null;
    const text = JSON.stringify(g, null, 2);
    const result = inspectImport(text);
    expect(result.graph).toBeNull();
    expect(
      result.issues.some(
        (x) => x.message.includes("101자") && x.message.includes("100자"),
      ),
    ).toBe(true);
    const issue = result.issues.find((x) => x.path.at(-1) === "replicas")!;
    expect(issue.message).toContain("n2");
    const [a, b] = jsonFieldRange(text, issue.path);
    expect(text.slice(a, b)).toBe("null");
  });
  it("reports unsupported styles without pretending to preserve custom visual fields", () => {
    const g = dense();
    const raw = {
      ...g,
      nodes: g.nodes.map((n, i) =>
        i === 0
          ? {
              ...n,
              style: { color: "red" },
              data: { ...n.data, icon: "invented" },
            }
          : n,
      ),
    };
    expect(inspectImport(JSON.stringify(raw)).unsupported.sort()).toEqual([
      "nodes[0].data.icon",
      "nodes[0].style",
    ]);
  });
  it("pins genuine FCM and Slack icons to their own IDs and preserves custom intent", () => {
    expect(catalogMap.has("tech-fcm")).toBe(true);
    expect(iconSource("tech-fcm")).toBe("/icons/fcm.svg");
    expect(iconSource("tech-slack")).toBe("/icons/slack.svg");
    expect(catalogMap.get("custom")?.title).toBe("Custom");
  });
  it("round trips new flow completion and dependency semantics and does not treat DB references as recursive traffic", () => {
    const g = dense();
    g.nodes = g.nodes.slice(0, 3);
    g.edges = [
      edge("a", "n0", "n1"),
      edge("b", "n1", "n2"),
      {
        ...edge("db-read", "n2", "n1"),
        data: { ...edge("db-read", "n2", "n1").data, purpose: "dependency" },
      },
    ];
    g.flows[0].responseId = "n1";
    g.flows[0].completionId = "n2";
    expect(graphSchema.parse(g)).toEqual(g);
    expect(analyze(g, g.flows[0]).cyclic).toBe(false);
  });
  it("does not calculate performance conclusions from unknown values and default multipliers", () => {
    const g = dense();
    for (const n of g.nodes)
      n.data.params = {
        ...defaultParams(),
        meanMs: 10,
        slots: 2,
        availability: 99,
        networkMs: 1,
      };
    g.flows[0].rps = 100;
    g.flows[0].trafficBasis = "unknown";
    g.flows[0].requiredIds = ["n1"];
    expect(capacity(g.nodes[0].data.params)).toBeNull();
    expect(analyze(g, g.flows[0]).latency).toBeNull();
    expect(analyze(g, g.flows[0]).availability).toBeNull();
    expect(analyze(g, g.flows[0]).loads.get("n0")).toBeNull();
  });
});

it("keeps all 26 labels separate in a 21-card proposed-size stress fixture", () => {
  const g = dense();
  for (let i = 15; i < 21; i++)
    g.nodes.push(card("n" + i, (i % 5) * 430, Math.floor(i / 5) * 390));
  for (let i = 0; i < 3; i++)
    g.edges.push(edge("extra" + i, "n" + (i + 15), "n" + (i + 18), "async"));
  const routes = routeGraph(g),
    labels = Object.values(routes).flatMap((r) => (r.label ? [r.label] : []));
  expect(g.nodes).toHaveLength(21);
  expect(g.edges).toHaveLength(26);
  expect(Object.values(routes).every((r) => !r.blocked)).toBe(true);
  expect(labels).toHaveLength(26);
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      expect(overlaps(labels[i], labels[j])).toBe(false);
});
