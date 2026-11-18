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
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Prevent white flash: set theme before first paint */}
        <Script id="theme-init" strategy="beforeInteractive">
{`(function() {
  // The studio ships one theme: dark. The light palette was never applied to
  // every panel, so following the OS setting produced a half-white interface.
  try { document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) {}
})();`}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}