import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "../globals.css";

export const metadata: Metadata = {
  title: "Mobile — Multi-Agent Code Studio",
  robots: "noindex",
};

export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script dangerouslySetInnerHTML={{ __html: `
(function() {
  try {
    var t = localStorage.getItem('code-studio-theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.setAttribute('data-theme', 'dark');
  } catch(e) {}
})();` }} />
      </head>
      <body style={{ background: "var(--bg-app)", color: "var(--text-primary)", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "var(--bg-app)", color: "var(--text-secondary)" }}>Загрузка...</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}