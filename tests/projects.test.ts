import { describe, expect, it } from "vitest";
import {
  deleteProject,
  moveProject,
  newProject,
  restoreProject,
} from "../src/lib/projects";
import { workspaceSchema, type Workspace } from "../src/lib/model";
import { sampleGraph } from "../src/lib/seed";

function workspace(): Workspace {
  return {
    schemaVersion: 1,
    currentProjectId: "a",
    folders: [
      { id: "left", name: "개인", parentId: null },
      { id: "right", name: "업무", parentId: "left" },
    ],
    projects: ["a", "b", "c"].map((id) => ({
      ...newProject(id),
      id,
      folderId: "left",
      graph: sampleGraph(),
      interview: "서비스 인터뷰 " + id,
    })),
    preferences: { motion: false, snap: true },
  };
}

describe("project organization", () => {
  it("reorders a project without changing its graph or current selection", () => {
    const before = workspace();
    const after = moveProject(before, "a", "left", { id: "c", after: true });
    expect(after.projects.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(after.projects[2].graph).toBe(before.projects[0].graph);
    expect(after.currentProjectId).toBe("a");
    expect(before.projects.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(workspaceSchema.safeParse(after).success).toBe(true);
  });
  it("moves between nested folders and root while preserving project contents", () => {
    const before = workspace();
    const nested = moveProject(before, "b", "right");
    const root = moveProject(nested, "b", null);
    expect(root.projects.find((p) => p.id === "b")).toEqual({
      ...before.projects[1],
      folderId: null,
    });
    expect(workspaceSchema.safeParse(root).success).toBe(true);
  });
  it("rejects missing folders, mismatched insertion targets, and self drops", () => {
    const w = workspace();
    expect(moveProject(w, "a", "missing")).toBe(w);
    expect(moveProject(w, "a", "right", { id: "b", after: false })).toBe(w);
    expect(moveProject(w, "a", "left", { id: "a", after: true })).toBe(w);
  });
  it("deleting an inactive project preserves the open project", () => {
    const w = workspace();
    const after = deleteProject(w, "b", newProject());
    expect(after.projects.map((p) => p.id)).toEqual(["a", "c"]);
    expect(after.currentProjectId).toBe("a");
    expect(after.projects[0]).toBe(w.projects[0]);
    expect(workspaceSchema.safeParse(after).success).toBe(true);
  });
  it("deleting the current project selects another existing project", () => {
    const after = deleteProject(workspace(), "a", newProject());
    expect(after.currentProjectId).toBe("b");
    expect(workspaceSchema.safeParse(after).success).toBe(true);
  });
  it("last-project deletion and undo preserve a valid workspace and all project data", () => {
    const w = workspace();
    w.projects = [w.projects[0]];
    const fallback = newProject();
    const deleted = deleteProject(w, "a", fallback);
    expect(deleted.currentProjectId).toBe(fallback.id);
    expect(deleted.projects[0].graph.nodes).toHaveLength(0);
    expect(workspaceSchema.safeParse(deleted).success).toBe(true);
    const restored = restoreProject(deleted, w.projects[0], 0, fallback);
    expect(restored).toEqual(w);
  });
  it("undo does not discard edits made to the new empty project", () => {
    const w = workspace();
    w.projects = [w.projects[0]];
    const fallback = newProject();
    const deleted = deleteProject(w, "a", fallback);
    deleted.projects = deleted.projects.map((p) => ({
      ...p,
      name: "새 작업",
      graph: sampleGraph(),
    }));
    const restored = restoreProject(deleted, w.projects[0], 0, fallback);
    expect(restored.projects.map((p) => p.name)).toEqual(["a", "새 작업"]);
    expect(restored.projects[1].graph).toEqual(sampleGraph());
    expect(workspaceSchema.safeParse(restored).success).toBe(true);
  });
});
