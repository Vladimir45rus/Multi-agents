"use client";

// Right-column "Состояние" tab: a compact, glanceable status board instead of
// raw logs. Everything is read-only and derived from data the app already has.
export type StateAgent = {
  id: number;
  name: string;
  role: string;
  provider: string;
  model: string;
  color: string | null;
  isActive: boolean;
};

export type TeamStateProps = {
  locale: "ru" | "en";
  agents: StateAgent[];
  offlineNames: string[];
  decisionMode: string;
  teamMode: boolean;
  autoApprove: boolean;
  changedFiles: string[];
  blockers: number;
  lastCheck: string | null;
  lastUsage: string | null;
  telegramReady: boolean;
  onOpenSettings: () => void;
  onRollback: () => void;
  onMeeting: () => void;
};

const ROLE_LABEL: Record<string, [string, string]> = {
  main: ["Главный", "Lead"],
  advisor: ["Советник", "Advisor"],
  architect: ["Архитектор", "Architect"],
  reviewer: ["Ревьюер", "Reviewer"],
  tester: ["Тестирующий", "Tester"],
  uiux: ["UI/UX", "UI/UX"],
  security: ["Секурити", "Security"],
  skeptic: ["Фома неверующий", "Skeptic"],
  observer: ["Наблюдатель", "Observer"],
  auto: ["AUTO", "AUTO"],
};

function roleLabel(role: string, locale: "ru" | "en") {
  const pair = ROLE_LABEL[role];
  if (!pair) return role;
  return locale === "ru" ? pair[1 - 1] : pair[1];
}

function Card({ title, children, tone = "default" }: { title: string; children: React.ReactNode; tone?: "default" | "warn" | "good" }) {
  const border = tone === "warn" ? "border-amber-500/40" : tone === "good" ? "border-emerald-500/40" : "border-[var(--border-default)]";
  return (
    <section className={`rounded-xl border ${border} bg-[var(--bg-panel)] p-3`}>
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</h4>
      {children}
    </section>
  );
}

export function TeamState(props: TeamStateProps) {
  const { locale, agents, offlineNames, changedFiles, blockers } = props;
  const ru = locale === "ru";
  const offline = new Set(offlineNames);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{ru ? "Состояние команды" : "Team state"}</h3>
        <div className="flex gap-1">
          <button type="button" onClick={props.onMeeting} className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200 hover:border-amber-400">
            🎬 {ru ? "Заседание" : "Meeting"}
          </button>
          <button type="button" onClick={props.onOpenSettings} className="rounded border border-[var(--border-default)] px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:border-blue-400">
            ⚙ {ru ? "Настройки" : "Settings"}
          </button>
        </div>
      </div>

      <Card title={ru ? "Агенты" : "Agents"}>
        <ul className="space-y-1">
          {agents.map((agent) => {
            const down = offline.has(agent.name);
            return (
              <li key={agent.id} className="flex items-center gap-2 text-[11px]">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: down || !agent.isActive ? "#475569" : agent.color ?? "#38bdf8" }} />
                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{agent.name}</span>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{roleLabel(agent.role, locale)}</span>
                <span className={"shrink-0 rounded px-1 text-[9px] " + (down || !agent.isActive ? "bg-slate-700/40 text-slate-400" : "bg-emerald-600/20 text-emerald-300")}>
                  {down ? (ru ? "офлайн" : "offline") : agent.isActive ? (ru ? "в строю" : "ready") : (ru ? "выкл" : "off")}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={ru ? "Как принимается решение" : "Decision flow"} tone={blockers > 0 ? "warn" : "default"}>
        <ul className="space-y-1 text-[11px] text-[var(--text-secondary)]">
          <li>{ru ? "Режим" : "Mode"}: <span className="text-[var(--text-primary)]">{props.decisionMode === "vote" ? (ru ? "голосование команды" : "team vote") : (ru ? "решает Главный" : "Lead decides")}</span></li>
          <li>{ru ? "Team mode" : "Team mode"}: <span className="text-[var(--text-primary)]">{props.teamMode ? (ru ? "включён" : "on") : (ru ? "выключен" : "off")}</span></li>
          <li>{ru ? "AUTO-режим" : "AUTO"}: <span className="text-[var(--text-primary)]">{props.autoApprove ? (ru ? "включён" : "on") : (ru ? "выключен" : "off")}</span></li>
          <li className={blockers > 0 ? "text-amber-300" : "text-emerald-300"}>
            {ru ? "Блокеры Фомы" : "Skeptic blockers"}: {blockers}
          </li>
          {props.lastCheck ? <li className="truncate">{ru ? "Последняя проверка" : "Last check"}: <span className="text-[var(--text-primary)]">{props.lastCheck}</span></li> : null}
        </ul>
      </Card>

      <Card title={ru ? "Изменения задачи" : "Task changes"} tone={changedFiles.length > 0 ? "warn" : "default"}>
        {changedFiles.length === 0 ? (
          <p className="text-[11px] text-[var(--text-secondary)]">{ru ? "Пока никто ничего не менял." : "No files changed yet."}</p>
        ) : (
          <>
            <ul className="mb-2 space-y-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
              {changedFiles.slice(0, 8).map((file) => (<li key={file} className="truncate">± {file}</li>))}
            </ul>
            <button type="button" onClick={props.onRollback} className="rounded border border-red-400/50 px-2 py-1 text-[10px] text-red-200 hover:border-red-300">
              {ru ? "↩ Откатить задачу" : "↩ Roll back task"}
            </button>
          </>
        )}
      </Card>

      <Card title={ru ? "Токены и стоимость" : "Tokens and cost"}>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {props.lastUsage ?? (ru ? "Пока не было запросов к провайдеру. Цифры появятся после первого ответа агента." : "No provider calls yet. Numbers appear after the first agent reply.")}
        </p>
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
          {ru ? "Считаются реальные prompt+completion токены из ответа провайдера, цена — по прайсу модели." : "Real prompt+completion tokens from the provider response; price uses the model list price."}
        </p>
      </Card>

      <Card title="Telegram" tone={props.telegramReady ? "good" : "warn"}>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {props.telegramReady
            ? (ru ? "Пульт подключён: /task, /status, /stop." : "Remote control connected: /task, /status, /stop.")
            : (ru ? "Не настроен. Токен из @BotFather и chat id — в Настройках → Сеть и доступ." : "Not configured. Bot token and chat id live in Settings → Network.")}
        </p>
      </Card>
    </div>
  );
}
