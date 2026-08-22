"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentEvent,
  ConfirmationKind,
  OrchestratorMode,
  OrchestratorStep,
  OrchestratorStreamEvent,
  ReleaseReport,
} from "@/lib/orchestrator-types";
import { hasSseData, parseSseJson } from "@/lib/sse-json";

type UiLocale = "ru" | "en";

type OrchestratorPanelProps = {
  open: boolean;
  onClose: () => void;
  locale: UiLocale;
  activeFilePath?: string;
  activeFileContent?: string;
};

const dict = {
  ru: {
    title: "Оркестратор агентов",
    subtitle: "Замкнутый цикл: план → анализ → патч → проверки → авто-исправление → отчёт.",
    task: "Задача",
    taskPlaceholder: "Опишите задачу для команды агентов…",
    iterations: "Лимит итераций",
    mode: "Режим",
    autonomous: "Автономный",
    controlled: "Контролируемый",
    run: "Запустить",
    cancel: "Остановить",
    running: "Выполняется…",
    history: "Журнал событий",
    live: "Текущий запуск",
    noEvents: "Событий пока нет. Запустите задачу.",
    decision: "Итоговое решение",
    cancelled: "Остановлено",
    completed: "Завершено",
    error: "Ошибка",
    close: "Закрыть",
    agent: "Агент",
    role: "Роль",
    status: "Статус",
    proposal: "Предложение",
    arguments: "Аргументы",
    file: "Файл",
    iterationShort: "итер.",
    confirmTitle: "Требуется подтверждение",
    approve: "Подтвердить",
    deny: "Отклонить",
    report: "Финальный отчёт",
    changedFiles: "Изменённые файлы",
    noFiles: "Файлы не изменялись",
    checks: "Проверки",
    summary: "Итог",
    step: "Шаг цикла",
  },
  en: {
    title: "Agent Orchestrator",
    subtitle: "Closed loop: plan → analysis → patch → checks → auto-fix → report.",
    task: "Task",
    taskPlaceholder: "Describe the task for the agent team…",
    iterations: "Iteration limit",
    mode: "Mode",
    autonomous: "Autonomous",
    controlled: "Controlled",
    run: "Run",
    cancel: "Stop",
    running: "Running…",
    history: "Event log",
    live: "Current run",
    noEvents: "No events yet. Run a task.",
    decision: "Final decision",
    cancelled: "Stopped",
    completed: "Completed",
    error: "Error",
    close: "Close",
    agent: "Agent",
    role: "Role",
    status: "Status",
    proposal: "Proposal",
    arguments: "Arguments",
    file: "File",
    iterationShort: "iter.",
    confirmTitle: "Confirmation required",
    approve: "Approve",
    deny: "Deny",
    report: "Final report",
    changedFiles: "Changed files",
    noFiles: "No files changed",
    checks: "Checks",
    summary: "Summary",
    step: "Loop step",
  },
};

const EVENT_LABELS: Record<string, { ru: string; en: string }> = {
  TASK_CREATED: { ru: "Задача создана", en: "Task created" },
  PLAN_CREATED: { ru: "План создан", en: "Plan created" },
  ADVICE_POSTED: { ru: "Совет опубликован", en: "Advice posted" },
  CONFLICT_DETECTED: { ru: "Конфликт обнаружен", en: "Conflict detected" },
  DECISION_MADE: { ru: "Решение принято", en: "Decision made" },
  PATCH_PROPOSED: { ru: "Патч предложен", en: "Patch proposed" },
  PATCH_APPLIED: { ru: "Патч применён", en: "Patch applied" },
  TEST_STARTED: { ru: "Проверка запущена", en: "Test started" },
  TEST_FAILED: { ru: "Проверка провалена", en: "Test failed" },
  REVIEW_APPROVED: { ru: "Ревью одобрено", en: "Review approved" },
};

const STEP_ORDER: OrchestratorStep[] = ["planning", "analysis", "patch", "checks", "fix", "done"];

const STEP_LABELS: Record<OrchestratorStep, { ru: string; en: string }> = {
  planning: { ru: "Планирование", en: "Planning" },
  analysis: { ru: "Анализ", en: "Analysis" },
  patch: { ru: "Patch", en: "Patch" },
  checks: { ru: "Проверки", en: "Checks" },
  fix: { ru: "Исправление", en: "Fix" },
  done: { ru: "Готово", en: "Done" },
};

function eventLabel(type: string, locale: UiLocale) {
  const entry = EVENT_LABELS[type];
  if (!entry) return type;
  return locale === "en" ? entry.en : entry.ru;
}

function stepLabel(step: OrchestratorStep, locale: UiLocale) {
  const entry = STEP_LABELS[step];
  return locale === "en" ? entry.en : entry.ru;
}

function roleLabel(role: string, locale: UiLocale) {
  const labels: Record<string, string> = {
    main: locale === "ru" ? "Главный" : "Lead",
    architect: locale === "ru" ? "Архитектор" : "Architect",
    reviewer: locale === "ru" ? "Ревьюер" : "Reviewer",
    tester: locale === "ru" ? "Тестировщик" : "Tester",
    security: locale === "ru" ? "Секурити" : "Security",
    advisor: locale === "ru" ? "Советник" : "Advisor",
    observer: locale === "ru" ? "Наблюдатель" : "Observer",
    orchestrator: locale === "ru" ? "Оркестратор" : "Orchestrator",
  };
  return labels[role] ?? role;
}

function statusLabel(status: string, locale: UiLocale) {
  const labels: Record<string, string> = {
    open: locale === "ru" ? "открыт" : "open",
    accepted: locale === "ru" ? "принят" : "accepted",
    rejected: locale === "ru" ? "отклонён" : "rejected",
    resolved: locale === "ru" ? "решён" : "resolved",
  };
  return labels[status] ?? status;
}

export function OrchestratorPanel({ open, onClose, locale, activeFilePath, activeFileContent }: OrchestratorPanelProps) {
  const t = dict[locale];

  const [task, setTask] = useState("");
  const [maxIterations, setMaxIterations] = useState(5);
  const [mode, setMode] = useState<OrchestratorMode>("autonomous");
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<AgentEvent[]>([]);
  const [statusText, setStatusText] = useState("");
  const [decision, setDecision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<OrchestratorStep | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    kind: ConfirmationKind;
    prompt: string;
  } | null>(null);
  const [report, setReport] = useState<ReleaseReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const [eventsRes, reportsRes] = await Promise.all([
        fetch("/api/orchestrate/events?limit=60", { cache: "no-store" }),
        fetch("/api/orchestrate/reports?limit=1", { cache: "no-store" }),
      ]);
      if (eventsRes.ok) {
        const payload = (await eventsRes.json()) as { events?: AgentEvent[] };
        setHistoryEvents(payload.events ?? []);
      }
      if (reportsRes.ok) {
        const payload = (await reportsRes.json()) as { reports?: ReleaseReport[] };
        if (payload.reports?.[0]) setReport(payload.reports[0]);
      }
    } catch {
      // History is best-effort.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleStreamEvent(event: OrchestratorStreamEvent) {
    if (event.type === "task_started") {
      setStatusText(`${t.running}`);
      setCurrentStep(null);
      return;
    }
    if (event.type === "event") {
      setLiveEvents((previous) => [...previous, event.event]);
      return;
    }
    if (event.type === "iteration") {
      setStatusText(`${t.iterations}: ${event.iteration}/${event.total}`);
      return;
    }
    if (event.type === "step") {
      setCurrentStep(event.step);
      return;
    }
    if (event.type === "agent_status") {
      if (event.status === "started") setStatusText(`${event.agent} (${roleLabel(event.role, locale)})…`);
      else if (event.status === "error") setStatusText(`${event.agent}: ${event.message ?? t.error}`);
      return;
    }
    if (event.type === "confirmation_request") {
      setPendingConfirmation({ confirmationId: event.confirmationId, kind: event.kind, prompt: event.prompt });
      return;
    }
    if (event.type === "report") {
      setReport(event.report);
      return;
    }
    if (event.type === "task_completed") {
      setDecision(event.decision);
      setStatusText(`${t.completed} (${event.iterations} ${t.iterationShort})`);
      return;
    }
    if (event.type === "cancelled") {
      setStatusText(t.cancelled);
      return;
    }
    if (event.type === "error") {
      setError(event.message);
    }
  }

  async function run() {
    if (!task.trim() || running) return;

    setRunning(true);
    setError(null);
    setDecision("");
    setReport(null);
    setLiveEvents([]);
    setCurrentStep(null);
    setPendingConfirmation(null);
    setStatusText(t.running);

    const nextTaskId = crypto.randomUUID();
    setTaskId(nextTaskId);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/orchestrate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ task, taskId: nextTaskId, maxIterations, mode, locale, projectContext: { activeFilePath, activeFileContent } }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Orchestrator request failed");
      }
      if (!res.body) throw new Error("Orchestrator stream is unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const consumeBlock = (block: string) => {
        if (!hasSseData(block)) return;

        const event = parseSseJson<OrchestratorStreamEvent>(block);
        if (!event) {
          setError(locale === "ru" ? "Получено некорректное событие от LLM" : "Received an invalid LLM stream event");
          return;
        }

        handleStreamEvent(event);
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let separator = buffer.search(/\r?\n\r?\n/);
        while (separator >= 0) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, "");
          consumeBlock(block);
          separator = buffer.search(/\r?\n\r?\n/);
        }

        if (done) break;
      }

      if (buffer.trim()) consumeBlock(buffer);
      void loadHistory();
    } catch (streamError) {
      if (!controller.signal.aborted) {
        setError(streamError instanceof Error ? streamError.message : "Orchestrator error");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  async function cancel() {
    if (taskId) {
      try {
        await fetch("/api/orchestrate/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
      } catch {
        // Ignore cancel endpoint errors; we abort locally regardless.
      }
    }
    abortRef.current?.abort();
  }

  async function confirm(approved: boolean) {
    if (!pendingConfirmation) return;
    const confirmation = pendingConfirmation;
    setPendingConfirmation(null);
    try {
      await fetch("/api/orchestrate/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationId: confirmation.confirmationId, approved }),
      });
    } catch {
      // If the confirm call failed, restore the prompt so the user can retry.
      setPendingConfirmation(confirmation);
    }
  }

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label={t.close} />

      <article className="relative z-10 flex h-[88%] w-[92%] max-w-[980px] flex-col rounded-xl border border-[#3a3d41] bg-[#1e1e1e] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <header className="flex items-center justify-between border-b border-[#2d2d30] px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-white">{t.title}</h2>
            <p className="text-[11px] text-[#9da3b2]">{t.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded bg-[#3a3d41] px-2 py-1 text-xs hover:bg-[#4b4e54]">
            {t.close}
          </button>
        </header>

        <section className="border-b border-[#2d2d30] p-4">
          <label className="mb-1 block text-[11px] text-[#9da3b2]">{t.task}</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={t.taskPlaceholder}
            disabled={running}
            className="mb-2 min-h-16 w-full rounded border border-[#3a3d41] bg-[#252526] px-2 py-1 text-xs outline-none disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-[#c6ced8]">
              {t.iterations}
              <select
                value={maxIterations}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                disabled={running}
                className="rounded border border-[#3a3d41] bg-[#252526] px-2 py-1 text-xs"
              >
                {[5, 6, 7, 8, 9, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-[#c6ced8]">
              {t.mode}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OrchestratorMode)}
                disabled={running}
                className="rounded border border-[#3a3d41] bg-[#252526] px-2 py-1 text-xs"
              >
                <option value="autonomous">{t.autonomous}</option>
                <option value="controlled">{t.controlled}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void run()}
              disabled={running || !task.trim()}
              className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white disabled:opacity-60"
            >
              {t.run}
            </button>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={!running}
              className="rounded bg-[#a12828] px-3 py-1 text-xs text-white disabled:opacity-60"
            >
              {t.cancel}
            </button>
            {statusText ? <span className="text-xs text-[#4fc1ff]">{statusText}</span> : null}
            {error ? <span className="text-xs text-[#f48771]">{error}</span> : null}
          </div>

          {currentStep ? (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-[#9da3b2]">{t.step}</p>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {STEP_ORDER.map((step, index) => (
                  <div key={step} className="flex items-center gap-1">
                    {index > 0 ? <span className="text-[#5a5d63]">➔</span> : null}
                    <span
                      className={`rounded px-2 py-0.5 ${
                        step === currentStep
                          ? "bg-[#007acc] text-white"
                          : "bg-[#2d2d30] text-[#9da3b2]"
                      }`}
                    >
                      {stepLabel(step, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {pendingConfirmation ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-amber-300">{t.confirmTitle}</p>
                <p className="whitespace-pre-wrap text-xs text-[#c6ced8]">{pendingConfirmation.prompt}</p>
              </div>
              <button type="button" onClick={() => void confirm(true)} className="rounded bg-[#0e639c] px-3 py-1 text-xs text-white">
                {t.approve}
              </button>
              <button type="button" onClick={() => void confirm(false)} className="rounded bg-[#3a3d41] px-3 py-1 text-xs text-white">
                {t.deny}
              </button>
            </div>
          ) : null}
        </section>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {report ? <ReportView report={report} locale={locale} /> : null}

          {decision && !report ? (
            <section className="mb-4 rounded border border-[#007acc] bg-[#252526] p-3">
              <h3 className="mb-2 text-xs font-bold uppercase text-[#4fc1ff]">{t.decision}</h3>
              <p className="whitespace-pre-wrap text-xs text-[#d4d4d4]">{decision}</p>
            </section>
          ) : null}

          {liveEvents.length > 0 ? (
            <section className="mb-4">
              <h3 className="mb-2 text-xs font-bold uppercase text-[#9da3b2]">{t.live}</h3>
              <EventList events={liveEvents} locale={locale} />
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase text-[#9da3b2]">{t.history}</h3>
            {historyEvents.length === 0 && liveEvents.length === 0 ? (
              <p className="text-xs text-[#9da3b2]">{t.noEvents}</p>
            ) : (
              <EventList events={historyEvents} locale={locale} />
            )}
          </section>
        </div>
      </article>
    </div>
  );
}

function ReportView({ report, locale }: { report: ReleaseReport; locale: UiLocale }) {
  const t = dict[locale];
  const ready = report.status === "RELEASE_READY";

  return (
    <section className="mb-4 rounded border border-[#3a3d41] bg-[#252526] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold uppercase text-[#9da3b2]">{t.report}</h3>
        <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ready ? "bg-green-700/30 text-green-300" : "bg-red-800/40 text-red-300"}`}>
          {report.status}
        </span>
        <span className="text-[11px] text-[#9da3b2]">
          {t.iterationShort} {report.iterations} · {new Date(report.createdAt).toLocaleTimeString(locale)}
        </span>
      </div>

      <p className="mb-2 whitespace-pre-wrap text-xs text-[#d4d4d4]">
        {t.summary}: {report.summary}
      </p>

      <div className="mb-2">
        <p className="mb-1 text-[11px] font-semibold text-[#9da3b2]">{t.changedFiles}</p>
        {report.changedFiles.length === 0 ? (
          <p className="text-[11px] text-[#9da3b2]">{t.noFiles}</p>
        ) : (
          <ul className="space-y-0.5">
            {report.changedFiles.map((file) => (
              <li key={file} className="font-mono text-[11px] text-[#4fc1ff]">
                {file}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-[#9da3b2]">{t.checks}</p>
        {report.checkResults.length === 0 ? (
          <p className="text-[11px] text-[#9da3b2]">—</p>
        ) : (
          <div className="space-y-1">
            {report.checkResults.map((result) => (
              <div key={`${result.name}-${result.command}`} className="rounded border border-[#3a3d41] bg-[#1e1e1e] p-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      result.status === "success"
                        ? "bg-green-700/30 text-green-300"
                        : result.status === "failed"
                          ? "bg-red-800/40 text-red-300"
                          : "bg-[#2d2d30] text-[#9da3b2]"
                    }`}
                  >
                    {result.status}
                  </span>
                  <span className="text-xs font-semibold text-white">{result.name}</span>
                  <span className="font-mono text-[11px] text-[#9da3b2]">{result.command}</span>
                </div>
                {result.output ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-[#9da3b2]">output</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-[#c6ced8]">{result.output}</pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EventList({ events, locale }: { events: AgentEvent[]; locale: UiLocale }) {
  const t = dict[locale];

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <article key={event.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold text-[#4fc1ff]">{eventLabel(event.type, locale)}</span>
            <span className="text-[#9da3b2]">
              {event.agent} · {roleLabel(event.role, locale)}
            </span>
            <span className="rounded bg-[#2d2d30] px-1 text-[10px] text-[#9da3b2]">{statusLabel(event.status, locale)}</span>
            <span className="text-[#9da3b2]">
              {t.iterationShort} {event.iteration}
            </span>
            <span className="ml-auto text-[#9da3b2]">{new Date(event.createdAt).toLocaleTimeString(locale)}</span>
          </div>
          {event.filePath ? (
            <p className="mb-1 text-[11px] text-[#9da3b2]">
              {t.file}: {event.filePath}
              {event.line ? `:${event.line}` : ""}
            </p>
          ) : null}
          {event.proposal ? (
            <p className="whitespace-pre-wrap text-xs text-[#d4d4d4]">
              {t.proposal}: {event.proposal}
            </p>
          ) : null}
          {event.arguments && event.arguments !== event.proposal ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-[#9da3b2]">{t.arguments}</summary>
              <p className="mt-1 whitespace-pre-wrap text-xs text-[#c6ced8]">{event.arguments}</p>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}
