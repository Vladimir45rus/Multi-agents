"use client";

import { useEffect, useState } from "react";
import { TERMS_MD, PRIVACY_MD } from "@/lib/legal-docs";

const STORAGE_KEY = "code-studio-disclaimer-accepted";

export function useDisclaimerAccepted() {
  const [hasMounted, setHasMounted] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAccepted(localStorage.getItem(STORAGE_KEY) === "true");
      setHasMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setAccepted(true);
  };

  return { accepted, hasMounted, accept };
}

type LegalDoc = "terms" | "privacy" | null;

// Offline-first: legal texts come from the embedded module, rendering stays
// inside THIS modal (a nested scrollable view with a Back button). No new
// windows, no external routes, no network.
function LegalDocView({ doc, onBack }: { doc: Exclude<LegalDoc, null>; onBack: () => void }) {
  const title = doc === "terms"
    ? "Пользовательское соглашение (EULA)"
    : "Политика конфиденциальности";
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold" style={{ color: "var(--text-accent)" }}>{title}</h3>
        <button
          type="button"
          onClick={onBack}
          className="rounded bg-[#3a3d41] px-3 py-1 text-xs text-white hover:bg-[#4b4e54]"
        >
          ← Назад
        </button>
      </div>
      <div className="mb-4 max-h-72 overflow-y-auto rounded border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
        <pre className="whitespace-pre-wrap font-sans">{doc === "terms" ? TERMS_MD : PRIVACY_MD}</pre>
      </div>
    </>
  );
}

export function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
  const [legalDoc, setLegalDoc] = useState<LegalDoc>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  if (legalDoc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div
          className="mx-4 w-full max-w-lg rounded-lg border p-6 shadow-2xl"
          style={{
            background: "var(--bg-panel)",
            borderColor: "var(--border-default)",
            color: "var(--text-primary)",
          }}
        >
          <LegalDocView doc={legalDoc} onBack={() => setLegalDoc(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-lg rounded-lg border p-6 shadow-2xl"
        style={{
          background: "var(--bg-panel)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
        }}
      >
        <h2 className="mb-3 text-lg font-bold" style={{ color: "var(--text-accent)" }}>
          Добро пожаловать в Multi-Agent Code Studio
        </h2>
        <div className="mb-4 max-h-52 space-y-3 overflow-y-auto pr-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <p>
            Приложение является полностью локальным инструментом (лицензия MIT). Все ваши API-ключи и данные проектов хранятся только на вашем ПК.
          </p>
          <p className="text-amber-400">
            ⚠️ <strong>Обратите внимание:</strong> Код и запросы передаются выбранным вами AI-провайдерам. Всегда проверяйте сгенерированный код перед запуском.
          </p>
        </div>

        <div className="mb-4 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>
            📄{" "}
            <button
              type="button"
              onClick={() => setLegalDoc("terms")}
              className="text-blue-400 underline hover:text-blue-300"
            >
              Пользовательское соглашение (EULA)
            </button>{" "}
            — прочитать здесь
          </p>
          <p>
            🔒{" "}
            <button
              type="button"
              onClick={() => setLegalDoc("privacy")}
              className="text-blue-400 underline hover:text-blue-300"
            >
              Политика конфиденциальности
            </button>{" "}
            — прочитать здесь
          </p>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2 rounded border p-2 text-xs" style={{ borderColor: acknowledged ? "var(--border-default)" : "#f59e0b80", background: acknowledged ? "transparent" : "rgba(245,158,11,0.06)" }}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            Я ознакомлен(а) с условиями, осознаю риски работы с AI и не имею претензий к разработчику
          </span>
        </label>

        <button
          onClick={onAccept}
          disabled={!acknowledged}
          className="w-full rounded-lg bg-[#238636] py-2.5 font-semibold text-white transition hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:bg-[#3a3d41] disabled:text-[#777]"
        >
          Я принимаю условия и согласен
        </button>
      </div>
    </div>
  );
}
