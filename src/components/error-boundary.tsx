"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <main className="flex h-screen flex-col items-center justify-center gap-4 bg-[#1e1e1e] text-[#d4d4d4]">
          <div className="rounded border border-[#f48771] bg-[#2a1f1f] p-6 text-center">
            <h1 className="mb-2 text-lg font-bold text-[#f48771]">⚠️ Критическая ошибка</h1>
            <pre className="mb-4 max-h-48 max-w-lg overflow-auto whitespace-pre-wrap rounded bg-[#111] p-3 text-xs text-[#d4d4d4]">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="rounded bg-[#0e639c] px-4 py-2 text-sm text-white hover:bg-[#1177bb]"
            >
              🔄 Перезагрузить приложение
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}