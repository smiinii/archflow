import { useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  catalog,
  catalogMap,
  catalogMappingText,
  getItem,
} from "../lib/catalog";
import {
  inspectImport,
  jsonFieldRange,
  unknownMappings,
  type ImportIssue,
} from "../lib/importing";
import {
  compareGraphs,
  layoutWarnings,
  readableLayout,
  sharedLayout,
} from "../lib/readability";
import { type Graph } from "../lib/model";
import { TechIcon } from "./Icons";
import { GraphPreview } from "./GraphPreview";
import { Modal } from "./Modal";
export function AiStructureDialog({
  close,
  apply,
  base,
}: {
  close: () => void;
  apply: (g: Graph) => void;
  base: Graph;
}) {
  const [text, setText] = useState(""),
    [parsed, setParsed] = useState<Graph | null>(null),
    [issues, setIssues] = useState<ImportIssue[]>([]),
    [unsupported, setUnsupported] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [layout, setLayout] = useState<Graph | null>(null),
    [previousLayout, setPreviousLayout] = useState<Graph | null>(null),
    [flowId, setFlowId] = useState<string | null>(null),
    [compare, setCompare] = useState(false),
    [aligned, setAligned] = useState(true),
    [copied, setCopied] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);
  const warnings = useMemo(
    () => (parsed ? layoutWarnings(parsed) : []),
    [parsed],
  );
  const unknown = parsed ? unknownMappings(parsed) : [];
  const changes = useMemo(
    () => (parsed ? compareGraphs(base, parsed) : []),
    [base, parsed],
  );
  function validate() {
    const result = inspectImport(text);
    setParsed(result.graph);
    setIssues(result.issues);
    setUnsupported(result.unsupported);
    setAck(false);
    setPreviousLayout(null);
    setLayout(null);
    setFlowId(null);
  }
  function locate(issue: ImportIssue) {
    const range = jsonFieldRange(text, issue.path);
    input.current?.focus();
    input.current?.setSelectionRange(...range);
    const line = text.slice(0, range[0]).split("\n").length;
    if (input.current) input.current.scrollTop = Math.max(0, (line - 4) * 18);
  }
  const blocked = !parsed
    ? issues.length
      ? `수정할 항목 ${issues.length}개가 남았습니다.`
      : "먼저 형식 검증이 필요합니다."
    : unknown.length
      ? `기술 매핑 ${unknown.length}개를 선택해 주세요.`
      : unsupported.length && !ack
        ? "지원하지 않는 필드를 제외할지 확인해 주세요."
        : layout
          ? "배치 미리보기를 적용하거나 취소해 주세요."
          : "";
  return (
    <Modal title="AI 구조 검토·적용" close={close} wide>
      <p className="help">
        현재 구조를 보존하고 새 프로젝트에 적용합니다. 입력한 좌표·크기·소속
        그룹은 배치를 직접 적용할 때만 바뀝니다.
      </p>
      <textarea
        ref={input}
        className="json-box"
        aria-label="AI 결과 JSON"
        placeholder="AI가 작성한 구조 JSON을 붙여 넣으세요."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParsed(null);
          setIssues([]);
          setPreviousLayout(null);
          setLayout(null);
        }}
      />
      {!!issues.length && (
        <div className="validation-error" role="alert">
          <strong>수정할 항목 {issues.length}개</strong>
          {issues.map((issue, i) => (
            <button key={i} onClick={() => locate(issue)}>
              {issue.message}
              <small>{issue.path.join(".")} · JSON 위치로 이동</small>
            </button>
          ))}
        </div>
      )}
      <div className="button-row">
        <button className="outline" onClick={validate}>
          형식 검증·미리보기
        </button>
        <button
          className="primary"
          disabled={!!blocked}
          onClick={() => parsed && apply(parsed)}
        >
          검토한 구조 적용
        </button>
        <span className="help" role="status">
          {blocked || "검증 완료 · 새 사본으로 추가됩니다."}
        </span>
      </div>
      {!!unsupported.length && (
        <div className="notice">
          <strong>지원하지 않는 필드</strong>
          <p>{unsupported.join(", ")}</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            이 필드는 저장되지 않는 것을 확인했습니다. 기본 기술 디자인을
            사용합니다.
          </label>
        </div>
      )}
      {parsed && (
        <>
          <h3>
            <Check size={16} /> {parsed.nodes.length}개 요소·그룹 ·{" "}
            {parsed.edges.length}개 연결 · {parsed.flows.length}개 요청
          </h3>
          <details
            open={mappingOpen || unknown.length > 0}
            onToggle={(e) => setMappingOpen(e.currentTarget.open)}
          >
            <summary>
              기술 디자인 연결 ·{" "}
              {unknown.length ? `${unknown.length}개 확인 필요` : "매핑 완료"}
            </summary>
            <p className="help">
              역할 이름을 바꿔도 기술 아이콘은 유지됩니다. custom은 사용자 정의
              기본 디자인입니다. data.style의 배경·글씨·로고 설정을 지원하며
              임의의 CSS·아이콘 URL은 지원하지 않습니다.
            </p>
            <datalist id="catalog-id-options">
              {catalog.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </datalist>
            <div className="mapping-list">
              {parsed.nodes
                .filter((n) => n.type === "component")
                .map((n) => (
                  <div className="mapping-row" key={n.id}>
                    <TechIcon
                      id={n.data.catalogId}
                      onUnavailable={() =>
                        setUnavailable((ids) =>
                          ids.includes(n.data.catalogId)
                            ? ids
                            : [...ids, n.data.catalogId],
                        )
                      }
                    />
                    <div>
                      <strong>{n.data.name}</strong>
                      <small>
                        {catalogMap.has(n.data.catalogId)
                          ? getItem(n.data.catalogId).title
                          : "알 수 없는 기술"}{" "}
                        ·{" "}
                        {unavailable.includes(n.data.catalogId)
                          ? "아이콘 로드 실패 · 네트워크/기술 확인"
                          : n.data.catalogId === "custom"
                            ? "명시적 사용자 정의"
                            : catalogMap.has(n.data.catalogId)
                              ? "연결됨"
                              : "교체 필요"}
                      </small>
                    </div>
                    <input
                      aria-label={n.data.name + " 기술 ID"}
                      list="catalog-id-options"
                      value={n.data.catalogId}
                      onChange={(e) =>
                        setParsed({
                          ...parsed,
                          nodes: parsed.nodes.map((x) =>
                            x.id === n.id
                              ? {
                                  ...x,
                                  data: {
                                    ...x.data,
                                    catalogId: e.target.value,
                                  },
                                }
                              : x,
                          ),
                        })
                      }
                    />
                    {n.data.catalogId === "generic-external" &&
                      /fcm|firebase|slack/i.test(
                        n.data.name + " " + n.data.note,
                      ) && (
                        <button
                          className="outline"
                          onClick={() =>
                            setParsed({
                              ...parsed,
                              nodes: parsed.nodes.map((x) =>
                                x.id === n.id
                                  ? {
                                      ...x,
                                      data: {
                                        ...x.data,
                                        catalogId: /slack/i.test(n.data.name)
                                          ? "tech-slack"
                                          : "tech-fcm",
                                      },
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          전용 디자인 연결
                        </button>
                      )}
                  </div>
                ))}
            </div>
          </details>
          <details>
            <summary>전달·의존 연결 검토</summary>
            <p className="help">
              실제 요청 전달과 DB 상태 확인을 구분하세요. 목적을 바꾸면 표시와
              계산이 함께 바뀝니다. 실행 순서나 독립 장애를 자동 추정하지
              않습니다.
            </p>
            <div className="mapping-list">
              {parsed.edges.map((e) => (
                <div className="mapping-row" key={e.id}>
                  <div>
                    <strong>{e.data.label || e.id}</strong>
                    <small>
                      {parsed.nodes.find((n) => n.id === e.source)?.data.name} →{" "}
                      {parsed.nodes.find((n) => n.id === e.target)?.data.name}
                    </small>
                  </div>
                  <select
                    aria-label={(e.data.label || e.id) + " 연결 목적"}
                    value={e.data.purpose || "delivery"}
                    onChange={(event) =>
                      setParsed({
                        ...parsed,
                        edges: parsed.edges.map((x) =>
                          x.id === e.id
                            ? {
                                ...x,
                                data: {
                                  ...x.data,
                                  purpose: event.target.value as
                                    "delivery" | "dependency",
                                },
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="delivery">주 전달 경로</option>
                    <option value="dependency">상태 확인·의존 연결</option>
                  </select>
                </div>
              ))}
            </div>
          </details>
          <p className="help">
            대수·호출 수 1, 적중률 0은 입력 기본값일 수 있습니다. 미확인
            근거에서는 성능·가용성 결론을 계산하지 않습니다. PostgreSQL 여러
            카드는 논리 데이터 영역일 수 있으므로 그룹·메모를 확인하세요.
          </p>
          <div className="preview-controls">
            <label>
              미리볼 흐름{" "}
              <select
                aria-label="가져오기 흐름 미리보기"
                value={flowId || ""}
                onChange={(e) => setFlowId(e.target.value || null)}
              >
                <option value="">전체 구조</option>
                {parsed.flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="outline"
              onClick={() => setLayout(readableLayout(parsed))}
            >
              읽기 쉬운 배치 미리보기
            </button>
            {previousLayout && (
              <button
                className="outline"
                onClick={() => {
                  setParsed({
                    ...parsed,
                    nodes: parsed.nodes.map((n) => {
                      const old = previousLayout.nodes.find(
                        (x) => x.id === n.id,
                      );
                      return old
                        ? {
                            ...n,
                            position: old.position,
                            width: old.width,
                            height: old.height,
                          }
                        : n;
                    }),
                  });
                  setPreviousLayout(null);
                  setLayout(null);
                }}
              >
                이전 배치로 되돌리기
              </button>
            )}
          </div>
          {!!warnings.length && (
            <details>
              <summary>배치 확인 {warnings.length}건 · 원본 유지</summary>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {layout && (
            <div className="notice">
              <strong>배치 변경 미리보기</strong>
              <p>
                고정하지 않은 카드를 200×140으로 정리하고 주 흐름을 좌우로
                배치합니다. 위치 고정 요소와 그 그룹은 유지하며 적용 전 원본은
                바꾸지 않습니다.
              </p>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => {
                    setPreviousLayout(parsed);
                    setParsed(layout);
                    setLayout(null);
                  }}
                >
                  이 배치 적용
                </button>
                <button className="outline" onClick={() => setLayout(null)}>
                  배치 변경 취소
                </button>
              </div>
            </div>
          )}
          <GraphPreview
            key={layout ? "layout" : "original"}
            graph={layout || parsed}
            flowId={flowId}
          />
          <details
            open={compare}
            onToggle={(e) => setCompare(e.currentTarget.open)}
          >
            <summary>현재 프로젝트와 비교 · {changes.length}개 차이</summary>
            <label className="check-row">
              <input
                type="checkbox"
                checked={aligned}
                onChange={(e) => setAligned(e.target.checked)}
              />
              같은 ID의 이름·크기·절대 위치를 맞춰 비교 (보기만 변경)
            </label>
            <p className="help">
              초록: 추가 · 주황: 변경 · 빨강: 삭제. 그룹 변경은 동일 JVM과 별도
              실행 단위의 차이를 나타냅니다. 숫자상 독립 장애를 뜻하지 않습니다.
            </p>
            {compare && (
              <>
                <h3>현재 구조 · 삭제·변경 확인</h3>
                <GraphPreview
                  graph={base}
                  changes={changes.map((c) =>
                    c.kinds.includes("추가") ? { ...c, kinds: [] } : c,
                  )}
                />
                <h3>가져올 구조 · 추가·변경 확인</h3>
                <GraphPreview
                  graph={aligned ? sharedLayout(base, parsed) : parsed}
                  changes={changes}
                />
              </>
            )}
            <ul className="comparison-list">
              {changes.map((c) => (
                <li key={c.scope + c.id}>
                  <strong>{c.name}</strong>
                  <span>{c.kinds.join(" · ")}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <details>
        <summary>AI에 전달할 실제 catalogId 목록</summary>
        <p className="help">
          ID를 추측하지 않도록 아래 매핑을 AI에 함께 전달하세요.
        </p>
        <button
          className="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(catalogMappingText());
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={14} />
          {copied ? "복사했습니다" : "기술 ID 전체 복사"}
        </button>
        <textarea
          aria-label="지원 기술 ID 목록"
          readOnly
          className="catalog-map-box"
          value={catalogMappingText()}
        />
      </details>
    </Modal>
  );
}
