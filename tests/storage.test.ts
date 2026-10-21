import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { sampleGraph } from "../src/lib/seed";
import { loadLocal, saveLocal, type LocalRecord } from "../src/lib/storage";
const record = (name: string): LocalRecord => ({
  data: {
    schemaVersion: 1,
    currentProjectId: "p",
    folders: [],
    projects: [
      {
        id: "p",
        name,
        folderId: null,
        graph: sampleGraph(),
        interview: "confirmed",
        versions: [],
      },
    ],
    preferences: { motion: false, snap: true },
  },
  revision: 3,
  dirty: true,
  updatedAt: new Date().toISOString(),
});
describe("browser drafts", () => {
  it("persists graph, preferences and unsynced revision", async () => {
    const r = record("local");
    await saveLocal(null, r);
    expect(await loadLocal(null)).toEqual(r);
  });
  it("keeps guest and different signed-in user caches separate", async () => {
    await saveLocal("user-a", record("A"));
    await saveLocal("user-b", record("B"));
    expect((await loadLocal("user-a"))?.data.projects[0].name).toBe("A");
    expect((await loadLocal("user-b"))?.data.projects[0].name).toBe("B");
    expect((await loadLocal(null))?.data.projects[0].name).toBe("local");
  });
});

it("restores card colors, typography, icon size and position locks after storage parsing", async () => {
  const r = record("appearance");
  r.data.projects[0].graph.nodes[1].data.style = {
    backgroundColor: "#F5F3FF",
    fontSize: 18,
    fontWeight: 700,
    iconSize: 36,
  };
  r.data.projects[0].graph.nodes[1].data.positionLocked = true;
  await saveLocal("appearance-test", r);
  const loaded = await loadLocal("appearance-test");
  expect(loaded?.data.projects[0].graph.nodes[1].data).toEqual(
    r.data.projects[0].graph.nodes[1].data,
  );
});

it("preserves overview and multi-stage feature definitions through IndexedDB restoration", async () => {
  const r = record("reading");
  const g = r.data.projects[0].graph;
  const f = g.flows[0];
  g.views = {
    overviewNodeIds: [g.nodes[0].id],
    overviewEdgeIds: [g.edges[0].id],
    features: [
      {
        id: "business",
        name: "사용자 기능",
        flowIds: [f.id],
        mainEdgeIds: g.edges
          .filter((e) => e.data.flowIds.includes(f.id))
          .map((e) => e.id),
      },
    ],
  };
  g.edges[0].data.detailLevel = "detail";
  await saveLocal("reading-test", r);
  expect((await loadLocal("reading-test"))?.data.projects[0].graph).toEqual(g);
});
