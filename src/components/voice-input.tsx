"use client";

import { useRef, useState, useCallback, useEffect } from "react";

const PREFS_KEY = "voice-input-prefs";

export type VoiceMode = "toggle" | "hold";

export type VoicePrefs = {
  mode: VoiceMode;
  // KeyboardEvent.code (e.g. "KeyT") or "Mouse0".."Mouse4" for mouse buttons.
  hotkey: string | null;
};

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
      return {
        mode: parsed.mode === "hold" ? "hold" : "toggle",
        hotkey: typeof parsed.hotkey === "string" ? parsed.hotkey : null,
      };
    }
  } catch { /* ignore */ }
  return { mode: "toggle", hotkey: null };
}

export function saveVoicePrefs(prefs: VoicePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

function getRecognitionConstructor(): (new () => any) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

function describeError(err: unknown): string {
  const code = (err as { error?: string })?.error;
  if (code === "not-allowed" || code === "service-not-allowed") return "Нет доступа к микрофону — разрешите его в браузере";
  if (code === "no-speech") return "Речь не распознана — скажите громче и ближе к микрофону";
  if (code === "audio-capture") return "Микрофон не найден";
  if (code === "network") return "Ошибка сети распознавания";
  return "Ошибка распознавания речи";
}

export function useVoiceInput(onResult: (text: string) => void, prefs?: VoicePrefs) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => !!getRecognitionConstructor());
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor || listening) return;
    setError(null);
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) onResultRef.current(transcript);
    };
    rec.onerror = (event: any) => {
      setError(describeError(event?.error));
      setListening(false);
    };
    rec.onend = () => { setListening(false); };
    try {
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setError("Не удалось запустить распознавание");
    }
  }, [listening]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // User-assignable global hotkey (keyboard key or mouse button).
  useEffect(() => {
    if (!prefs?.hotkey) return;
    const isMouse = prefs.hotkey.startsWith("Mouse");
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== prefs.hotkey) return;
      if (prefs.mode === "toggle") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack typing
        if (!e.repeat) toggle();
      } else {
        e.preventDefault();
        if (!e.repeat) start();
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (`Mouse${e.button}` !== prefs.hotkey) return;
      e.preventDefault();
      if (prefs.mode === "hold") stop();
      else toggle();
    };
    if (!isMouse) window.addEventListener("keydown", onKey);
    else window.addEventListener("mousedown", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouse);
    };
  }, [prefs?.hotkey, prefs?.mode, start, stop, toggle]);

  return { listening, supported, error, start, stop, toggle };
}

// Compact settings popover: choose mode + assign a custom hotkey.
export function VoiceSettings({ prefs, onChange }: { prefs: VoicePrefs; onChange: (prefs: VoicePrefs) => void }) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const beginCapture = useCallback(() => {
    setCapturing(true);
    const finish = (hotkey: string | null) => {
      setCapturing(false);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      onChange(hotkey ? { ...prefs, hotkey } : prefs);
    };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); finish(e.code); };
    const onMouse = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); finish(`Mouse${e.button}`); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
  }, [prefs, onChange]);

  const buttonClass = "shrink-0 rounded border border-[var(--border-default)] px-2 text-sm text-[var(--text-secondary)] hover:border-blue-400";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Настройки голосового ввода"
        className={buttonClass}
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute bottom-9 right-0 z-50 w-60 rounded border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 text-xs shadow-lg">
          <div className="mb-1 font-semibold text-[var(--text-primary)]">Голосовой ввод</div>
          <div className="mb-2 flex flex-col gap-1">
            <label className="flex items-center gap-2">
              <input type="radio" checked={prefs.mode === "toggle"} onChange={() => onChange({ ...prefs, mode: "toggle" })} />
              Клик: нажал → пишет, нажал → стоп
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={prefs.mode === "hold"} onChange={() => onChange({ ...prefs, mode: "hold" })} />
              Зажать и говорить, отпустил → стоп
            </label>
          </div>
          <div className="mb-1">
            Горячая клавиша: <b className="text-blue-300">{prefs.hotkey ?? "—"}</b>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={beginCapture} className="rounded bg-[#0e639c] px-2 py-1 text-white">
              {capturing ? "Нажмите клавишу / кнопку мыши…" : "Назначить"}
            </button>
            {prefs.hotkey && (
              <button type="button" onClick={() => onChange({ ...prefs, hotkey: null })} className="rounded border border-[var(--border-default)] px-2 py-1">
                Сброс
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
