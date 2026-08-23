import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Multi-Agent Code Studio",
  description:
    "Веб-IDE с мультиагентной архитектурой: главный кодер, советники, чат, терминал и анализ багов.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Prevent white flash: set theme before first paint */}
        <Script id="theme-init" strategy="beforeInteractive">
{`(function() {
  try {
    var t = localStorage.getItem('code-studio-theme');
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch(e) {}
})();`}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}