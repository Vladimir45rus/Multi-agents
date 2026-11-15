"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VisualEdit = {
  id: number;
  selector: string;
  label: string;
  action: string;
  offsetX: number;
  offsetY: number;
  note: string;
  pageUrl: string;
  domPath: string;
  styles: string;
  createdAt: string;
};

type StyleHints = {
  widthPct?: number;
  heightPct?: number;
  fontPct?: number;
  color?: string;
  background?: string;
  radius?: number;
  opacity?: number;
  paddingPx?: number;
};

type SelectedElement = {
  label: string;
  selector: string;
  offsetX: number;
  offsetY: number;
  styles: StyleHints;
};

type PreviewModalProps = {
  open: boolean;
  url: string;
  loading?: boolean;
  locale?: "ru" | "en";
  onClose: () => void;
  onReload: () => void;
  onStart: () => void;
  onFeedback: (value: string) => void;
  /** Optional: when omitted (mobile shell) the "send to agents" button is hidden. */
  onSendToAgents?: (brief: string) => void | Promise<void>;
};

const PROXY_PREFIX = "/api/preview/proxy";

function parseStyles(value: string | undefined): StyleHints {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as StyleHints;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function describeOffset(edit: VisualEdit, locale: "ru" | "en") {
  const parts: string[] = [];
  if (edit.offsetX !== 0) parts.push(`${Math.abs(edit.offsetX)}px ${edit.offsetX > 0 ? (locale === "ru" ? "вправо" : "right") : (locale === "ru" ? "влево" : "left")}`);
  if (edit.offsetY !== 0) parts.push(`${Math.abs(edit.offsetY)}px ${edit.offsetY > 0 ? (locale === "ru" ? "вниз" : "down") : (locale === "ru" ? "вверх" : "up")}`);
  return parts.length ? parts.join(" · ") : locale === "ru" ? "без смещения" : "no offset";
}

function styleSummary(styles: StyleHints) {
  const parts: string[] = [];
  if (styles.widthPct) parts.push(`W ${styles.widthPct}%`);
  if (styles.heightPct) parts.push(`H ${styles.heightPct}%`);
  if (styles.fontPct) parts.push(`font ${styles.fontPct}%`);
  if (styles.radius !== undefined) parts.push(`r ${styles.radius}px`);
  if (styles.opacity !== undefined) parts.push(`α ${styles.opacity}`);
  if (styles.background) parts.push(`bg ${styles.background}`);
  return parts.join(" · ");
}

const inputClass = "w-full rounded border border-[#3a3d41] bg-[#1e1e1e] px-1.5 py-1 text-[11px] text-[#d4d4d4]";
const labelClass = "flex flex-col gap-0.5 text-[10px] text-[#9da3b2]";

export function PreviewModal({ open, url, loading = false, locale = "ru", onClose, onReload, onStart, onFeedback, onSendToAgents }: PreviewModalProps) {
  const [mobile, setMobile] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [visualMode, setVisualMode] = useState(false);
  const [edits, setEdits] = useState<VisualEdit[]>([]);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ru = locale === "ru";

  const proxied = url.startsWith(PROXY_PREFIX);
  const frameUrl = visualMode && !proxied ? PROXY_PREFIX : url;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/visual-edits", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { edits?: VisualEdit[] };
        if (!cancelled) setEdits(payload.edits ?? []);
      } catch {
        /* preview stays usable without the edit list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sendToFrame = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ source: "multi-agent-ide", ...message }, "*");
  }, []);

  useEffect(() => {
    if (!visualMode) return;
    const timer = window.setTimeout(() => sendToFrame({ type: "visual-mode", enabled: true }), 350);
    return () => window.clearTimeout(timer);
  }, [visualMode, reloadKey, sendToFrame]);

  const persist = useCallback(async (element: SelectedElement) => {
    try {
      const response = await fetch("/api/visual-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selector: element.selector,
          label: element.label,
          action: "move",
          offsetX: element.offsetX,
          offsetY: element.offsetY,
          pageUrl: url,
          styles: JSON.stringify(element.styles),
          locale,
        }),
      });
      const body = (await response.json().catch(() => null)) as { edits?: VisualEdit[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "save failed");
      setEdits(body?.edits ?? []);
      setStatus(ru ? "Сохранено" : "Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "save failed");
    }
  }, [url, locale, ru]);

  const schedulePersist = useCallback((element: SelectedElement) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist(element);
    }, 500);
  }, [persist]);

  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: string;
        type?: string;
        element?: { label?: string; selector?: string; styles?: StyleHints };
        offset?: { x?: number; y?: number };
        styles?: StyleHints;
      } | null;
      if (!data || data.source !== "multi-agent-preview") return;

      if (data.type === "select" && data.element) {
        setSelected({
          label: data.element.label ?? data.element.selector ?? "",
          selector: data.element.selector ?? "",
          offsetX: Number(data.offset?.x ?? 0),
          offsetY: Number(data.offset?.y ?? 0),
          styles: data.element.styles ?? {},
        });
        return;
      }
      if (data.type === "deselect") {
        setSelected(null);
        return;
      }
      if (data.type === "edit" && data.element?.selector) {
        const element: SelectedElement = {
          label: data.element.label ?? "",
          selector: data.element.selector,
          offsetX: Number(data.offset?.x ?? 0),
          offsetY: Number(data.offset?.y ?? 0),
          styles: data.element.styles ?? {},
        };
        setSelected(element);
        void persist(element);
        return;
      }
      if (data.type === "style" && data.element?.selector) {
        const element: SelectedElement = {
          label: data.element.label ?? "",
          selector: data.element.selector,
          offsetX: Number(data.offset?.x ?? 0),
          offsetY: Number(data.offset?.y ?? 0),
          styles: data.styles ?? data.element.styles ?? {},
        };
        setSelected(element);
        void persist(element);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, persist]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  if (!open) return null;

  const handleClose = () => {
    setVisualMode(false);
    setSelected(null);
    setStatus("");
    onClose();
  };

  const submitFeedback = () => {
    const value = feedback.trim();
    if (!value) return;
    onFeedback(value);
    setFeedback("");
  };

  const updateStyle = (patch: Partial<StyleHints>) => {
    if (!selected) return;
    const next: SelectedElement = { ...selected, styles: { ...selected.styles, ...patch } };
    setSelected(next);
    sendToFrame({ type: "apply-style", styles: next.styles });
    schedulePersist(next);
  };

  const resetStyles = () => {
    if (!selected) return;
    const next: SelectedElement = { ...selected, styles: {} as StyleHints };
    setSelected(next);
    sendToFrame({ type: "apply-style", styles: {} });
    schedulePersist(next);
  };

  const removeEdit = async (id: number) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/visual-edits?id=${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { edits?: VisualEdit[] } | null;
      if (response.ok) setEdits(payload?.edits ?? edits.filter((edit) => edit.id !== id));
    } finally {
      setBusy(false);
    }
  };

  const clearEdits = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/visual-edits", { method: "DELETE" });
      if (response.ok) {
        setEdits([]);
        setSelected(null);
        sendToFrame({ type: "visual-reset" });
        setReloadKey((key) => key + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const sendToAgents = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/visual-edits?format=brief&locale=${locale}`, { cache: "no-store" });
      const payload = (await response.json()) as { brief?: string };
      const brief = (payload.brief ?? "").trim();
      if (!brief) {
        setStatus(ru ? "Нет правок для отправки" : "No edits to send");
        return;
      }
      await Promise.resolve(onSendToAgents?.(brief));
      setStatus(ru ? "Передано в исполнение — прогресс в панели оркестратора" : "Sent for execution — see the orchestrator panel");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3">
      <section className="flex h-[88vh] w-[94vw] max-w-[1400px] flex-col overflow-hidden rounded border border-[#3a3d41] bg-[#252526] shadow-2xl">
        <header className="flex min-h-10 items-center justify-between gap-2 border-b border-[#3a3d41] px-3">
          <strong className="text-xs">👁️ {ru ? "Предпросмотр" : "Preview"}</strong>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setVisualMode((value) => !value); setStatus(""); setReloadKey((key) => key + 1); }}
              disabled={!url || loading}
              className={`rounded px-2 py-1 text-xs disabled:opacity-50 ${visualMode ? "bg-[#ec4899] text-white" : "bg-[#3a3d41]"}`}
              title={ru ? "Выбирать элементы и менять их" : "Pick elements and edit them"}
            >
              🧩 {ru ? "Конструктор" : "Builder"}
            </button>
            <button type="button" onClick={() => { setReloadKey((key) => key + 1); onReload(); }} disabled={!url || loading} className="rounded bg-[#3a3d41] px-2 py-1 text-xs disabled:opacity-50">🔄 {ru ? "Перезагрузить" : "Reload"}</button>
            <button type="button" onClick={() => setMobile((value) => !value)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">📱 {mobile ? "Desktop" : "Mobile"}</button>
            <button type="button" onClick={handleClose} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">✕</button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-[#111214] p-2">
            {url ? (
              <iframe
                key={`${frameUrl}-${reloadKey}`}
                ref={frameRef}
                title="Project live preview"
                src={frameUrl}
                onLoad={() => { if (visualMode) sendToFrame({ type: "visual-mode", enabled: true }); }}
                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                className={`h-full border border-[#3a3d41] bg-white ${mobile ? "w-[390px] max-w-full" : "w-full"}`}
              />
            ) : (
              <div className="text-center text-xs text-[#9da3b2]">
                <p className="mb-3">{loading ? (ru ? "Запуск dev-сервера..." : "Starting the dev server...") : (ru ? "Dev-сервер проекта не запущен." : "The project dev server is not running.")}</p>
                <button type="button" onClick={onStart} disabled={loading} className="rounded bg-[#0e639c] px-3 py-2 text-xs text-white disabled:opacity-50">▶ {ru ? "Запустить preview" : "Start preview"}</button>
              </div>
            )}
          </div>

          {visualMode ? (
            <aside className="flex w-[300px] shrink-0 flex-col border-l border-[#3a3d41] bg-[#1e1e1e]">
              <div className="border-b border-[#3a3d41] p-2 text-[10px] leading-snug text-[#9da3b2]">
                {ru
                  ? "Кликните элемент. Тяните — перемещение, угловой маркер — размер. Стрелки — 1px, Shift — 10px. Esc снимает выделение."
                  : "Click an element. Drag to move, corner handle to resize. Arrows nudge 1px, Shift 10px. Esc deselects."}
              </div>

              {selected ? (
                <div className="border-b border-[#3a3d41] p-2">
                  <div className="mb-1 truncate text-[11px] font-semibold text-[#ec4899]" title={selected.selector}>{selected.label}</div>
                  <div className="mb-2 break-all text-[9px] text-[#9da3b2]">{selected.selector}</div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className={labelClass}>
                      {ru ? "Ширина, %" : "Width, %"}
                      <input
                        type="number" min={2} max={100} step={1}
                        className={inputClass}
                        value={selected.styles.widthPct ?? ""}
                        placeholder="auto"
                        onChange={(event) => updateStyle({ widthPct: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Высота, %" : "Height, %"}
                      <input
                        type="number" min={2} max={100} step={1}
                        className={inputClass}
                        value={selected.styles.heightPct ?? ""}
                        placeholder="auto"
                        onChange={(event) => updateStyle({ heightPct: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Шрифт, %" : "Font, %"}
                      <input
                        type="number" min={50} max={400} step={5}
                        className={inputClass}
                        value={selected.styles.fontPct ?? ""}
                        placeholder="100"
                        onChange={(event) => updateStyle({ fontPct: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Радиус, px" : "Radius, px"}
                      <input
                        type="number" min={0} max={200} step={1}
                        className={inputClass}
                        value={selected.styles.radius ?? ""}
                        placeholder="0"
                        onChange={(event) => updateStyle({ radius: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Прозрачность" : "Opacity"}
                      <input
                        type="number" min={0} max={1} step={0.05}
                        className={inputClass}
                        value={selected.styles.opacity ?? ""}
                        placeholder="1"
                        onChange={(event) => updateStyle({ opacity: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Отступ, px" : "Padding, px"}
                      <input
                        type="number" min={0} max={200} step={1}
                        className={inputClass}
                        value={selected.styles.paddingPx ?? ""}
                        placeholder="0"
                        onChange={(event) => updateStyle({ paddingPx: event.target.value === "" ? undefined : Number(event.target.value) })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Цвет текста" : "Text color"}
                      <input
                        type="color"
                        className="h-6 w-full rounded border border-[#3a3d41] bg-[#1e1e1e]"
                        value={selected.styles.color ?? "#ffffff"}
                        onChange={(event) => updateStyle({ color: event.target.value })}
                      />
                    </label>
                    <label className={labelClass}>
                      {ru ? "Фон" : "Background"}
                      <input
                        type="color"
                        className="h-6 w-full rounded border border-[#3a3d41] bg-[#1e1e1e]"
                        value={selected.styles.background ?? "#0e639c"}
                        onChange={(event) => updateStyle({ background: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#4fc1ff]">
                    <span>x: {selected.offsetX}px · y: {selected.offsetY}px</span>
                    <button type="button" onClick={resetStyles} className="rounded bg-[#3a3d41] px-1.5 py-0.5 text-[9px] text-[#d4d4d4]">{ru ? "Сбросить стили" : "Reset styles"}</button>
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-auto p-2">
                {edits.length === 0 ? (
                  <p className="text-[11px] text-[#9da3b2]">{ru ? "Пока нет правок." : "No edits yet."}</p>
                ) : (
                  <ul className="space-y-1">
                    {edits.map((edit) => (
                      <li key={edit.id} className="rounded border border-[#3a3d41] bg-[#252526] p-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] text-[#d4d4d4]" title={edit.selector}>{edit.label || edit.selector}</div>
                            <div className="text-[10px] text-[#4fc1ff]">{describeOffset(edit, locale)}</div>
                            {styleSummary(parseStyles(edit.styles)) ? (
                              <div className="text-[10px] text-[#a78bfa]">{styleSummary(parseStyles(edit.styles))}</div>
                            ) : null}
                          </div>
                          <button type="button" onClick={() => void removeEdit(edit.id)} disabled={busy} className="rounded bg-[#3a3d41] px-1 text-[10px] disabled:opacity-50">✕</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1 border-t border-[#3a3d41] p-2">
                <button type="button" onClick={() => void sendToAgents()} disabled={busy || edits.length === 0 || !onSendToAgents} className="w-full rounded bg-[#ec4899] px-2 py-2 text-[11px] text-white disabled:opacity-50">
                  🚀 {ru ? "Отправить агентам" : "Send to agents"}
                </button>
                <button type="button" onClick={() => void clearEdits()} disabled={busy || edits.length === 0} className="w-full rounded bg-[#3a3d41] px-2 py-1 text-[11px] disabled:opacity-50">
                  🧹 {ru ? "Очистить всё" : "Clear all"}
                </button>
                {status ? <p className="pt-1 text-[10px] text-[#9da3b2]">{status}</p> : null}
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="flex gap-2 border-t border-[#3a3d41] p-2">
          <input value={feedback} onChange={(event) => setFeedback(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitFeedback(); }} placeholder={ru ? "💬 Написать правку по верстке дизайнеру..." : "💬 Describe a layout change for the designer..."} className="min-w-0 flex-1 rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-2 text-xs" />
          <button type="button" onClick={submitFeedback} disabled={!feedback.trim()} className="rounded bg-[#ec4899] px-3 py-2 text-xs text-white disabled:opacity-50">💬 {ru ? "Отправить" : "Send"}</button>
        </footer>
      </section>
    </div>
  );
}
