"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("code-studio-theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const synced = useRef(false);

  // One-shot DOM sync on mount (external system integration)
  useEffect(() => {
    if (!synced.current) {
      synced.current = true;
      document.documentElement.setAttribute("data-theme", getInitialTheme());
    }
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

/** Icon-only button for switching themes */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      className="inline-flex h-7 w-7 items-center justify-center rounded
                 text-sm hover:bg-white/10 focus:outline-none"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}