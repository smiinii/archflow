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
