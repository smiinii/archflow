import { describe, it, expect } from "vitest";
import { analyze, allMetrics, capacity } from "../src/lib/analysis";
import { sampleGraph } from "../src/lib/seed";
import { defaultParams, type Graph } from "../src/lib/model";
describe("architecture analysis", () => {
  it("follows cache miss traffic and adds loads across APIs", () => {
    const g = sampleGraph();
    const m = allMetrics(g, "read");
    expect(m.api.demand).toBe(480);
    expect(m.mysql.demand).toBeCloseTo(72);
    expect(m.api.capacity).toBe(400);
    expect(m.api.bad).toBe(true);
    expect(allMetrics(g, null).api.demand).toBe(500);
  });
  it("calculates the selected serial path with four independent factors", () => {
    const g = sampleGraph(),
      r = analyze(g, g.flows[0]);
    expect(r.latency).toBe(86);
    expect(r.availability).toBeCloseTo(99.9600059996);
    expect(r.required).toHaveLength(4);
  });
  it("excludes async workers from immediate response but includes their load", () => {
    const g = sampleGraph(),
      f = g.flows[1];
    f.requiredIds.push("encoder");
    const r = analyze(g, f);
    expect(r.required).not.toContain("encoder");
    expect(r.loads.get("encoder")).toBe(20);
    expect(r.latency).toBe(171);
  });
  it("uses longest parallel branch, never the sum of siblings", () => {
    const g = sampleGraph(),
      f = g.flows[1];
    expect(analyze(g, f).latency).toBe(171);
    g.nodes.find((n) => n.id === "sqs")!.data.params.meanMs = 300;
    expect(analyze(g, f).latency).toBe(351);
  });
  it("changing a sync edge to async changes factor count", () => {
    const g = sampleGraph();
    g.edges.find((e) => e.id === "e4")!.data.kind = "async";
    const r = analyze(g, g.flows[0]);
    expect(r.required).toHaveLength(3);
    expect(r.latency).toBe(53);
    expect(r.loads.get("mysql")).toBeCloseTo(72);
  });
  it("does not invent missing measurements or use replicas as independent availability", () => {
    const g = sampleGraph();
    g.nodes.find((n) => n.id === "api")!.data.params.meanMs = null;
    expect(analyze(g, g.flows[0]).latency).toBeNull();
    expect(allMetrics(g, "read").api.capacity).toBeNull();
    g.nodes.find((n) => n.id === "api")!.data.params.availability = null;
    expect(analyze(g, g.flows[0]).availability).toBeNull();
    expect(capacity(defaultParams())).toBeNull();
  });
  it("supports fanout and call multipliers, returns unknown for cycles", () => {
    const g = sampleGraph();
    g.edges[1].data.calls = 2;
    expect(allMetrics(g, "read").api.demand).toBe(960);
    g.edges.push({
      id: "cycle",
      source: "mysql",
      target: "api",
      data: {
        kind: "sync",
        label: "retry",
        flowIds: ["read"],
        calls: 1,
        traffic: "all",
      },
    });
    const r = analyze(g, g.flows[0]);
    expect(r.cyclic).toBe(true);
    expect(r.latency).toBeNull();
    expect(allMetrics(g, "read").api.demand).toBeNull();
  });
  it("excludes structural tools even if accidentally attached to an API", () => {
    const g = sampleGraph();
    const n = structuredClone(g.nodes[1]);
    n.id = "docker";
    n.data.catalogId = "tech-docker";
    g.nodes.push(n);
    g.edges.push({
      id: "tool",
      source: "api",
      target: "docker",
      data: {
        kind: "sync",
        label: "runs",
        flowIds: ["read"],
        calls: 1,
        traffic: "all",
      },
    });
    g.flows[0].requiredIds.push("docker");
    expect(analyze(g, g.flows[0]).required).not.toContain("docker");
    expect(allMetrics(g, "read").docker.capacity).toBeNull();
  });
});
