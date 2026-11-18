"use client";

// One theme: dark. The app hardcodes dark surfaces in many panels, so a light
// palette produced unreadable mixed screens. Kept as a module so imports stay.
export function useTheme() {
  return { theme: "dark" as const, toggle: () => undefined };
}

export function ThemeToggle() {
  return null;
}
