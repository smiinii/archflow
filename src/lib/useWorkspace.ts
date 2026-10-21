import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { initialWorkspace } from "./seed";
import { uid, workspaceSchema, type Workspace } from "./model";
import { loadLocal, saveLocal, type LocalRecord } from "./storage";
import { supabase } from "./supabase";
export function useWorkspace() {
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!supabase),
    [record, setRecord] = useState<LocalRecord | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("읽는 중"),
    [conflict, setConflict] = useState<{
      data: Workspace;
      revision: number;
    } | null>(null),
    [ready, setReady] = useState(false);
  const scope = useRef(0),
    current = useRef(record),
    saving = useRef<number | null>(null),
    loadedOwner = useRef<string | undefined>(undefined);
  current.current = record;
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      setUser(data.session?.user || null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const owner = user?.id || null;
  useEffect(() => {
    if (!authReady) return;
    const epoch = ++scope.current;
    loadedOwner.current = undefined;
    let alive = true;
    setReady(false);
    setConflict(null);
    setError("");
    (async () => {
      let local: LocalRecord | null = null;
      try {
        local = await loadLocal(owner);
      } catch (e) {
        if (alive) setError(String(e));
        return;
      }
      if (!alive) return;
      let next = local || {
        data: initialWorkspace(),
        revision: 0,
        dirty: false,
        updatedAt: new Date().toISOString(),
      };
      if (owner && supabase) {
        try {
          const { data, error } = await supabase
            .from("workspaces")
            .select("data,revision")
            .eq("owner_id", owner)
            .maybeSingle();
          if (!alive || epoch !== scope.current) return;
          if (error) throw error;
          if (data) {
            const cloud = {
              data: workspaceSchema.parse(data.data),
              revision: Number(data.revision),
            };
            if (local?.dirty) {
              if (local.revision !== cloud.revision) setConflict(cloud);
            } else next = { ...next, ...cloud, dirty: false };
          } else if (local) next = { ...local, revision: 0, dirty: true };
        } catch (e) {
          if (alive)
            setError(
              "클라우드를 읽지 못했습니다. 로컬 초안으로 계속할 수 있습니다. " +
                (e instanceof Error
                  ? e.message
                  : String((e as { message?: string }).message || e)),
            );
        }
      }
      if (alive && epoch === scope.current) {
        loadedOwner.current = owner || "guest";
        setRecord(next);
        setReady(true);
        setStatus(
          owner
            ? next.dirty
              ? "동기화 대기"
              : "클라우드 연결됨"
            : "이 기기에 저장",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [owner, authReady]);
  const change = useCallback((fn: (w: Workspace) => Workspace) => {
    setRecord((prev) =>
      prev
        ? {
            ...prev,
            data: fn(prev.data),
            dirty: true,
            updatedAt: new Date().toISOString(),
          }
        : prev,
    );
  }, []);
  const sync = useCallback(async () => {
    const snapshot = current.current;
    if (
      loadedOwner.current !== (owner || "guest") ||
      !ready ||
      !owner ||
      !supabase ||
      !snapshot?.dirty ||
      saving.current === scope.current ||
      conflict
    )
      return;
    const epoch = scope.current;
    saving.current = epoch;
    setStatus("클라우드 저장 중");
    try {
      const { data, error } = await supabase.rpc("save_workspace", {
        expected_revision: snapshot.revision,
        payload: snapshot.data,
      });
      if (error) throw error;
      if (epoch !== scope.current) return;
      setRecord((prev) =>
        prev
          ? {
              ...prev,
              revision: Number(data),
              dirty: prev.data !== snapshot.data,
            }
          : prev,
      );
      setError("");
      setStatus("클라우드 저장됨");
    } catch (e) {
      if (epoch !== scope.current) return;
      const message =
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message || e);
      setError(message);
      setStatus("동기화 대기");
      if (message.includes("revision_conflict")) {
        const { data } = await supabase
          .from("workspaces")
          .select("data,revision")
          .eq("owner_id", owner)
          .maybeSingle();
        if (epoch !== scope.current) return;
        if (data) {
          const parsed = workspaceSchema.safeParse(data.data);
          if (parsed.success)
            setConflict({ data: parsed.data, revision: Number(data.revision) });
        }
      }
    } finally {
      if (saving.current === epoch) saving.current = null;
    }
  }, [owner, ready, conflict]);
  useEffect(() => {
    if (loadedOwner.current !== (owner || "guest") || !ready || !record) return;
    let alive = true;
    saveLocal(owner, record)
      .then(() => {
        if (alive && !owner) setStatus("이 기기에 저장됨");
      })
      .catch(() => {
        if (alive)
          setError("기기 저장에 실패했습니다. JSON 내보내기로 백업해 주세요.");
      });
    const timer = window.setTimeout(() => {
      void sync();
    }, 900);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [record, owner, ready, sync]);
  useEffect(() => {
    const retry = () => {
      void sync();
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [sync]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (record?.dirty && owner) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [record, owner]);
  function mergeCloud() {
    if (!conflict) return;
    const remote = conflict,
      folderIds = new Map(remote.data.folders.map((f) => [f.id, uid()]));
    change((w) => {
      const next = {
        ...w,
        folders: [
          ...w.folders,
          ...remote.data.folders.map((f) => ({
            ...f,
            id: folderIds.get(f.id)!,
            parentId: f.parentId ? folderIds.get(f.parentId)! : null,
            name: f.name + " · 클라우드",
          })),
        ],
        projects: [
          ...w.projects,
          ...remote.data.projects.map((p) => ({
            ...p,
            id: uid(),
            name: p.name + " · 클라우드 사본",
            folderId: p.folderId ? folderIds.get(p.folderId)! : null,
          })),
        ],
      };
      return workspaceSchema.parse(next);
    });
    setRecord((p) => (p ? { ...p, revision: remote.revision } : p));
    setConflict(null);
    setError("");
  }
  return {
    user,
    ready,
    record,
    workspace: record?.data,
    change,
    error,
    status,
    conflict,
    sync,
    mergeCloud,
  };
}
