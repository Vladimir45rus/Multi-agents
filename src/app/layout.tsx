import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-Agent Code Studio",
  description:
    "Веб-IDE в стиле Cursor/VS Code с мультиагентной архитектурой: главный кодер, советники, чат, терминал и анализ багов.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-[#1e1e1e] text-[#d4d4d4] antialiased">{children}</body>
    </html>
  );
}
