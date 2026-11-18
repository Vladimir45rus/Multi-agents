"use client";

import { useState } from "react";

type Step = { id: string; title: string; body: string; action?: string };

// "Как начать": a short, always-available checklist. Shown as a card on the
// empty-project screen and reachable from the header (🎓). No marketing copy —
// only the four things a new user actually has to click.
export function QuickStart({
  locale,
  hasKey,
  hasFolder,
  hasFiles,
  onOpenSettings,
  onPickFolder,
  onOpenPreset,
  onAskAgents,
}: {
  locale: "ru" | "en";
  hasKey: boolean;
  hasFolder: boolean;
  hasFiles: boolean;
  onOpenSettings: () => void;
  onPickFolder: () => void;
  onOpenPreset: () => void;
  onAskAgents: () => void;
}) {
  const ru = locale === "ru";
  const [done, setDone] = useState<Record<string, boolean>>({});

  const steps: Step[] = [
    {
      id: "key",
      title: ru ? "Вставьте свой ключ" : "Add your own key",
      body: ru
        ? "Настройки → Модели и ключи. Ключ хранится только на этом компьютере, в зашифрованном виде. Бесплатный ключ OpenRouter — по ссылке в том же окне."
        : "Settings → Models and keys. The key stays on this machine, encrypted. A free OpenRouter key is one click away in the same window.",
      action: ru ? "Открыть ключи" : "Open keys",
    },
    {
      id: "folder",
      title: ru ? "Выберите папку проекта" : "Pick a project folder",
      body: ru
        ? "Кнопка «📂 Проект» в шапке или «Настройки → Проект». Новая пустая папка тоже подойдёт."
        : "The 📂 Project button in the header, or Settings → Project. An empty folder works too.",
      action: ru ? "Выбрать папку" : "Pick a folder",
    },
    {
      id: "start",
      title: ru ? "Создайте стартовый проект" : "Create a starter project",
      body: ru
        ? "«📂 Проект → Новый из пресета»: веб, мобильное или десктоп — появятся файлы, и превью запустится само."
        : "📂 Project → New from preset: web, mobile or desktop. Files appear and the preview starts by itself.",
      action: ru ? "Новый из пресета" : "New from preset",
    },
    {
      id: "ask",
      title: ru ? "Опишите задачу команде" : "Describe the task to the team",
      body: ru
        ? "В чате «Главный» напишите, что нужно. Ctrl+K — палитра команд. 🎬 Заседание — как команда спорила. Вкладка «Состояние» — кто онлайн и что изменено."
        : "In the Lead chat, describe what you need. Ctrl+K opens the command palette. 🎬 Meeting shows the argument. The State tab shows who is online and what changed.",
      action: ru ? "К чату" : "Go to chat",
    },
  ];

  const actions: Record<string, () => void> = {
    key: onOpenSettings,
    folder: onPickFolder,
    start: onOpenPreset,
    ask: onAskAgents,
  };
  const status: Record<string, boolean> = { key: hasKey, folder: hasFolder, start: hasFiles, ask: Object.keys(done).includes("ask") };

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{ru ? "Как начать — 4 шага" : "Get started in 4 steps"}</h3>
        <span className="text-[10px] text-[var(--text-muted)]">
          {ru ? "выполнено" : "done"}: {Object.values(status).filter(Boolean).length}/4
        </span>
      </div>
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const ready = status[step.id];
          return (
            <li key={step.id} className={"rounded-xl border p-2.5 " + (ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-[var(--border-default)] bg-[var(--bg-panel-alt)]")}>
              <div className="flex items-start gap-2">
                <span className={"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " + (ready ? "bg-emerald-600 text-white" : "bg-[#1b2c4a] text-white")}>
                  {ready ? "✓" : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{step.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { actions[step.id]?.(); setDone((prev) => ({ ...prev, [step.id]: true })); }}
                  className="shrink-0 rounded-lg border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400 hover:text-white"
                >
                  {step.action}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
