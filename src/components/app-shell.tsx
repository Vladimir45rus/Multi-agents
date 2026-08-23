"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { DisclaimerModal, useDisclaimerAccepted } from "@/components/disclaimer-modal";

export function AppShell({ children }: { children: ReactNode }) {
  const { accepted, hasMounted, accept } = useDisclaimerAccepted();

  return (
    <ErrorBoundary>
      <div id="root" className="flex h-screen w-screen min-h-0 min-w-0 flex-col overflow-hidden">
        {!hasMounted ? null : !accepted ? <DisclaimerModal onAccept={accept} /> : children}
      </div>
    </ErrorBoundary>
  );
}