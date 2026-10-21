import { describe, it, expect } from "vitest";
import {
  defaultCardStyle,
  resolveCardStyle,
  cardPalette,
} from "../src/lib/appearance";
import { graphSchema, parseGraph } from "../src/lib/model";
import { sampleGraph } from "../src/lib/seed";
import {
  readableLayout,
  positionIsFixed,
  nodeRect,
  overlaps,
  CARD_MIN,
} from "../src/lib/readability";
import { inspectImport } from "../src/lib/importing";
import {
  buildInterviewPrompt,
  exampleGraph,
  graphForExchange,
} from "../src/lib/aiPrompt";
describe("compact card appearance and exchange", () => {
  it("keeps old JSON unchanged while displaying the new defaults", () => {
    const g = sampleGraph();
    expect(parseGraph(JSON.stringify(g))).toEqual(g);
    expect(resolveCardStyle(g.nodes[1].data.style)).toEqual(defaultCardStyle);
    expect(CARD_MIN).toEqual({ width: 200, height: 140 });
  });
  it("round trips every light palette, largest type and logo, and explicit position locks", () => {
    const g = sampleGraph();
    g.nodes
      .filter((n) => n.type === "component")
      .forEach((n, i) => {
        n.width = 200;
        n.height = 140;
        n.data.style = {
          backgroundColor: cardPalette[i % 6].value,
          fontSize: 18,
          fontWeight: 700,
          iconSize: 40,
        };
        n.data.positionLocked = i === 0;
      });
    expect(parseGraph(JSON.stringify(g))).toEqual(g);
    expect(inspectImport(JSON.stringify(g)).unsupported).toEqual([]);
  });
  it("rejects dark arbitrary colors, injected styles and unsupported typography with actionable fields", () => {
    const g = sampleGraph();
    g.nodes[1].data.style = {
      fontSize: 30,
      backgroundColor: "#000000" as "#FFFFFF",
    };
    const result = inspectImport(JSON.stringify(g));
    expect(result.graph).toBeNull();
    expect(
      result.issues.some((i) => i.message.includes("역할 글씨 크기")),
    ).toBe(true);
    expect(result.issues.some((i) => i.message.includes("#FFFFFF"))).toBe(true);
    g.nodes[1].data.style = { fontSize: 17, ...{ css: "url(unsafe)" } };
    expect(inspectImport(JSON.stringify(g)).graph).toBeNull();
  });
  it("copies the effective style of old cards and retains custom choices without mutating the graph", () => {
    const g = sampleGraph();
    g.nodes[1].data.style = { backgroundColor: "#EFF6FF", fontSize: 18 };
    const copy = graphForExchange(g);
    expect(copy.nodes[1].data.style).toEqual({
      ...defaultCardStyle,
      backgroundColor: "#EFF6FF",
      fontSize: 18,
    });
    expect(copy.nodes[2].data.style).toEqual(defaultCardStyle);
    expect(g.nodes[2].data.style).toBeUndefined();
    expect(parseGraph(JSON.stringify(copy))).toEqual(copy);
  });
  it("keeps the interview questions and generates a schema-valid complete example with current capabilities", () => {
    expect(graphSchema.safeParse(exampleGraph).success).toBe(true);
    const prompt = buildInterviewPrompt(sampleGraph(), true);
    expect(prompt).toContain("어떤 사용자의 어떤 문제");
    expect(prompt).toContain("width:200,height:140");
    expect(prompt).toContain("data.style");
    expect(prompt).toContain("FCM은 tech-fcm");
    expect(prompt).toContain("같은 요청에서 응답을 기다리면 sync");
    expect(prompt).not.toContain("style·색상·임의 아이콘 URL은 지원하지");
    const data = JSON.parse(
      prompt.split("[현재 캔버스 — 실제 서비스인지 먼저 확인할 참고 자료]")[1],
    );
    expect(graphSchema.safeParse(data).success).toBe(true);
  });
});
describe("left-to-right layout and anchored positions", () => {
  it("places a simple path left-to-right and compacts cards without deleting edges", () => {
    const g = sampleGraph();
    g.nodes = g.nodes
      .filter((n) => ["client", "nginx", "api"].includes(n.id))
      .map((n) => ({ ...n, parentId: undefined }));
    g.edges = g.edges.filter((e) => ["e1", "e2"].includes(e.id));
    const laid = readableLayout(g);
    expect(laid.nodes.find((n) => n.id === "client")!.position.x).toBeLessThan(
      laid.nodes.find((n) => n.id === "nginx")!.position.x,
    );
    expect(laid.nodes.find((n) => n.id === "nginx")!.position.x).toBeLessThan(
      laid.nodes.find((n) => n.id === "api")!.position.x,
    );
    expect(laid.edges).toEqual(g.edges);
    expect(laid.nodes.every((n) => n.width === 200 && n.height === 140)).toBe(
      true,
    );
  });
  it("preserves an anchored child and its group while free cards avoid those bounds", () => {
    const g = sampleGraph();
    const child = g.nodes.find((n) => n.id === "api")!;
    child.data.positionLocked = true;
    const before = nodeRect(child, g.nodes);
    const group = g.nodes.find((n) => n.id === child.parentId)!;
    expect(positionIsFixed(group, g.nodes)).toBe(true);
    const laid = readableLayout(g);
    expect(laid.nodes.find((n) => n.id === group.id)).toEqual(group);
    expect(
      nodeRect(
        laid.nodes.find((n) => n.id === "api")!,
        laid.nodes,
      ),
    ).toEqual(before);
    const fixedRect = nodeRect(group, g.nodes);
    for (const n of laid.nodes.filter((n) => !n.parentId && n.id !== group.id))
      expect(overlaps(nodeRect(n, laid.nodes), fixedRect)).toBe(false);
    expect(laid.edges).toEqual(g.edges);
  });
  it("leaves an explicitly locked ungrouped node and all original data intact", () => {
    const g = sampleGraph();
    g.nodes[1].data.positionLocked = true;
    const clone = structuredClone(g);
    const laid = readableLayout(g);
    expect(laid.nodes[1]).toEqual(g.nodes[1]);
    expect(g).toEqual(clone);
  });
});
