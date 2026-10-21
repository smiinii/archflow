// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import type { Graph } from "../src/lib/model";
import { sampleGraph } from "../src/lib/seed";
import { readingView } from "../src/lib/reading";
vi.mock("../src/lib/useWorkspace", async () => {
  const React = await import("react");
  const { initialWorkspace } = await import("../src/lib/seed");
  return {
    useWorkspace: () => {
      const [workspace, change] = React.useState(initialWorkspace);
      return {
        workspace,
        change,
        ready: true,
        user: null,
        status: "이 기기에 저장됨",
        error: "",
        conflict: null,
        sync: async () => {},
        mergeCloud: () => {},
      };
    },
  };
});
vi.mock("../src/components/Modal", () => ({
  Modal: ({
    title,
    children,
    close,
  }: {
    title: string;
    children: ReactNode;
    close: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      <button aria-label="창 닫기" onClick={close}>
        닫기
      </button>
      {children}
    </div>
  ),
}));
vi.mock("../src/components/Canvas", () => ({
  Canvas: (p: {
    graph: Graph;
    readingMode: "overview" | "function" | "all";
    readingFlows?: string[];
    expandedId?: string | null;
    readOnly?: boolean;
    preview?: boolean;
  }) => {
    const view = readingView(
      p.graph,
      p.readingMode,
      p.readingFlows || [],
      p.expandedId || null,
    ).graph;
    const geometry = JSON.stringify({
      nodes: view.nodes.map((n) => [n.id, n.position, n.width, n.height]),
      edges: view.edges.map((e) => [e.id, e.source, e.target]),
    });
    return (
      <div
        data-testid={p.preview ? "preview-canvas" : "main-canvas"}
        data-mode={p.readingMode}
        data-readonly={String(!!p.readOnly)}
        data-geometry={geometry}
      />
    );
  },
}));
import App from "../src/App";
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const purpose = (name: string) =>
  within(screen.getByRole("navigation", { name: "사용 목적" })).getByRole(
    "button",
    { name },
  );
const canvas = () => screen.getByTestId("main-canvas");
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
function openImport() {
  click("AI 인터뷰");
  click("AI가 만든 구조 적용");
  const g = sampleGraph();
  g.views = {
    features: [
      {
        id: "business-read",
        name: "사용자 조회",
        flowIds: ["read"],
        mainEdgeIds: ["e1", "e2", "e3", "e4"],
      },
    ],
  };
  fireEvent.change(screen.getByRole("textbox", { name: "AI 결과 JSON" }), {
    target: { value: JSON.stringify(g) },
  });
  click("형식 검증·미리보기");
}
describe("workspace purpose and preview transitions", () => {
  it("switches the actual canvas and editability when understand/design are pressed repeatedly", () => {
    render(<App />);
    expect(canvas().getAttribute("data-mode")).toBe("overview");
    for (let i = 0; i < 3; i++) {
      fireEvent.click(purpose("설계하기"));
      expect(canvas().getAttribute("data-mode")).toBe("all");
      expect(canvas().getAttribute("data-readonly")).toBe("false");
      fireEvent.click(purpose("이해하기"));
      expect(canvas().getAttribute("data-mode")).toBe("overview");
      expect(canvas().getAttribute("data-readonly")).toBe("true");
    }
    expect(purpose("이해하기").getAttribute("aria-pressed")).toBe("true");
  });
  it("opens the complete original and diagnosis when improve is selected from a single API", () => {
    render(<App />);
    click("기능 흐름");
    fireEvent.click(purpose("개선하기"));
    expect(canvas().getAttribute("data-mode")).toBe("all");
    expect(purpose("개선하기").getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("button", { name: "진단" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByText(/개선하기 · 문제 후보/)).toBeTruthy();
  });
  it("keeps a feature preview and its exact graph layout after importing into a new project", async () => {
    render(<App />);
    openImport();
    fireEvent.change(screen.getByRole("combobox", { name: "미리보기 기능" }), {
      target: { value: "business-read" },
    });
    const before = screen
      .getByTestId("preview-canvas")
      .getAttribute("data-geometry");
    expect(screen.getByTestId("preview-canvas").getAttribute("data-mode")).toBe(
      "function",
    );
    click("검토한 구조 적용");
    await waitFor(() =>
      expect(canvas().getAttribute("data-mode")).toBe("function"),
    );
    expect(canvas().getAttribute("data-geometry")).toBe(before);
    expect(purpose("이해하기").getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps the raw original preview and design purpose after import", async () => {
    render(<App />);
    openImport();
    click("원본 배치");
    const before = screen
      .getByTestId("preview-canvas")
      .getAttribute("data-geometry");
    click("검토한 구조 적용");
    await waitFor(() => expect(canvas().getAttribute("data-mode")).toBe("all"));
    expect(canvas().getAttribute("data-geometry")).toBe(before);
    expect(canvas().getAttribute("data-readonly")).toBe("false");
    expect(purpose("설계하기").getAttribute("aria-pressed")).toBe("true");
  });
  it("shows the same original layout after applying a layout preview from understand mode", async () => {
    render(<App />);
    click("배치 미리보기");
    const before = screen
      .getByTestId("preview-canvas")
      .getAttribute("data-geometry");
    click("이 배치 적용");
    await waitFor(() => expect(canvas().getAttribute("data-mode")).toBe("all"));
    expect(canvas().getAttribute("data-geometry")).toBe(before);
    expect(purpose("설계하기").getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps design mode when a new project is created instead of silently switching to summary", async () => {
    render(<App />);
    fireEvent.click(purpose("설계하기"));
    click("프로젝트 만들기");
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), {
      target: { value: "새 설계" },
    });
    click("만들기");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "새 설계" })).toHaveLength(
        2,
      ),
    );
    expect(canvas().getAttribute("data-mode")).toBe("all");
    expect(canvas().getAttribute("data-readonly")).toBe("false");
    expect(purpose("설계하기").getAttribute("aria-pressed")).toBe("true");
  });
  it("does not change the current purpose or graph when a different preview is cancelled", () => {
    render(<App />);
    const before = canvas().getAttribute("data-geometry");
    openImport();
    click("원본 배치");
    click("창 닫기");
    expect(canvas().getAttribute("data-geometry")).toBe(before);
    expect(canvas().getAttribute("data-mode")).toBe("overview");
    expect(purpose("이해하기").getAttribute("aria-pressed")).toBe("true");
  });
});
