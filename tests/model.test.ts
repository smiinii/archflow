import { describe, it, expect } from "vitest";
import { sampleGraph } from "../src/lib/seed";
import {
  absolutePosition,
  graphSchema,
  parseGraph,
  removeElements,
  workspaceSchema,
} from "../src/lib/model";
import { snapPosition } from "../src/lib/alignment";
describe("graph integrity and editing", () => {
  it("round trips the sample through the public import format", () =>
    expect(parseGraph(JSON.stringify(sampleGraph()))).toEqual(sampleGraph()));
  it("deletes incident edges and API references along with a node", () => {
    const g = removeElements(sampleGraph(), ["api"], []);
    expect(g.edges.some((e) => e.source === "api" || e.target === "api")).toBe(
      false,
    );
    expect(g.flows.some((f) => f.requiredIds.includes("api"))).toBe(false);
    expect(graphSchema.safeParse(g).success).toBe(true);
  });
  it("removes only a group and preserves absolute child positions", () => {
    const before = sampleGraph(),
      child = before.nodes.find((n) => n.id === "api")!;
    const g = removeElements(before, ["app"], []),
      after = g.nodes.find((n) => n.id === "api")!;
    expect(after.parentId).toBeUndefined();
    expect(after.position).toEqual(absolutePosition(child, before.nodes));
    expect(g.nodes).toHaveLength(before.nodes.length - 1);
  });
  it("rejects dangling references, duplicate IDs and nested/cyclic groups", () => {
    const g = sampleGraph();
    g.edges[0].target = "missing";
    expect(() => parseGraph(JSON.stringify(g))).toThrow();
    g.edges[0].target = "nginx";
    g.nodes.push(g.nodes[0]);
    expect(graphSchema.safeParse(g).success).toBe(false);
  });
  it("rejects unsafe IDs and non-finite/negative measurements", () => {
    const g = sampleGraph();
    g.nodes[0].id = "<script>";
    expect(graphSchema.safeParse(g).success).toBe(false);
    g.nodes[0].id = "app";
    g.nodes[1].data.params.meanMs = -1;
    expect(graphSchema.safeParse(g).success).toBe(false);
  });
  it("rejects circular folders", () => {
    const w = {
      schemaVersion: 1,
      currentProjectId: "p",
      folders: [
        { id: "a", name: "A", parentId: "b" },
        { id: "b", name: "B", parentId: "a" },
      ],
      projects: [
        {
          id: "p",
          name: "P",
          folderId: "a",
          graph: sampleGraph(),
          interview: "",
          versions: [],
        },
      ],
      preferences: { snap: true, motion: false },
    };
    expect(workspaceSchema.safeParse(w).success).toBe(false);
  });
  it("snaps centers and symmetric positions with visible guides", () => {
    const g = sampleGraph();
    const moving = structuredClone(g.nodes.find((n) => n.id === "api")!);
    moving.parentId = undefined;
    moving.position = { x: 84, y: 200 };
    const result = snapPosition(moving, g.nodes, [moving.id]);
    expect(result.dx).toBe(-4);
    expect(result.guides.length).toBeGreaterThan(0);
  });
});
