import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h1>화면을 열지 못했습니다.</h1>
        <p>
          저장된 초안은 지우지 않았습니다. 새로고침한 뒤 다시 시도해 주세요.
        </p>
        <button onClick={() => location.reload()}>다시 열기</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
