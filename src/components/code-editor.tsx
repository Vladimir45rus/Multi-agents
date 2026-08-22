"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";

type MonacoEditorType = ComponentType<Record<string, unknown>>;

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default as MonacoEditorType), {
  ssr: false,
  loading: () => <div className="flex min-h-0 flex-1 items-center justify-center text-xs" style={{ background: "var(--bg-app)", color: "var(--text-secondary)" }}>Loading editor...</div>,
}) as MonacoEditorType;

function languageFromPath(filePath: string): string {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", scss: "scss", html: "html", htm: "html",
    md: "markdown", py: "python", rs: "rust", go: "go", java: "java",
    yml: "yaml", yaml: "yaml", xml: "xml", sql: "sql", sh: "shell",
    bash: "shell", env: "plaintext", gitignore: "plaintext", dockerfile: "dockerfile",
    c: "c", cpp: "cpp", h: "c", rb: "ruby", php: "php", swift: "swift",
    kt: "kotlin", dart: "dart", lua: "lua", r: "r", toml: "toml",
  };
  return map[ext] ?? "plaintext";
}

function getCurrentTheme(): "codebuff-dark" | "codebuff-light" {
  if (typeof document === "undefined") return "codebuff-dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "codebuff-light" : "codebuff-dark";
}

export default function CodeEditor({ filePath, value, onChange, onSave, readOnly }: {
  filePath: string; value: string; onChange: (v: string) => void; onSave?: () => void; readOnly?: boolean;
}) {
  const [editorTheme, setEditorTheme] = useState<"codebuff-dark" | "codebuff-light">(getCurrentTheme);

  // Observe external theme changes (DOM mutation from ThemeToggle)
  useEffect(() => {
    const mo = new MutationObserver(() => setEditorTheme(getCurrentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  const handleMount = useCallback((ed: any, mon: any) => {
    mon.editor.defineTheme("codebuff-dark", {
      base: "vs-dark", inherit: true, rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.lineHighlightBackground": "#2a2d2e",
        "editor.selectionBackground": "#264f78",
      },
    });
    mon.editor.defineTheme("codebuff-light", {
      base: "vs", inherit: true, rules: [],
      colors: {
        "editor.background": "#fafafa",
        "editor.lineHighlightBackground": "#f0f0f0",
        "editor.selectionBackground": "#b3d4fc",
      },
    });
    if (onSave) ed.addCommand(mon.KeyMod.CtrlCmd | mon.KeyCode.KeyS, () => onSave());
  }, [onSave]);

  const language = languageFromPath(filePath);
  const options = useMemo(() => ({
    minimap: { enabled: false }, fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
    lineNumbers: "on" as const, renderWhitespace: "selection" as const,
    scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2,
    wordWrap: "off" as const, readOnly, padding: { top: 8 },
  }), [readOnly]);

  return (
    <div className="min-h-0 flex-1">
      <MonacoEditor height="100%" language={language} value={value} onChange={(v: string) => onChange(v ?? "")} theme={editorTheme} options={options} onMount={handleMount} />
    </div>
  );
}