import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Workflow,
  ChevronDown,
  Folder,
  FolderPlus,
  FilePlus2,
  Search,
  Plus,
  X,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  Download,
  Upload,
  History,
  LogIn,
  LogOut,
  Cloud,
  Laptop,
  Check,
  ChevronRight,
  ArrowRight,
  Send,
  Copy,
  MousePointer2,
  TriangleAlert,
} from "lucide-react";
import type { Connection } from "@xyflow/react";
import interviewPrompt from "../docs/ai-interview-prompt.txt?raw";
import { catalog, categoryName, getItem } from "./lib/catalog";
import { analyze, allMetrics, fmt, percent } from "./lib/analysis";
import {
  absolutePosition,
  createFlow,
  defaultParams,
  emptyGraph,
  parseGraph,
  removeElements,
  uid,
  workspaceSchema,
  type Graph,
  type Link,
  type Project,
  type Vertex,
  type Workspace,
} from "./lib/model";
import { useWorkspace } from "./lib/useWorkspace";
import { downloadJson, loadLocal } from "./lib/storage";
import { supabase } from "./lib/supabase";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { TechIcon } from "./components/Icons";
import { Modal } from "./components/Modal";
import "./styles.css";

type Dialog =
  | "library"
  | "projects"
  | "new-project"
  | "new-folder"
  | "new-flow"
  | "ai"
  | "import"
  | "versions"
  | "auth"
  | "workspace-import"
  | null;
type Selection = { nodes: string[]; edges: string[] };
export default function App() {
  const storage = useWorkspace();
  const w = storage.workspace;
  const [dialog, setDialog] = useState<Dialog>(null),
    [flowId, setFlowId] = useState<string | null>(null),
    [purpose, setPurpose] = useState("understand"),
    [tool, setTool] = useState<"select" | "pan">("select"),
    [selection, setSelection] = useState<Selection>({ nodes: [], edges: [] }),
    [source, setSource] = useState<string | null>(null),
    [connectionKind, setConnectionKind] =
      useState<Link["data"]["kind"]>("sync"),
    [folderId, setFolderId] = useState<string | null>(null),
    [panel, setPanel] = useState<"left" | "right" | null>(null),
    [message, setMessage] = useState(""),
    [historyVersion, bumpHistory] = useState(0);
  const history = useRef<Record<string, { past: Graph[]; future: Graph[] }>>(
    {},
  );
  const selectedProject = w?.projects.find((p) => p.id === w.currentProjectId);
  const g = selectedProject?.graph;
  const activeFlow = g?.flows.find((f) => f.id === flowId);
  const validFlow = activeFlow ? flowId : null;
  const metrics = useMemo(
    () => (g ? allMetrics(g, validFlow) : {}),
    [g, validFlow],
  );
  const updateGraph = useCallback(
    (fn: (g: Graph) => Graph) => {
      storage.change((w) => ({
        ...w,
        projects: w.projects.map((p) =>
          p.id === w.currentProjectId ? { ...p, graph: fn(p.graph) } : p,
        ),
      }));
    },
    [storage.change],
  );
  const updateProject = (fn: (p: Project) => Project) =>
    storage.change((w) => ({
      ...w,
      projects: w.projects.map((p) =>
        p.id === w.currentProjectId ? fn(p) : p,
      ),
    }));
  const checkpoint = useCallback(() => {
    if (!w || !g) return;
    const h = history.current[w.currentProjectId] || { past: [], future: [] };
    const snapshot = structuredClone(g);
    if (JSON.stringify(h.past.at(-1)) !== JSON.stringify(snapshot))
      h.past = [...h.past, snapshot].slice(-60);
    h.future = [];
    history.current[w.currentProjectId] = h;
    bumpHistory((n) => n + 1);
  }, [w?.currentProjectId, g]);
  const undo = useCallback(() => {
    if (!w || !g) return;
    const h = history.current[w.currentProjectId];
    if (!h?.past.length) return;
    const graph = h.past.pop()!;
    h.future.push(structuredClone(g));
    updateGraph(() => graph);
    setSelection({ nodes: [], edges: [] });
    bumpHistory((n) => n + 1);
  }, [w?.currentProjectId, g, updateGraph]);
  const redo = () => {
    if (!w || !g) return;
    const h = history.current[w.currentProjectId];
    if (!h?.future.length) return;
    const graph = h.future.pop()!;
    h.past.push(structuredClone(g));
    updateGraph(() => graph);
    setSelection({ nodes: [], edges: [] });
    bumpHistory((n) => n + 1);
  };
  const remove = useCallback(() => {
    if (!selection.nodes.length && !selection.edges.length) return;
    checkpoint();
    updateGraph((g) => removeElements(g, selection.nodes, selection.edges));
    setSelection({ nodes: [], edges: [] });
    setSource(null);
  }, [selection, checkpoint, updateGraph]);
  useEffect(() => {
    setSelection({ nodes: [], edges: [] });
    setFlowId(null);
    setSource(null);
    setTool("select");
  }, [w?.currentProjectId, storage.user?.id]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        dialog ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection({ nodes: g?.nodes.map((n) => n.id) || [], edges: [] });
      }
      if (e.key === "Escape") {
        setSource(null);
        setSelection({ nodes: [], edges: [] });
        setPanel(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog, remove, undo, g, historyVersion]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  function switchProject(id: string) {
    storage.change((w) => ({ ...w, currentProjectId: id }));
    setPanel(null);
    setDialog(null);
  }
  function connect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target || !g) return;
    const a = g.nodes.find((n) => n.id === c.source),
      b = g.nodes.find((n) => n.id === c.target);
    if (!a || !b || a.type === "group" || b.type === "group") return;
    const kind =
      getItem(a.data.catalogId).structural ||
      getItem(b.data.catalogId).structural
        ? "relation"
        : connectionKind;
    const existing = g.edges.find(
      (e) =>
        e.source === c.source && e.target === c.target && e.data.kind === kind,
    );
    checkpoint();
    if (existing) {
      if (validFlow && !existing.data.flowIds.includes(validFlow))
        updateGraph((g) => ({
          ...g,
          edges: g.edges.map((e) =>
            e.id === existing.id
              ? {
                  ...e,
                  data: { ...e.data, flowIds: [...e.data.flowIds, validFlow] },
                }
              : e,
          ),
        }));
      else
        setMessage(
          "이미 있는 연결입니다. 선을 선택해 속성을 수정할 수 있습니다.",
        );
      return;
    }
    updateGraph((g) => ({
      ...g,
      edges: [
        ...g.edges,
        {
          id: uid(),
          source: c.source!,
          target: c.target!,
          sourceHandle: c.sourceHandle || null,
          targetHandle: c.targetHandle || null,
          data: {
            kind,
            label:
              kind === "async"
                ? "비동기 작업"
                : kind === "relation"
                  ? "구성 관계"
                  : "호출",
            flowIds: validFlow ? [validFlow] : [],
            calls: 1,
            traffic: "all",
          },
        },
      ],
    }));
  }
  function nodeClick(id: string) {
    if (source) {
      if (source !== id)
        connect({
          source,
          target: id,
          sourceHandle: null,
          targetHandle: null,
        });
      setSelection({ nodes: [source], edges: [] });
    } else setPanel("right");
  }
  function addComponent(catalogId: string, copyId?: string) {
    if (!g) return;
    if (g.nodes.length >= 1000) {
      setMessage("프로젝트당 최대 1,000개 요소를 지원합니다.");
      return;
    }
    checkpoint();
    const copy = g.nodes.find((n) => n.id === copyId),
      item = getItem(catalogId),
      id = uid();
    const n: Vertex = copy
      ? {
          ...structuredClone(copy),
          id,
          parentId: undefined,
          position: {
            x: absolutePosition(copy, g.nodes).x + 36,
            y: absolutePosition(copy, g.nodes).y + 36,
          },
          data: {
            ...structuredClone(copy.data),
            name: copy.data.name + " 사본",
          },
        }
      : {
          id,
          type: "component",
          position: {
            x: 180 + (g.nodes.length % 4) * 210,
            y: 160 + Math.floor(g.nodes.length / 4) * 160,
          },
          width: 172,
          height: 116,
          data: {
            catalogId,
            name: item.name,
            note: "",
            params: defaultParams(),
          },
        };
    updateGraph((g) => ({ ...g, nodes: [...g.nodes, n] }));
    setSelection({ nodes: [id], edges: [] });
    setDialog(null);
    setSource(null);
    setPanel("right");
  }
  function groupSelection() {
    if (!g) return;
    const chosen = g.nodes.filter(
      (n) => selection.nodes.includes(n.id) && n.type === "component",
    );
    if (!chosen.length) return;
    checkpoint();
    const points = chosen.map((n) => ({
      ...absolutePosition(n, g.nodes),
      w: n.width,
      h: n.height,
    }));
    const x = Math.min(...points.map((p) => p.x)) - 30,
      y = Math.min(...points.map((p) => p.y)) - 45,
      right = Math.max(...points.map((p) => p.x + p.w)) + 30,
      bottom = Math.max(...points.map((p) => p.y + p.h)) + 30,
      id = uid();
    const group: Vertex = {
      id,
      type: "group",
      position: { x, y },
      width: Math.max(220, right - x),
      height: Math.max(170, bottom - y),
      data: {
        catalogId: "group",
        name: "새 그룹",
        note: "",
        params: defaultParams(),
      },
    };
    updateGraph((g) => ({
      ...g,
      nodes: [
        group,
        ...g.nodes.map((n) =>
          chosen.some((c) => c.id === n.id)
            ? {
                ...n,
                parentId: id,
                position: {
                  x: absolutePosition(n, g.nodes).x - x,
                  y: absolutePosition(n, g.nodes).y - y,
                },
              }
            : n,
        ),
      ],
    }));
    setSelection({ nodes: [id], edges: [] });
    setPanel("right");
  }
  function ungroup() {
    if (!g) return;
    checkpoint();
    const groups = selection.nodes.filter(
      (id) => g.nodes.find((n) => n.id === id)?.type === "group",
    );
    updateGraph((g) => {
      const next = removeElements(g, groups, []);
      return {
        ...next,
        nodes: next.nodes.map((n) =>
          selection.nodes.includes(n.id) && n.parentId
            ? {
                ...n,
                parentId: undefined,
                position: absolutePosition(n, next.nodes),
              }
            : n,
        ),
      };
    });
    setSelection({ nodes: [], edges: [] });
  }
  function addProject(name: string, graph = emptyGraph(), folder = folderId) {
    const p: Project = {
      id: uid(),
      name,
      folderId: folder,
      graph,
      interview: "",
      versions: [],
    };
    storage.change((w) => ({
      ...w,
      projects: [...w.projects, p],
      currentProjectId: p.id,
    }));
    setDialog(null);
    setPanel(null);
  }
  function mergeWorkspace(other: Workspace) {
    const ids = new Map(other.folders.map((f) => [f.id, uid()]));
    storage.change((w) =>
      workspaceSchema.parse({
        ...w,
        folders: [
          ...w.folders,
          ...other.folders.map((f) => ({
            ...f,
            id: ids.get(f.id)!,
            parentId: f.parentId ? ids.get(f.parentId)! : null,
          })),
        ],
        projects: [
          ...w.projects,
          ...other.projects.map((p) => ({
            ...p,
            id: uid(),
            folderId: p.folderId ? ids.get(p.folderId)! : null,
            name: p.name + " · 가져옴",
          })),
        ],
      }),
    );
    setDialog(null);
  }
  async function importGuest() {
    try {
      const guest = await loadLocal(null);
      if (guest) {
        mergeWorkspace(guest.data);
        setMessage("이 기기의 로컬 프로젝트를 사본으로 가져왔습니다.");
      } else setMessage("가져올 로컬 프로젝트가 없습니다.");
    } catch (e) {
      setMessage(String(e));
    }
  }
  const historyState = w ? history.current[w.currentProjectId] : null;
  if (!storage.ready || !w || !selectedProject || !g)
    return (
      <div className="loading-screen">
        <Workflow size={28} />
        <h1>Archflow</h1>
        <p>{storage.error || "작업공간을 여는 중입니다…"}</p>
        {storage.error && (
          <p>
            기존 기기 저장소를 지우지 말고, 다른 브라우저 또는 JSON 백업을
            확인해 주세요.
          </p>
        )}
      </div>
    );
  const flowResult = activeFlow ? analyze(g, activeFlow) : null;
  const problems = Object.values(metrics).filter((m) => m.bad).length;
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return (
      <>
        {w!.folders
          .filter((f) => f.parentId === parent)
          .map((f) => (
            <div className="folder-block" key={f.id}>
              <button
                className={
                  "directory-row " + (folderId === f.id ? "current" : "")
                }
                style={{ paddingLeft: 10 + depth * 12 }}
                onClick={() => setFolderId(f.id)}
              >
                <Folder size={15} />
                <span>{f.name}</span>
              </button>
              {tree(f.id, depth + 1)}
            </div>
          ))}
        {w!.projects
          .filter((p) => p.folderId === parent)
          .map((p) => (
            <button
              key={p.id}
              className={
                "directory-row " +
                (w!.currentProjectId === p.id ? "active" : "")
              }
              style={{ paddingLeft: 10 + depth * 12 }}
              onClick={() => switchProject(p.id)}
            >
              <Workflow size={14} />
              <span>{p.name}</span>
            </button>
          ))}
      </>
    );
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Workflow size={20} />
          <span>archflow</span>
        </div>
        <span className="separator" />
        <button
          className="project-picker"
          onClick={() => setDialog("projects")}
        >
          {selectedProject.name}
          <ChevronDown size={14} />
        </button>
        <div className="top-actions">
          <span className="save-status" title={storage.error || storage.status}>
            {storage.user ? <Cloud size={14} /> : <Laptop size={14} />}
            <span>{storage.status}</span>
          </span>
          <button className="outline" onClick={() => setDialog("ai")}>
            <MessagesSquare size={15} />
            <span>AI 인터뷰</span>
          </button>
          <button
            className="account-button"
            onClick={() => setDialog("auth")}
            aria-label={storage.user ? "계정과 동기화" : "로그인"}
          >
            {storage.user ? (
              <span className="avatar">
                {storage.user.email?.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <LogIn size={17} />
            )}
          </button>
        </div>
      </header>
      <div className="contextbar">
        <nav aria-label="사용 목적">
          {[
            ["understand", "이해하기"],
            ["design", "설계하기"],
            ["improve", "개선하기"],
          ].map(([id, title]) => (
            <button
              key={id}
              aria-pressed={purpose === id}
              onClick={() => {
                setPurpose(id);
                if (id === "improve") {
                  const n = g.nodes.find((n) => metrics[n.id]?.bad);
                  if (n) {
                    setSelection({ nodes: [n.id], edges: [] });
                    setPanel("right");
                  }
                }
              }}
            >
              {title}
            </button>
          ))}
        </nav>
        <span className="context-help">
          {purpose === "understand"
            ? "흐름과 역할을 읽어보세요"
            : purpose === "design"
              ? "요구사항을 구조로 옮겨보세요"
              : "목표와 현재 가정을 비교해 보세요"}
        </span>
        <div className="mobile-panels">
          <button
            aria-label="프로젝트 패널"
            onClick={() => setPanel(panel === "left" ? null : "left")}
          >
            <PanelLeft size={17} />
          </button>
          <button
            aria-label="속성 패널"
            onClick={() => setPanel(panel === "right" ? null : "right")}
          >
            <PanelRight size={17} />
          </button>
        </div>
      </div>
      {(storage.error || storage.conflict) && (
        <div className="sync-alert" role="status">
          <TriangleAlert size={15} />
          <span>
            {storage.conflict
              ? "다른 기기에서 변경되었습니다. 현재 작업을 보존한 채 클라우드 사본을 합칠 수 있습니다."
              : storage.error}
          </span>
          {storage.conflict ? (
            <button
              onClick={() => {
                try {
                  storage.mergeCloud();
                } catch (e) {
                  setMessage(String(e));
                }
              }}
            >
              사본으로 합치기
            </button>
          ) : (
            <button onClick={() => void storage.sync()}>다시 시도</button>
          )}
          <button onClick={() => downloadJson(w, "archflow-backup.json")}>
            백업
          </button>
        </div>
      )}
      <div
        className={
          "workspace " +
          (panel === "left"
            ? "show-left "
            : panel === "right"
              ? "show-right "
              : "")
        }
      >
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span>프로젝트</span>
            <button
              aria-label="프로젝트 관리"
              onClick={() => setDialog("projects")}
            >
              <PanelLeft size={15} />
            </button>
          </div>
          <div className="directory-heading">
            <span>내 작업공간</span>
            <button
              aria-label="폴더 만들기"
              onClick={() => setDialog("new-folder")}
            >
              <FolderPlus size={15} />
            </button>
            <button
              aria-label="프로젝트 만들기"
              onClick={() => setDialog("new-project")}
            >
              <FilePlus2 size={15} />
            </button>
          </div>
          <div className="project-tree">{tree(null)}</div>
          <div className="sidebar-divider" />
          <div className="sidebar-heading">
            <span>레이어</span>
            <button
              aria-label="구성요소 라이브러리"
              onClick={() => setDialog("library")}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="layers">
            {g.nodes.map((n) => (
              <button
                key={n.id}
                className={
                  "layer-row " +
                  (selection.nodes.includes(n.id) ? "active" : "")
                }
                onClick={(e) => {
                  if (source) {
                    nodeClick(n.id);
                    return;
                  }
                  setSelection({
                    nodes: e.shiftKey
                      ? [...new Set([...selection.nodes, n.id])]
                      : [n.id],
                    edges: [],
                  });
                  setPanel("right");
                }}
                style={{ paddingLeft: n.parentId ? 24 : 10 }}
              >
                {n.type === "group" ? (
                  <Folder size={14} />
                ) : (
                  <TechIcon id={n.data.catalogId} size={18} />
                )}
                <span>{n.data.name}</span>
                {metrics[n.id]?.bad && <i className="problem-dot" />}
              </button>
            ))}
          </div>
          <div className="sidebar-heading">
            <span>API 흐름</span>
            <button
              aria-label="API 흐름 추가"
              onClick={() => setDialog("new-flow")}
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            className={"layer-row " + (!validFlow ? "active" : "")}
            onClick={() => setFlowId(null)}
          >
            <Workflow size={16} />
            전체 아키텍처
          </button>
          {g.flows.map((f) => (
            <button
              key={f.id}
              className={"layer-row " + (f.id === validFlow ? "active" : "")}
              onClick={() => {
                setFlowId(f.id);
                setPanel(null);
              }}
            >
              <span className="method-mini">{f.method}</span>
              <span>{f.name}</span>
            </button>
          ))}
          <div className="sidebar-bottom">
            <button onClick={() => setDialog("versions")}>
              <History size={15} />
              버전
            </button>
            <button
              onClick={() =>
                downloadJson(g, `${selectedProject.name}-architecture.json`)
              }
            >
              <Download size={15} />
              내보내기
            </button>
            <button onClick={() => setDialog("import")}>
              <Upload size={15} />
              가져오기
            </button>
          </div>
        </aside>
        <main className="main-work">
          <div className="trafficbar">
            <div className="view-toggle">
              <button aria-pressed={!validFlow} onClick={() => setFlowId(null)}>
                전체 구조
              </button>
              <button
                aria-pressed={!!validFlow}
                onClick={() => {
                  if (g.flows[0]) setFlowId(g.flows[0].id);
                  else setDialog("new-flow");
                }}
              >
                API 흐름
              </button>
            </div>
            {activeFlow ? (
              <label className="traffic-rps">
                유입
                <input
                  type="number"
                  aria-label="요청 유입 RPS"
                  value={activeFlow.rps ?? ""}
                  placeholder="미지정"
                  min={0}
                  max={1e9}
                  onFocus={checkpoint}
                  onChange={(e) =>
                    updateGraph((g) => ({
                      ...g,
                      flows: g.flows.map((f) =>
                        f.id === activeFlow.id
                          ? {
                              ...f,
                              rps:
                                e.target.value === ""
                                  ? null
                                  : Math.min(
                                      1e9,
                                      Math.max(0, Number(e.target.value)),
                                    ),
                            }
                          : f,
                      ),
                    }))
                  }
                />
                RPS
              </label>
            ) : (
              <span className="traffic-summary">
                {g.nodes.filter((n) => n.type === "component").length}개 요소 ·{" "}
                {g.edges.length}개 연결
              </span>
            )}
            <label className="motion-switch">
              <input
                type="checkbox"
                role="switch"
                aria-label="요청 흐름 모션"
                checked={w.preferences.motion}
                onChange={(e) =>
                  storage.change((w) => ({
                    ...w,
                    preferences: { ...w.preferences, motion: e.target.checked },
                  }))
                }
              />
              <span>흐름 모션</span>
            </label>
          </div>
          <Canvas
            key={selectedProject.id}
            graph={g}
            flowId={validFlow}
            motion={w.preferences.motion}
            snap={w.preferences.snap}
            selection={selection}
            source={source}
            tool={tool}
            change={updateGraph}
            checkpoint={checkpoint}
            select={setSelection}
            nodeClick={nodeClick}
            connect={connect}
            setTool={setTool}
            toggleSnap={() =>
              storage.change((w) => ({
                ...w,
                preferences: { ...w.preferences, snap: !w.preferences.snap },
              }))
            }
            add={() => setDialog("library")}
            group={groupSelection}
            ungroup={ungroup}
            remove={remove}
            undo={undo}
            redo={redo}
            canUndo={!!historyState?.past.length}
            canRedo={!!historyState?.future.length}
            fitKey={0}
          />
          <div className="findings">
            <div>
              <strong>{validFlow ? "설계 확인" : "전체 연결 관계"}</strong>
              <span className={problems ? "issue-text" : ""}>
                {problems
                  ? `문제 후보 ${problems}곳`
                  : validFlow
                    ? "설정한 수치를 확인하세요"
                    : "모든 API의 요구 부하를 합산합니다"}
              </span>
            </div>
            {flowResult ? (
              <div className="findings-values">
                <span>
                  기본 지연 <b>{fmt(flowResult.latency)} ms</b>
                </span>
                <span>
                  직렬 가용성 <b>{percent(flowResult.availability)}</b>
                </span>
                <span>{flowResult.required.length}개 항</span>
              </div>
            ) : (
              <div className="legend">
                <span>
                  <i className="line-swatch sync" />
                  동기 · 실선
                </span>
                <span>
                  <i className="line-swatch async" />
                  비동기 · 점선
                </span>
                <span>
                  <i className="line-swatch relation" />
                  구성 관계
                </span>
              </div>
            )}
          </div>
        </main>
        <Inspector
          graph={g}
          flowId={validFlow}
          nodeIds={selection.nodes}
          edgeIds={selection.edges}
          source={source}
          connectionKind={connectionKind}
          update={updateGraph}
          startConnect={(id, kind) => {
            setSource(id);
            setConnectionKind(kind);
            setSelection({ nodes: [id], edges: [] });
            setTool("select");
          }}
          stopConnect={() => setSource(null)}
          selectNode={(id) => setSelection({ nodes: [id], edges: [] })}
          selectEdge={(id) => {
            setSelection({ nodes: [], edges: [id] });
            setSource(null);
          }}
          remove={remove}
          duplicate={(id) =>
            addComponent(g.nodes.find((n) => n.id === id)!.data.catalogId, id)
          }
          checkpoint={checkpoint}
          close={() => setPanel(null)}
        />
      </div>
      <footer className="statusbar">
        <span>
          <MousePointer2 size={12} />
          {source
            ? `${g.nodes.find((n) => n.id === source)?.data.name} → 대상을 계속 선택하세요 · ${connectionKind === "async" ? "비동기" : connectionKind === "sync" ? "동기" : "구성 관계"}`
            : "드래그로 다중 선택 · Shift로 추가 선택 · Space로 화면 이동 · Alt로 맞춤 해제"}
        </span>
        <span>가정값 · 실측을 대체하지 않습니다</span>
      </footer>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {dialog === "library" && (
        <Library close={() => setDialog(null)} add={addComponent} />
      )}
      {dialog === "projects" && (
        <Modal title="내 프로젝트" close={() => setDialog(null)}>
          <div className="project-tree modal-tree">{tree(null)}</div>
          <div className="button-row">
            <button className="outline" onClick={() => setDialog("new-folder")}>
              <FolderPlus size={15} />
              폴더 만들기
            </button>
            <button
              className="primary"
              onClick={() => setDialog("new-project")}
            >
              <Plus size={15} />
              프로젝트 만들기
            </button>
          </div>
          <label className="field vertical">
            <span>현재 프로젝트 이름</span>
            <input
              value={selectedProject.name}
              maxLength={80}
              onChange={(e) =>
                updateProject((p) => ({
                  ...p,
                  name: e.target.value || "이름 없음",
                }))
              }
            />
          </label>
          <label className="field vertical">
            <span>저장 폴더</span>
            <select
              value={selectedProject.folderId || ""}
              onChange={(e) =>
                updateProject((p) => ({
                  ...p,
                  folderId: e.target.value || null,
                }))
              }
            >
              <option value="">내 작업공간</option>
              {w.folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="outline"
            onClick={() => downloadJson(w, "archflow-workspace.json")}
          >
            전체 작업공간 백업
          </button>
          <button
            className="text-button"
            onClick={() => setDialog("workspace-import")}
          >
            작업공간 백업 가져오기
          </button>
        </Modal>
      )}
      {(dialog === "new-project" ||
        dialog === "new-folder" ||
        dialog === "new-flow") && (
        <Creation
          mode={dialog}
          folders={w.folders}
          folderId={folderId}
          close={() => setDialog(null)}
          submit={(name, parent) => {
            if (dialog === "new-project")
              addProject(name, emptyGraph(), parent);
            if (dialog === "new-folder") {
              const id = uid();
              storage.change((w) => ({
                ...w,
                folders: [...w.folders, { id, name, parentId: parent }],
              }));
              setFolderId(id);
              setDialog(null);
            }
            if (dialog === "new-flow") {
              const f = createFlow(name);
              checkpoint();
              updateGraph((g) => ({ ...g, flows: [...g.flows, f] }));
              setFlowId(f.id);
              setDialog(null);
              setPanel("right");
            }
          }}
        />
      )}
      {dialog === "ai" && (
        <AiDialog
          project={selectedProject}
          update={(text) => updateProject((p) => ({ ...p, interview: text }))}
          importGraph={() => setDialog("import")}
          close={() => setDialog(null)}
        />
      )}
      {(dialog === "import" || dialog === "workspace-import") && (
        <ImportDialog
          workspace={dialog === "workspace-import"}
          close={() => setDialog(null)}
          apply={(value) => {
            if (dialog === "workspace-import")
              mergeWorkspace(value as Workspace);
            else
              addProject(
                selectedProject.name + " · AI 초안",
                value as Graph,
                selectedProject.folderId,
              );
          }}
        />
      )}
      {dialog === "versions" && (
        <Versions
          project={selectedProject}
          close={() => setDialog(null)}
          save={(name) => {
            updateProject((p) => ({
              ...p,
              versions: [
                {
                  id: uid(),
                  name,
                  createdAt: new Date().toISOString(),
                  source: "manual" as const,
                  graph: structuredClone(p.graph),
                },
                ...p.versions,
              ].slice(0, 30),
            }));
            setMessage("현재 구조를 버전으로 저장했습니다.");
          }}
          restore={(graph) => {
            checkpoint();
            updateGraph(() => structuredClone(graph));
            setSelection({ nodes: [], edges: [] });
            setDialog(null);
            setMessage(
              "버전을 복원했습니다. 실행 취소로 이전 구조로 돌아갈 수 있습니다.",
            );
          }}
        />
      )}
      {dialog === "auth" && (
        <AuthDialog
          userEmail={storage.user?.email}
          close={() => setDialog(null)}
          importGuest={importGuest}
          logout={async () => {
            await storage.sync();
            await supabase?.auth.signOut();
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
function Creation({
  mode,
  folders,
  folderId,
  submit,
  close,
}: {
  mode: "new-project" | "new-folder" | "new-flow";
  folders: Workspace["folders"];
  folderId: string | null;
  submit: (name: string, parent: string | null) => void;
  close: () => void;
}) {
  const [name, setName] = useState(""),
    [parent, setParent] = useState(folderId || "");
  const title =
    mode === "new-project"
      ? "프로젝트 만들기"
      : mode === "new-folder"
        ? "폴더 만들기"
        : "API 흐름 추가";
  return (
    <Modal title={title} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) submit(name.trim(), parent || null);
        }}
      >
        <label className="field vertical">
          <span>이름</span>
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode === "new-flow" ? "예: 주문 생성" : "예: 주문 서비스"
            }
          />
        </label>
        {mode !== "new-flow" && (
          <label className="field vertical">
            <span>{mode === "new-folder" ? "상위 폴더" : "저장 폴더"}</span>
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">내 작업공간</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="button-row">
          <button type="button" className="outline" onClick={close}>
            취소
          </button>
          <button type="submit" className="primary">
            만들기
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Library({
  close,
  add,
}: {
  close: () => void;
  add: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [provider, setProvider] = useState("all"),
    [category, setCategory] = useState("all"),
    [page, setPage] = useState(0);
  const results = catalog.filter(
    (n) =>
      (provider === "all" || n.provider === provider) &&
      (category === "all" || n.category === category) &&
      `${n.name} ${n.title} ${n.keywords || ""} ${n.category}`
        .toLowerCase()
        .replace(/\s/g, "")
        .includes(query.toLowerCase().replace(/\s/g, "")),
  );
  const cats = [
    ...new Set(
      catalog
        .filter((n) => provider === "all" || n.provider === provider)
        .map((n) => n.category),
    ),
  ].sort();
  return (
    <Modal title="구성요소 라이브러리" close={close} wide>
      <p className="help">
        AWS Labs v23.1 아이콘 872종 · 백엔드·인프라 75종 · LMS·기본 구성요소
      </p>
      <label className="search-field">
        <Search size={16} />
        <input
          aria-label="구성요소 검색"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="EC2, Docker, 인코더…"
        />
      </label>
      <div className="two-cols">
        <select
          aria-label="구성요소 출처"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setCategory("all");
            setPage(0);
          }}
        >
          <option value="all">전체 라이브러리</option>
          <option value="aws">AWS</option>
          <option value="backend">백엔드 · 인프라</option>
          <option value="basic">LMS · 기본</option>
        </select>
        <select
          aria-label="구성요소 분류"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">모든 분류</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {categoryName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="library-count">
        {results.length}종 ·{" "}
        {results.length
          ? `${page * 24 + 1}–${Math.min((page + 1) * 24, results.length)}`
          : "결과 없음"}
      </div>
      <div className="library-grid">
        {results.slice(page * 24, (page + 1) * 24).map((n) => (
          <button key={n.id} className="library-item" onClick={() => add(n.id)}>
            <TechIcon id={n.id} size={30} />
            <span>{n.title}</span>
            <small>{categoryName(n.category)}</small>
          </button>
        ))}
      </div>
      <div className="pagination">
        <button
          className="outline"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          이전
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(results.length / 24))}
        </span>
        <button
          className="outline"
          disabled={(page + 1) * 24 >= results.length}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
      <button className="text-button" onClick={() => add("custom")}>
        목록에 없는 사용자 정의 구성요소 추가
      </button>
      <p className="help">
        성능·가용성은 공급자 보장값으로 채우지 않습니다. 모르는 값은 비워
        두세요.
      </p>
    </Modal>
  );
}
function AiDialog({
  project,
  update,
  close,
  importGraph,
}: {
  project: Project;
  update: (text: string) => void;
  close: () => void;
  importGraph: () => void;
}) {
  const [include, setInclude] = useState(false),
    [copied, setCopied] = useState(false);
  const example: Graph = {
    schemaVersion: 1,
    nodes: [
      {
        id: "api",
        type: "component",
        position: { x: 100, y: 100 },
        width: 172,
        height: 116,
        data: {
          catalogId: "api",
          name: "회원 API",
          note: "확인한 근거를 적습니다.",
          params: defaultParams(),
        },
      },
    ],
    edges: [],
    flows: [],
  };
  const schemaHelp = `\n\n[현재 Archflow의 가져오기 형식]\n인터뷰를 마친 후, 사용자 요청이 있으면 아래 Graph JSON 형식에 맞춘 구조를 추가로 출력할 수 있습니다. 모르는 수치는 null로 두세요. 기존 구조와 개선안은 별도 JSON으로 구분합니다.\n${JSON.stringify(example, null, 2)}\n연결: {id, source, target, data:{kind:"sync"|"async"|"relation",label,flowIds:[],calls:1,traffic:"all"|"cache-miss"}}.\n요청: {id,name,method:"GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"EVENT",route,entryId,rps:null,hitPercent:0,latencyTarget:null,availabilityTarget:null,requiredIds:[]}.\n그룹은 type:"group", catalogId:"group"으로 만들고, 구성원의 parentId를 그룹 ID로 지정합니다. 구성원의 position은 그룹 기준 상대 좌표입니다. ID는 영문·숫자·하이픈·밑줄만 사용합니다. 모든 연결·요청 참조는 실제 ID와 일치해야 합니다. catalogId를 모르면 custom을 사용하고 기술은 note에 기록하세요. JSON은 가져오기 화면에서 검증 후 별도 프로젝트로 생성됩니다.`;
  const prompt =
    interviewPrompt +
    schemaHelp +
    (include
      ? "\n\n[현재 캔버스 — 실제 서비스인지 먼저 확인할 참고 자료]\n" +
        JSON.stringify(project.graph, null, 2)
      : "");
  return (
    <Modal title="AI와 서비스 인터뷰" close={close} wide>
      <p className="help">
        사용 중인 AI에 복사하면 서비스 설명부터 질문합니다. Archflow는 모델
        API를 호출하지 않습니다.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => setInclude(e.target.checked)}
        />
        현재 캔버스를 참고 자료로 포함
      </label>
      <textarea
        className="prompt-box"
        aria-label="복사할 인터뷰 프롬프트"
        readOnly
        value={prompt}
      />
      <div className="button-row">
        <button
          className="primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={15} />
          {copied ? "복사했습니다" : "프롬프트 복사"}
        </button>
        <button
          className="outline"
          onClick={() => downloadJson(project.graph, "archflow-context.json")}
        >
          현재 구조 내려받기
        </button>
      </div>
      <label className="field vertical">
        <span>인터뷰 결과 · 서비스 설명</span>
        <textarea
          value={project.interview}
          onChange={(e) => update(e.target.value)}
          maxLength={100000}
          rows={6}
          placeholder="AI와 인터뷰한 결과나 확인된 사실을 보관하세요."
        />
      </label>
      <button className="outline" onClick={importGraph}>
        <Upload size={15} />
        AI가 만든 구조 검토·가져오기
      </button>
    </Modal>
  );
}
function ImportDialog({
  workspace,
  close,
  apply,
}: {
  workspace: boolean;
  close: () => void;
  apply: (value: Graph | Workspace) => void;
}) {
  const [text, setText] = useState(""),
    [parsed, setParsed] = useState<Graph | Workspace | null>(null),
    [error, setError] = useState("");
  function validate(value = text) {
    try {
      const cleaned = value
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, "");
      if (cleaned.length > 20_000_000)
        throw new Error("20MB 이하로 가져와 주세요.");
      const next = workspace
        ? workspaceSchema.parse(JSON.parse(cleaned))
        : parseGraph(cleaned);
      setParsed(next);
      setError("");
    } catch (e) {
      setParsed(null);
      setError(
        "형식을 확인해 주세요. " +
          (e instanceof Error ? e.message : String(e)).slice(0, 600),
      );
    }
  }
  return (
    <Modal
      title={workspace ? "작업공간 백업 가져오기" : "구조 검토·가져오기"}
      close={close}
      wide
    >
      <p className="help">
        {workspace
          ? "기존 프로젝트를 유지하며 사본으로 추가합니다."
          : "현재 구조를 보존하고, 검토한 결과를 새 프로젝트로 만듭니다."}
      </p>
      <label className="file-label">
        JSON 파일 선택
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 20_000_000) {
              setError("20MB 이하 파일을 선택해 주세요.");
              return;
            }
            const value = await file.text();
            setText(value);
            validate(value);
          }}
        />
      </label>
      <textarea
        className="json-box"
        aria-label="가져올 JSON"
        placeholder="JSON을 붙여 넣으세요."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParsed(null);
          setError("");
        }}
      />
      {error && (
        <pre className="validation-error" role="alert">
          {error}
        </pre>
      )}
      {parsed && (
        <div className="import-preview">
          <Check size={17} />
          {"projects" in parsed
            ? `${parsed.projects.length}개 프로젝트 · ${parsed.folders.length}개 폴더`
            : `${parsed.nodes.length}개 구성요소·그룹 · ${parsed.edges.length}개 연결 · ${parsed.flows.length}개 요청`}
          <p>검증 완료 · 새 사본으로 추가됩니다.</p>
          {"nodes" in parsed && (
            <ul>
              {parsed.nodes.slice(0, 12).map((n) => (
                <li key={n.id}>
                  {n.data.name} · {getItem(n.data.catalogId).title}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="button-row">
        <button className="outline" onClick={() => validate()}>
          형식 검증·미리보기
        </button>
        <button
          className="primary"
          disabled={!parsed}
          onClick={() => {
            if (parsed) apply(parsed);
          }}
        >
          검토한 구조 가져오기
        </button>
      </div>
    </Modal>
  );
}
function Versions({
  project,
  save,
  restore,
  close,
}: {
  project: Project;
  save: (name: string) => void;
  restore: (graph: Graph) => void;
  close: () => void;
}) {
  const [name, setName] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const version = project.versions.find((v) => v.id === selected);
  return (
    <Modal title="아키텍처 버전" close={close}>
      <form
        className="button-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            save(name.trim());
            setName("");
          }
        }}
      >
        <input
          aria-label="버전 이름"
          placeholder="예: 캐시 추가 전"
          maxLength={100}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary">
          현재 구조 저장
        </button>
      </form>
      <p className="help">
        최근 30개를 보관합니다. 더 오래 보관하려면 JSON으로 내보내세요.
      </p>
      <div className="version-list">
        {project.versions.map((v) => (
          <button
            key={v.id}
            aria-pressed={selected === v.id}
            onClick={() => setSelected(v.id)}
          >
            <History size={16} />
            <span>
              {v.name}
              <small>{new Date(v.createdAt).toLocaleString("ko-KR")}</small>
            </span>
          </button>
        ))}
        {!project.versions.length && (
          <p className="help">아직 저장한 버전이 없습니다.</p>
        )}
      </div>
      {version && (
        <div className="import-preview">
          <p>
            {version.graph.nodes.length}개 요소 · {version.graph.edges.length}개
            연결
          </p>
          <p>
            현재 대비 요소{" "}
            {version.graph.nodes.length - project.graph.nodes.length >= 0
              ? "+"
              : ""}
            {version.graph.nodes.length - project.graph.nodes.length}개
          </p>
          <div className="button-row">
            <button
              className="outline"
              onClick={() =>
                downloadJson(version.graph, `${version.name}.json`)
              }
            >
              내려받기
            </button>
            <button className="primary" onClick={() => restore(version.graph)}>
              이 버전 복원 · 실행 취소 가능
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
function AuthDialog({
  userEmail,
  importGuest,
  logout,
  close,
}: {
  userEmail?: string;
  importGuest: () => Promise<void>;
  logout: () => Promise<void>;
  close: () => void;
}) {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(
      error
        ? error.message
        : "로그인 링크를 이메일로 보냈습니다. 메일에서 링크를 열어 주세요.",
    );
    setBusy(false);
  }
  return (
    <Modal title={userEmail ? "계정과 동기화" : "로그인"} close={close}>
      {userEmail ? (
        <>
          <p>{userEmail}</p>
          <p className="help">
            로그인한 사용자의 프로젝트만 클라우드에서 읽고 저장합니다.
          </p>
          <button className="outline" onClick={() => void importGuest()}>
            로그인 전 로컬 프로젝트를 사본으로 가져오기
          </button>
          <button className="text-button" onClick={() => void logout()}>
            <LogOut size={14} />
            로그아웃
          </button>
        </>
      ) : supabase ? (
        <>
          <p className="help">
            이메일 링크로 로그인하면 기기 간에 프로젝트를 이어갈 수 있습니다.
            로그인 전 프로젝트는 이 브라우저에 저장됩니다.
          </p>
          <form onSubmit={login}>
            <label className="field vertical">
              <span>이메일</span>
              <input
                autoFocus
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "보내는 중…" : "로그인 링크 받기"}
            </button>
          </form>
          <p role="status">{message}</p>
        </>
      ) : (
        <>
          <p>현재는 이 기기에 저장하는 모드입니다.</p>
          <p className="help">
            Supabase를 연결하면 이메일 로그인과 클라우드 저장을 사용할 수
            있습니다. 저장소의 배포 안내에 따라 환경 변수 두 개와 DB
            마이그레이션을 설정해 주세요.
          </p>
          <a
            href="https://github.com/smiinii/archflow/blob/main/docs/deployment.md"
            target="_blank"
            rel="noreferrer"
          >
            Supabase·Vercel 설정 안내 <ArrowRight size={13} />
          </a>
        </>
      )}
    </Modal>
  );
}
