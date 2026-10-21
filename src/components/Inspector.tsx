import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleHelp,
  Copy,
  Send,
  Trash2,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { allMetrics, analyze, fmt, percent } from "../lib/analysis";
import { getItem } from "../lib/catalog";
import {
  absolutePosition,
  type Flow,
  type Graph,
  type Link,
  type Params,
  type Vertex,
} from "../lib/model";
import { TechIcon } from "./Icons";
type Props = {
  graph: Graph;
  flowId: string | null;
  nodeIds: string[];
  edgeIds: string[];
  source: string | null;
  connectionKind: Link["data"]["kind"];
  update: (fn: (g: Graph) => Graph) => void;
  startConnect: (id: string, kind: Link["data"]["kind"]) => void;
  stopConnect: () => void;
  selectNode: (id: string) => void;
  selectEdge: (id: string) => void;
  remove: () => void;
  duplicate: (id: string) => void;
  checkpoint: () => void;
  open: boolean;
  toggleOpen: () => void;
  showCanvas: () => void;
};
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e9,
  step = "any",
  hint,
  checkpoint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  hint?: string;
  checkpoint: () => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder="미지정"
        onFocus={checkpoint}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n))
            onChange(
              Math.max(min, Math.min(max, step === 1 ? Math.round(n) : n)),
            );
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Inspector(p: Props) {
  const n = p.graph.nodes.find((n) => p.nodeIds.includes(n.id)),
    edge = p.graph.edges.find((e) => p.edgeIds.includes(e.id)),
    flow = p.graph.flows.find((f) => f.id === p.flowId),
    metrics = allMetrics(p.graph, p.flowId),
    m = n ? metrics[n.id] : null;
  const [tab, setTab] = useState<"properties" | "diagnosis" | "goals">(
    "properties",
  );
  useEffect(
    () => setTab(n && metrics[n.id]?.bad ? "diagnosis" : "properties"),
    [n?.id],
  );
  useEffect(() => {
    if (p.flowId) setTab("goals");
  }, [p.flowId]);
  useEffect(() => {
    if (edge) setTab("properties");
  }, [edge?.id]);
  const nodeUpdate = (patch: Partial<Vertex>) =>
    p.update((g) => ({
      ...g,
      nodes: g.nodes.map((x) => (x.id === n?.id ? { ...x, ...patch } : x)),
    }));
  const params = (patch: Partial<Params>) => {
    if (n)
      nodeUpdate({
        data: { ...n.data, params: { ...n.data.params, ...patch } },
      });
  };
  const data = (patch: Partial<Vertex["data"]>) => {
    if (n) nodeUpdate({ data: { ...n.data, ...patch } });
  };
  const edgeData = (patch: Partial<Link["data"]>) =>
    p.update((g) => ({
      ...g,
      edges: g.edges.map((e) =>
        e.id === edge?.id ? { ...e, data: { ...e.data, ...patch } } : e,
      ),
    }));
  const flowUpdate = (patch: Partial<Flow>) =>
    p.update((g) => ({
      ...g,
      flows: g.flows.map((f) => (f.id === flow?.id ? { ...f, ...patch } : f)),
    }));
  const number = (
    label: string,
    key: keyof Params,
    min = 0,
    max = 1e9,
    step: number | "any" = "any",
    hint?: string,
  ) =>
    n && (
      <NumberField
        key={key}
        label={label}
        value={n.data.params[key] as number | null}
        onChange={(value) =>
          params({ [key]: key === "replicas" ? value || 1 : value })
        }
        min={min}
        max={max}
        step={step}
        hint={hint}
        checkpoint={p.checkpoint}
      />
    );
  return (
    <aside className="inspector" aria-label="속성과 진단">
      <div className="inspector-tabs">
        <button
          aria-pressed={tab === "properties"}
          onClick={() => {
            setTab("properties");
            if (!p.open) p.toggleOpen();
          }}
        >
          속성
        </button>
        <button
          aria-pressed={tab === "diagnosis"}
          onClick={() => {
            setTab("diagnosis");
            if (!p.open) p.toggleOpen();
          }}
        >
          진단
        </button>
        <button
          disabled={!flow}
          aria-pressed={tab === "goals"}
          onClick={() => {
            setTab("goals");
            if (!p.open) p.toggleOpen();
          }}
        >
          요청 목표
        </button>
        <span className="inspector-selection">
          {n?.data.name || (edge ? "연결 설정" : flow?.name || "속성 · 진단")}
        </span>
        <button
          aria-label="아키텍처로 돌아가기"
          title="아키텍처로 돌아가기"
          onClick={p.showCanvas}
        >
          <ArrowUp size={16} />
          <span className="back-to-canvas">아키텍처로</span>
        </button>
        <button
          aria-label={p.open ? "상세 정보 접기" : "상세 정보 펼치기"}
          aria-expanded={p.open}
          aria-controls="inspector-content"
          title={p.open ? "접기" : "펼치기"}
          onClick={p.toggleOpen}
        >
          {p.open ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
      </div>
      <div className="inspector-scroll" id="inspector-content" hidden={!p.open}>
        {tab === "goals" && flow ? (
          <>
            <section className="inspector-section">
              <div className="selected-heading">
                <ShieldCheck size={24} />
                <div>
                  <h2>{flow.name}</h2>
                  <small>
                    {flow.method} {flow.route}
                  </small>
                </div>
              </div>
              <label className="field vertical">
                <span>요청 이름</span>
                <input
                  value={flow.name}
                  onFocus={p.checkpoint}
                  onChange={(e) =>
                    flowUpdate({ name: e.target.value || "새 요청" })
                  }
                  maxLength={80}
                />
              </label>
              <div className="two-cols">
                <label className="field vertical">
                  <span>메서드</span>
                  <select
                    value={flow.method}
                    onChange={(e) =>
                      flowUpdate({ method: e.target.value as Flow["method"] })
                    }
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "EVENT"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="field vertical">
                  <span>경로</span>
                  <input
                    value={flow.route}
                    onChange={(e) => flowUpdate({ route: e.target.value })}
                    maxLength={200}
                  />
                </label>
              </div>
              <label className="field vertical">
                <span>요청 시작점</span>
                <select
                  value={flow.entryId || ""}
                  onChange={(e) =>
                    flowUpdate({ entryId: e.target.value || null })
                  }
                >
                  <option value="">선택하세요</option>
                  {p.graph.nodes
                    .filter((n) => n.type === "component")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.data.name}
                      </option>
                    ))}
                </select>
              </label>
            </section>
            <section className="inspector-section">
              <h3>트래픽과 목표</h3>
              <NumberField
                label="유입 · RPS"
                value={flow.rps}
                onChange={(rps) => flowUpdate({ rps })}
                checkpoint={p.checkpoint}
              />
              <NumberField
                label="캐시 적중률 · %"
                max={100}
                value={flow.hitPercent}
                onChange={(hitPercent) =>
                  flowUpdate({ hitPercent: hitPercent ?? 0 })
                }
                checkpoint={p.checkpoint}
                hint="‘캐시 미스’로 지정한 연결에 적용합니다."
              />
              <NumberField
                label="응답 시간 목표 · ms"
                value={flow.latencyTarget}
                max={600000}
                onChange={(latencyTarget) => flowUpdate({ latencyTarget })}
                checkpoint={p.checkpoint}
              />
              <NumberField
                label="가용성 목표 · %"
                value={flow.availabilityTarget}
                max={100}
                onChange={(availabilityTarget) =>
                  flowUpdate({ availabilityTarget })
                }
                checkpoint={p.checkpoint}
              />
              {flow.availabilityTarget !== null && (
                <p className="help">
                  {percent(flow.availabilityTarget)}는 30일 기준 약{" "}
                  {fmt((1 - flow.availabilityTarget / 100) * 43200)}분의 중단을
                  허용하는 목표입니다.
                </p>
              )}
              <FlowResult graph={p.graph} flow={flow} />
            </section>
            <section className="inspector-section">
              <h3>완료에 필수인 요소</h3>
              <p className="help">
                선택한 요소의 동기 도달 경로로 계산합니다. 비동기 뒤에만 있는
                요소는 즉시 응답에서 제외됩니다.
              </p>
              {p.graph.nodes
                .filter(
                  (n) =>
                    n.type === "component" &&
                    n.data.catalogId !== "client" &&
                    !getItem(n.data.catalogId).structural,
                )
                .map((n) => (
                  <label className="check-row" key={n.id}>
                    <input
                      type="checkbox"
                      checked={flow.requiredIds.includes(n.id)}
                      onChange={(e) => {
                        p.checkpoint();
                        flowUpdate({
                          requiredIds: e.target.checked
                            ? [...flow.requiredIds, n.id]
                            : flow.requiredIds.filter((id) => id !== n.id),
                        });
                      }}
                    />
                    <TechIcon id={n.data.catalogId} size={17} />
                    {n.data.name}
                  </label>
                ))}
              <button
                className="danger"
                onClick={() => {
                  p.checkpoint();
                  p.update((g) => ({
                    ...g,
                    flows: g.flows.filter((f) => f.id !== flow.id),
                    edges: g.edges.map((e) => ({
                      ...e,
                      data: {
                        ...e.data,
                        flowIds: e.data.flowIds.filter((id) => id !== flow.id),
                      },
                    })),
                  }));
                }}
              >
                이 API 흐름 삭제
              </button>
            </section>
          </>
        ) : edge ? (
          <>
            <section className="inspector-section">
              <h2>연결 속성</h2>
              <p className="help">
                {p.graph.nodes.find((n) => n.id === edge.source)?.data.name} →{" "}
                {p.graph.nodes.find((n) => n.id === edge.target)?.data.name}
              </p>
              <label className="field vertical">
                <span>연결 설명</span>
                <input
                  value={edge.data.label}
                  onFocus={p.checkpoint}
                  onChange={(e) => edgeData({ label: e.target.value })}
                  maxLength={100}
                />
              </label>
              <label className="field vertical">
                <span>연결 방식</span>
                <select
                  value={edge.data.kind}
                  onChange={(e) => {
                    p.checkpoint();
                    edgeData({ kind: e.target.value as Link["data"]["kind"] });
                  }}
                >
                  <option value="sync">동기 · 실선</option>
                  <option value="async">비동기 · 점선</option>
                  <option value="relation">배포·구성 관계</option>
                </select>
              </label>
              <p className="help">
                동기는 응답을 기다리고, 비동기는 작업 완료를 기다리지 않습니다.
                구성 관계는 요청 계산에서 제외합니다.
              </p>
            </section>
            <section className="inspector-section">
              <h3>호출 설정</h3>
              <NumberField
                label="상위 요청당 호출 횟수"
                value={edge.data.calls}
                onChange={(calls) => edgeData({ calls: calls ?? 1 })}
                max={10000}
                checkpoint={p.checkpoint}
              />
              <label className="field vertical">
                <span>호출 조건</span>
                <select
                  value={edge.data.traffic}
                  onChange={(e) =>
                    edgeData({
                      traffic: e.target.value as "all" | "cache-miss",
                    })
                  }
                >
                  <option value="all">모든 요청</option>
                  <option value="cache-miss">캐시 미스일 때</option>
                </select>
              </label>
            </section>
            <section className="inspector-section">
              <h3>포함할 API 흐름</h3>
              {p.graph.flows.map((f) => (
                <label key={f.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={edge.data.flowIds.includes(f.id)}
                    onChange={(e) => {
                      p.checkpoint();
                      edgeData({
                        flowIds: e.target.checked
                          ? [...edge.data.flowIds, f.id]
                          : edge.data.flowIds.filter((id) => id !== f.id),
                      });
                    }}
                  />
                  {f.name}
                </label>
              ))}
              <button className="danger" onClick={p.remove}>
                <Trash2 size={14} />
                연결 삭제
              </button>
            </section>
          </>
        ) : n ? (
          <>
            <div className="selected-heading inspector-summary">
              {n.type === "group" ? (
                <GroupIcon />
              ) : (
                <TechIcon id={n.data.catalogId} size={30} />
              )}
              <div>
                <h2>{n.data.name}</h2>
                <small>
                  {n.type === "group"
                    ? "그룹"
                    : getItem(n.data.catalogId).title}
                </small>
              </div>
            </div>
            {p.nodeIds.length > 1 && (
              <p className="help">
                {p.nodeIds.length}개 선택됨 · 아래 속성은 첫 번째 요소입니다.
              </p>
            )}
            {tab === "diagnosis" && n.type === "component" && m ? (
              <>
                <section className="inspector-section">
                  <div className={"diagnosis " + (m.bad ? "bad" : "")}>
                    <h3>
                      {m.bad ? <AlertCircle size={16} /> : <Check size={16} />}{" "}
                      {m.overload
                        ? "처리 용량 초과"
                        : m.slow
                          ? "처리 시간 초과"
                          : m.demand === null
                            ? "부하를 확인해 주세요"
                            : "설정 범위 이내"}
                    </h3>
                    <p>
                      {m.overload
                        ? `초당 ${fmt(m.demand)}건이 필요하지만, 현재 설정으로는 ${fmt(m.capacity)}건을 처리할 수 있습니다.`
                        : m.slow
                          ? `평균 처리 ${fmt(n.data.params.meanMs)}ms가 목표 ${fmt(n.data.params.budgetMs)}ms를 넘습니다.`
                          : m.demand === null
                            ? "API 시작점과 연결, 유입 RPS를 설정하거나 요구 부하를 직접 입력해 주세요."
                            : "입력한 가정값에서 용량과 시간 목표를 넘지 않습니다."}
                    </p>
                    {m.bad && (
                      <p>
                        대기열 증가와 시간 초과의 후보입니다. 실제 부하 테스트로
                        확인해 주세요.
                      </p>
                    )}
                  </div>
                  <div className="meter-label">
                    <span>요구 부하 / 계산상 용량</span>
                    <strong>
                      {m.ratio === null
                        ? "미지정"
                        : fmt(m.ratio * 100, 0) + "%"}
                    </strong>
                  </div>
                  <div className={"meter " + (m.bad ? "bad" : "")}>
                    <span
                      style={{
                        width: `${Math.min(100, (m.ratio || 0) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="key-values">
                    <div>
                      <span>요구 부하</span>
                      <strong>{fmt(m.demand)} RPS</strong>
                    </div>
                    <div>
                      <span>계산상 처리 용량</span>
                      <strong>{fmt(m.capacity)} RPS</strong>
                    </div>
                    <div>
                      <span>처리 / 목표</span>
                      <strong>
                        {fmt(n.data.params.meanMs)} /{" "}
                        {fmt(n.data.params.budgetMs)} ms
                      </strong>
                    </div>
                  </div>
                </section>
                <section className="inspector-section">
                  <h3>바꿔서 비교하기</h3>
                  <button
                    className="suggest"
                    onClick={() => {
                      p.checkpoint();
                      params({
                        replicas: n.data.params.replicas + 1,
                        basis: "assumption",
                      });
                    }}
                  >
                    서버 한 대 추가{" "}
                    <span>
                      {n.data.params.replicas} → {n.data.params.replicas + 1}대
                    </span>
                  </button>
                  <button
                    className="suggest"
                    disabled={!n.data.params.meanMs}
                    onClick={() => {
                      p.checkpoint();
                      params({
                        meanMs: n.data.params.meanMs! / 2,
                        basis: "assumption",
                      });
                    }}
                  >
                    처리 시간 절반으로{" "}
                    <span>
                      {fmt(n.data.params.meanMs)} →{" "}
                      {fmt((n.data.params.meanMs || 0) / 2)}ms
                    </span>
                  </button>
                  <button
                    className="outline"
                    onClick={() => setTab("properties")}
                  >
                    설정 수치 바꾸기
                  </button>
                  <details>
                    <summary>계산과 검증 방법</summary>
                    <p>
                      용량 = 동시 처리 수 × 대수 × 1,000 ÷ 평균 처리 시간(ms).
                      슬롯 비례 모델이며 앞단 포화와 공유 DB 한계는 반영하지
                      않습니다.
                    </p>
                    <p>
                      부하 테스트에서 처리량, 대기열, 평균·p95·p99 지연,
                      오류율을 확인하세요. 화면의 비율은 실제 CPU 사용률이
                      아닙니다.
                    </p>
                  </details>
                </section>
              </>
            ) : (
              <>
                <section className="inspector-section">
                  <h3>기본 정보</h3>
                  <label className="field vertical">
                    <span>역할 이름</span>
                    <input
                      value={n.data.name}
                      aria-label="구성요소 이름"
                      maxLength={80}
                      onFocus={p.checkpoint}
                      onChange={(e) =>
                        data({ name: e.target.value || "이름 없음" })
                      }
                    />
                  </label>
                  <div className="two-cols">
                    <NumberField
                      label="너비 · px"
                      min={n.type === "group" ? 200 : 156}
                      max={10000}
                      value={n.width}
                      onChange={(v) => nodeUpdate({ width: v || 156 })}
                      checkpoint={p.checkpoint}
                    />
                    <NumberField
                      label="높이 · px"
                      min={n.type === "group" ? 160 : 114}
                      max={10000}
                      value={n.height}
                      onChange={(v) => nodeUpdate({ height: v || 114 })}
                      checkpoint={p.checkpoint}
                    />
                  </div>
                  {n.type === "component" && (
                    <label className="field vertical">
                      <span>소속 그룹</span>
                      <select
                        value={n.parentId || ""}
                        onChange={(e) => {
                          p.checkpoint();
                          const absolute = absolutePosition(n, p.graph.nodes),
                            parent = p.graph.nodes.find(
                              (x) => x.id === e.target.value,
                            );
                          nodeUpdate({
                            parentId: parent?.id,
                            position: {
                              x: absolute.x - (parent?.position.x || 0),
                              y: absolute.y - (parent?.position.y || 0),
                            },
                          });
                        }}
                      >
                        <option value="">그룹 없음</option>
                        {p.graph.nodes
                          .filter((n) => n.type === "group")
                          .map((n) => (
                            <option value={n.id} key={n.id}>
                              {n.data.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </section>
                {n.type === "component" &&
                  !getItem(n.data.catalogId).structural &&
                  n.data.catalogId !== "client" && (
                    <>
                      <section className="inspector-section">
                        <h3>처리 시간과 용량</h3>
                        <label className="field vertical">
                          <span>수치의 근거</span>
                          <select
                            value={n.data.params.basis}
                            onChange={(e) =>
                              params({
                                basis: e.target.value as Params["basis"],
                              })
                            }
                          >
                            <option value="unknown">확인 필요</option>
                            <option value="assumption">설계 가정</option>
                            <option value="measured">측정값</option>
                          </select>
                        </label>
                        {number(
                          "평균 처리 시간 · ms",
                          "meanMs",
                          0,
                          600000,
                          "any",
                          n.data.params.meanMs === null
                            ? "모르는 값은 비워 두세요."
                            : `${fmt(n.data.params.meanMs)}ms = ${fmt(n.data.params.meanMs / 1000, 4)}초`,
                        )}
                        {number("처리 시간 목표 · ms", "budgetMs", 0, 600000)}
                        <h3>처리 용량</h3>
                        {number("한 대의 동시 처리 수", "slots", 1, 100000, 1)}
                        {number("서버 · 인스턴스 수", "replicas", 1, 10000, 1)}
                        <div className="property-result">
                          계산상 처리 용량{" "}
                          <strong>{fmt(m?.capacity)} RPS</strong>
                        </div>
                      </section>
                      <section className="inspector-section">
                        <h3>신뢰성과 연결</h3>
                        {number("구성요소 가용성 · %", "availability", 0, 100)}
                        {number("연결 지연 · ms", "networkMs", 0, 600000)}
                        {number(
                          "요구 부하 직접 지정 · RPS",
                          "demand",
                          0,
                          1e9,
                          "any",
                          "빈칸은 API 연결에서 계산합니다. 전체 보기는 API 부하의 합입니다.",
                        )}
                        <details>
                          <summary>
                            <CircleHelp size={13} />
                            수치의 의미
                          </summary>
                          <p>
                            <b>처리 용량</b>: 가정한 동시 처리 수와 대수, 평균
                            처리 시간으로 구한 초당 처리 건수입니다.
                          </p>
                          <p>
                            <b>가용성</b>: 해당 구성요소가 정상 작동할 것으로
                            보는 비율입니다. SLA 보장이 아닙니다.
                          </p>
                          <p>
                            <b>연결 지연</b>: 이 요소에 도달하는 평균 네트워크
                            지연입니다. 파일 전송·대기는 제외합니다.
                          </p>
                          <p>
                            <b>요구 RPS</b>: 이 요소가 처리해야 할 호출
                            수입니다. 호출 횟수·캐시 미스 비율을 연결에서 지정할
                            수 있습니다.
                          </p>
                          <p>
                            <b>평균·p95·p99</b>: 평균은 전체의 평균, p95·p99는
                            느린 요청의 경계입니다. 이 화면은 평균 기반 가정이며
                            p99를 예측하지 않습니다.
                          </p>
                        </details>
                      </section>
                    </>
                  )}
                <section className="inspector-section">
                  <h3>메모</h3>
                  <label className="field vertical">
                    <span>설명 · 확인할 근거</span>
                    <textarea
                      value={n.data.note}
                      onFocus={p.checkpoint}
                      onChange={(e) => data({ note: e.target.value })}
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                  <button className="outline" onClick={() => p.duplicate(n.id)}>
                    <Copy size={14} />
                    같은 구성요소 추가
                  </button>
                </section>
              </>
            )}
            {n.type === "component" && (
              <section className="inspector-section">
                <h3>이 구성요소에서 연결</h3>
                <div className="connection-choices">
                  <button
                    className="outline"
                    aria-pressed={
                      p.source === n.id && p.connectionKind === "sync"
                    }
                    onClick={() => p.startConnect(n.id, "sync")}
                  >
                    <ArrowRight size={15} />
                    동기 · 실선
                  </button>
                  <button
                    className="outline"
                    aria-pressed={
                      p.source === n.id && p.connectionKind === "async"
                    }
                    onClick={() => p.startConnect(n.id, "async")}
                  >
                    <Send size={15} />
                    비동기 · 점선
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() => p.startConnect(n.id, "relation")}
                >
                  배포·구성 관계 연결
                </button>
                <p className="help">
                  대상을 계속 클릭하면 여러 곳으로 뻗습니다. 핸들을 끌어서
                  연결할 수도 있습니다.
                </p>
                {p.source && (
                  <button className="outline" onClick={p.stopConnect}>
                    연결 마치기
                  </button>
                )}
                {p.graph.edges
                  .filter((e) => e.source === n.id || e.target === n.id)
                  .map((e) => (
                    <button
                      key={e.id}
                      className="connection-row"
                      onClick={() => p.selectEdge(e.id)}
                    >
                      <span className={"line-swatch " + e.data.kind} />
                      <span>
                        {e.source === n.id
                          ? "→ " +
                            p.graph.nodes.find((x) => x.id === e.target)?.data
                              .name
                          : "← " +
                            p.graph.nodes.find((x) => x.id === e.source)?.data
                              .name}
                        <small>
                          {e.data.kind === "async"
                            ? "비동기"
                            : e.data.kind === "sync"
                              ? "동기"
                              : "구성 관계"}
                        </small>
                      </span>
                    </button>
                  ))}
              </section>
            )}
            <button className="danger inspector-delete" onClick={p.remove}>
              <Trash2 size={14} />
              {n.type === "group"
                ? "그룹 삭제 · 내부 요소 유지"
                : "선택한 구성요소 삭제"}
            </button>
          </>
        ) : (
          <div className="inspector-empty">
            <MouseIcon />
            <h2>구조를 살펴보세요</h2>
            <p>구성요소나 연결을 선택하면 속성과 진단이 표시됩니다.</p>
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
          </div>
        )}
      </div>
    </aside>
  );
}
function GroupIcon() {
  return <span className="empty-icon">▧</span>;
}
function MouseIcon() {
  return <ArrowRight size={24} />;
}
export function FlowResult({ graph, flow }: { graph: Graph; flow: Flow }) {
  const a = analyze(graph, flow);
  return (
    <>
      <h3>요청 경로 계산</h3>
      <div className="key-values">
        <div>
          <span>동기 경로 기본 지연</span>
          <strong>{fmt(a.latency)} ms</strong>
        </div>
        <div>
          <span>직렬 가용성 · {a.required.length}개 항</span>
          <strong>{percent(a.availability)}</strong>
        </div>
      </div>
      {a.cyclic ? (
        <p className="notice">
          순환 호출이 있어 자동 부하·지연 계산을 중단했습니다. 재시도 횟수를
          별도 모델로 분리해 주세요.
        </p>
      ) : !a.hasEntry ? (
        <p className="notice">요청 시작점을 지정해 주세요.</p>
      ) : (
        <p className="help">
          {a.latency !== null &&
          flow.latencyTarget !== null &&
          a.latency > flow.latencyTarget
            ? "기본 지연이 응답 목표를 넘습니다. "
            : ""}
          {a.availability !== null &&
          flow.availabilityTarget !== null &&
          a.availability < flow.availabilityTarget
            ? "직렬 가용성이 목표에 못 미칩니다. "
            : ""}
          처리·연결 지연의 가장 긴 동기 경로입니다. 대기·전송 시간은 제외합니다.
        </p>
      )}
      <details>
        <summary>계산 가정과 경로</summary>
        <p>
          지연 경로:{" "}
          {a.criticalPath
            .map((id) => graph.nodes.find((n) => n.id === id)?.data.name)
            .join(" → ") || "미지정"}
        </p>
        <p>
          동기 의존성은 병렬 분기 중 가장 긴 경로로 계산합니다. 필수 요소
          가용성은 독립 고장 가정으로 곱하며 공통 장애·우회·복제본 효과는 자동
          추정하지 않습니다.
        </p>
        <p>
          비동기 작업의 최종 완료 신뢰성은 즉시 응답의 가용성과 별도입니다. 캐시
          미스 지연은 조건이 발생했을 때의 경로이며 가중 평균 p99가 아닙니다.
        </p>
      </details>
    </>
  );
}
