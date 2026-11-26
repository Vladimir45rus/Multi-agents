"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("code-studio-theme");
  return stored === "light" ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const first = window.setTimeout(() => {
      const next = readTheme();
      document.documentElement.setAttribute("data-theme", next);
      setTheme(next);
    }, 0);
    return () => window.clearTimeout(first);
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("code-studio-theme", next);
      return next;
    });
  };

  return { theme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel-alt)] px-2 text-xs hover:border-blue-400"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
