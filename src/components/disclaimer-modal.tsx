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
          ⚠️ Multi-Agent Code Studio
        </h2>

        <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <p>
            Multi-Agent Code Studio использует сторонние AI-сервисы
            (OpenRouter, OpenAI и др.) через <strong>ВАШИ</strong> API-ключи.
            Вы самостоятельно управляете ключами, расходами и несёте
            ответственность за код, сгенерированный агентами.
          </p>

          <p>
            Агенты имеют доступ к файловой системе открытого проекта.
            Не запускайте приложение на чувствительных данных без
            предварительного резервного копирования.
          </p>

          <p>
            Сгенерированный код может содержать ошибки, уязвимости
            или неоптимальные решения. Всегда проверяйте результат.
          </p>

          <p>
            Это опенсорс-проект. Исходный код доступен на{" "}
            <a
              href="https://github.com/Vladimir45rus/Multi-agents"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text-link)" }}
              className="underline hover:opacity-80"
            >
              GitHub
            </a>.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="rounded px-5 py-2 text-sm font-medium text-white transition"
            style={{ background: "var(--bg-status)" }}
          >
            Ознакомлен, принимаю ✓
          </button>
        </div>
      </div>
    </div>
  );
}