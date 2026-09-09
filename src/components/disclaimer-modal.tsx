"use client";

import { useEffect, useState } from "react";

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

function openLegal(path: string) {
  // In Electron, window.open spawns a child window — acceptable. In a browser,
  // a regular new tab opens.
  window.open(path, "_blank", "width=760,height=820");
}

export function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
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
        <div className="mb-6 max-h-60 space-y-3 overflow-y-auto pr-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <p>
            Приложение является полностью локальным инструментом (лицензия MIT). Все ваши API-ключи и данные проектов хранятся только на вашем ПК.
          </p>
          <p className="text-amber-400">
            ⚠️ <strong>Обратите внимание:</strong> Код и запросы передаются выбранным вами AI-провайдерам. Всегда проверяйте сгенерированный код перед запуском.
          </p>
        </div>
        <div className="mb-6 text-xs" style={{ color: "var(--text-secondary)" }}>
          Продолжая, вы принимаете{" "}
          <a
            href="/terms"
            onClick={(e) => { e.preventDefault(); openLegal("/terms"); }}
            className="text-blue-400 underline"
          >
            Пользовательское соглашение (EULA)
          </a>{" "}
          и{" "}
          <a
            href="/privacy"
            onClick={(e) => { e.preventDefault(); openLegal("/privacy"); }}
            className="text-blue-400 underline"
          >
            Политику конфиденциальности
          </a>.
        </div>
        <button
          onClick={onAccept}
          className="w-full rounded-lg bg-[#238636] py-2.5 font-semibold text-white transition hover:bg-[#2ea043]"
        >
          Я принимаю условия и согласен
        </button>
      </div>
    </div>
  );
}
