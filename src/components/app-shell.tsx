"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { DisclaimerModal, useDisclaimerAccepted } from "@/components/disclaimer-modal";

export function AppShell({ children }: { children: ReactNode }) {
  const { accepted, accept } = useDisclaimerAccepted();

  return (
    <ErrorBoundary>
      {!accepted ? (
        <DisclaimerModal onAccept={accept} />
      ) : (
        <div id="root">
          {/* Loading fallback — prevents white flash during hydration */}
          <div id="app-loading" className="app-loading" aria-hidden />
          <script
            dangerouslySetInnerHTML={{
              __html: `try { document.getElementById('app-loading')?.remove(); } catch(e){}`,
            }}
          />
          {children}
        </div>
      )}
    </ErrorBoundary>
  );
}