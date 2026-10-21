import { useState } from "react";
import { ArrowRight, Link2, X } from "lucide-react";
import type { Connection } from "@xyflow/react";
import { getItem } from "../lib/catalog";
import type { Graph, Link } from "../lib/model";

export function ConnectionBuilder(p: {
  graph: Graph;
  source: string | null;
  kind: Link["data"]["kind"];
  setSource: (id: string | null) => void;
  setKind: (kind: Link["data"]["kind"]) => void;
  connect: (connection: Connection) => void;
  close: () => void;
}) {
  const [target, setTarget] = useState("");
  const nodes = p.graph.nodes.filter((n) => n.type === "component");
  const validTarget =
    target !== p.source && nodes.some((n) => n.id === target) ? target : "";
  const structural = [p.source, validTarget].some((id) => {
    const n = nodes.find((n) => n.id === id);
    return n && getItem(n.data.catalogId).structural;
  });
  return (
    <section className="connection-builder" aria-label="새 연결 만들기">
      <div className="connection-builder-heading">
        <strong>
          <Link2 size={15} />
          연결 만들기
        </strong>
        <span>출발과 도착을 고르거나, 캔버스에서 차례로 클릭하세요.</span>
        <button
          aria-label="연결 마치기"
          title="연결 마치기 · Esc"
          onClick={p.close}
        >
          <X size={16} />
        </button>
      </div>
      <div className="connection-builder-fields">
        <label>
          <span>출발</span>
          <select
            aria-label="연결 출발 요소"
            value={p.source || ""}
            onChange={(e) => p.setSource(e.target.value || null)}
          >
            <option value="">출발 요소 선택</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.data.name}
              </option>
            ))}
          </select>
        </label>
        <ArrowRight size={17} className="connection-direction" />
        <label>
          <span>도착</span>
          <select
            aria-label="연결 도착 요소"
            value={validTarget}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">도착 요소 선택</option>
            {nodes
              .filter((n) => n.id !== p.source)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data.name}
                </option>
              ))}
          </select>
        </label>
        <div className="connection-kind" role="group" aria-label="새 연결 방식">
          <button
            aria-pressed={p.kind === "sync"}
            onClick={() => p.setKind("sync")}
          >
            <i className="line-swatch sync" />
            동기<small>응답을 기다림</small>
          </button>
          <button
            aria-pressed={p.kind === "async"}
            onClick={() => p.setKind("async")}
          >
            <i className="line-swatch async" />
            비동기<small>완료를 기다리지 않음</small>
          </button>
          <button
            aria-pressed={p.kind === "relation"}
            onClick={() => p.setKind("relation")}
          >
            <i className="line-swatch relation" />
            구성 관계
          </button>
        </div>
        <button
          className="primary"
          disabled={!p.source || !validTarget}
          onClick={() =>
            p.connect({
              source: p.source!,
              target: validTarget,
              sourceHandle: null,
              targetHandle: null,
            })
          }
        >
          <Link2 size={15} />
          연결 추가
        </button>
      </div>
      <p className="connection-hint">
        {structural
          ? "Docker·배포 도구 등은 구성 관계로 연결됩니다."
          : "동기 = 실선 · 비동기 = 점선"}{" "}
        · 출발은 유지되므로 여러 도착 요소에 이어서 연결할 수 있습니다.
      </p>
    </section>
  );
}
