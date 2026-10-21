// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { clear } from "idb-keyval";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { loadLocal, saveLocal } from "../src/lib/storage";
import { sampleGraph } from "../src/lib/seed";
import type { Workspace } from "../src/lib/model";
const fake = vi.hoisted(() => ({
  owner: null as string | null,
  callback: null as ((e: string, s: unknown) => void) | null,
  remote: {} as Record<string, { data: unknown; revision: number }>,
  rpc: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: fake.owner ? { user: { id: fake.owner } } : null },
        error: null,
      }),
      onAuthStateChange: (cb: typeof fake.callback) => {
        fake.callback = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_key: string, owner: string) => ({
          maybeSingle: async () => ({
            data: fake.remote[owner] || null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: fake.rpc,
  },
}));
import { useWorkspace } from "../src/lib/useWorkspace";
function workspace(name: string): Workspace {
  return {
    schemaVersion: 1,
    currentProjectId: "p",
    folders: [],
    projects: [
      {
        id: "p",
        name,
        folderId: null,
        graph: sampleGraph(),
        interview: "",
        versions: [],
      },
    ],
    preferences: { snap: true, motion: false },
  };
}
beforeEach(async () => {
  await clear();
  fake.owner = null;
  fake.callback = null;
  fake.remote = {};
  fake.rpc.mockReset();
  fake.rpc.mockResolvedValue({ data: 1, error: null });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});
afterEach(() => cleanup());
async function sign(owner: string | null) {
  await act(async () => {
    fake.owner = owner;
    fake.callback?.("SIGNED_IN", owner ? { user: { id: owner } } : null);
  });
}
describe("authenticated draft synchronization", () => {
  it("never writes the previous guest/user draft into the next account cache", async () => {
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.change((w) => ({
        ...w,
        projects: w.projects.map((p) => ({ ...p, name: "GUEST PRIVATE" })),
      })),
    );
    await waitFor(async () =>
      expect((await loadLocal(null))?.data.projects[0].name).toBe(
        "GUEST PRIVATE",
      ),
    );
    await sign("alice");
    await waitFor(() =>
      expect(result.current.ready && result.current.user?.id === "alice").toBe(
        true,
      ),
    );
    await waitFor(async () =>
      expect((await loadLocal("alice"))?.data.projects[0].name).toBe(
        "My Backend",
      ),
    );
    act(() =>
      result.current.change((w) => ({
        ...w,
        projects: w.projects.map((p) => ({ ...p, name: "ALICE PRIVATE" })),
      })),
    );
    await waitFor(async () =>
      expect((await loadLocal("alice"))?.data.projects[0].name).toBe(
        "ALICE PRIVATE",
      ),
    );
    await sign("bob");
    await waitFor(() =>
      expect(result.current.ready && result.current.user?.id === "bob").toBe(
        true,
      ),
    );
    await waitFor(async () =>
      expect((await loadLocal("bob"))?.data.projects[0].name).toBe(
        "My Backend",
      ),
    );
    await sign(null);
    await waitFor(() =>
      expect(result.current.ready && result.current.user === null).toBe(true),
    );
    expect(result.current.workspace?.projects[0].name).toBe("GUEST PRIVATE");
  });
  it("keeps an offline draft on stale revision and merges a remote copy explicitly", async () => {
    fake.owner = "alice";
    await saveLocal("alice", {
      data: workspace("LOCAL"),
      revision: 1,
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
    fake.remote.alice = { data: workspace("REMOTE"), revision: 2 };
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.conflict?.revision).toBe(2));
    expect(result.current.workspace?.projects[0].name).toBe("LOCAL");
    expect(fake.rpc).not.toHaveBeenCalled();
    act(() => result.current.mergeCloud());
    expect(result.current.workspace?.projects.map((p) => p.name)).toEqual([
      "LOCAL",
      "REMOTE · 클라우드 사본",
    ]);
    expect(result.current.record?.revision).toBe(2);
    expect(result.current.record?.dirty).toBe(true);
  });
  it("does not clear dirty state when an edit arrives during an in-flight cloud save", async () => {
    fake.owner = "alice";
    fake.remote.alice = { data: workspace("CLOUD"), revision: 4 };
    let finish: ((x: unknown) => void) | undefined;
    fake.rpc.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.change((w) => ({
        ...w,
        projects: w.projects.map((p) => ({ ...p, name: "FIRST" })),
      })),
    );
    await waitFor(() => expect(fake.rpc).toHaveBeenCalledOnce(), {
      timeout: 3000,
    });
    act(() =>
      result.current.change((w) => ({
        ...w,
        projects: w.projects.map((p) => ({ ...p, name: "SECOND" })),
      })),
    );
    await act(async () => finish?.({ data: 5, error: null }));
    expect(result.current.workspace?.projects[0].name).toBe("SECOND");
    expect(result.current.record?.dirty).toBe(true);
    expect(result.current.record?.revision).toBe(5);
  });
});
