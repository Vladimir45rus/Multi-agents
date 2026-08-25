"use client";

import { useState } from "react";

type PreviewModalProps = {
  open: boolean;
  url: string;
  loading?: boolean;
  onClose: () => void;
  onReload: () => void;
  onStart: () => void;
  onFeedback: (value: string) => void;
};

export function PreviewModal({ open, url, loading = false, onClose, onReload, onStart, onFeedback }: PreviewModalProps) {
  const [mobile, setMobile] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  if (!open) return null;
  const submitFeedback = () => {
    const value = feedback.trim();
    if (!value) return;
    onFeedback(value);
    setFeedback("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3">
      <section className="flex h-[88vh] w-[94vw] max-w-[1100px] flex-col overflow-hidden rounded border border-[#3a3d41] bg-[#252526] shadow-2xl">
        <header className="flex min-h-10 items-center justify-between gap-2 border-b border-[#3a3d41] px-3">
          <strong className="text-xs">👁️ Предпросмотр</strong>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { setReloadKey((key) => key + 1); onReload(); }} disabled={!url || loading} className="rounded bg-[#3a3d41] px-2 py-1 text-xs disabled:opacity-50">🔄 Перезагрузить</button>
            <button type="button" onClick={() => setMobile((value) => !value)} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">📱 {mobile ? "Desktop" : "Mobile"}</button>
            <button type="button" onClick={onClose} className="rounded bg-[#3a3d41] px-2 py-1 text-xs">✕</button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#111214] p-2">
          {url ? (
            <iframe key={`${url}-${reloadKey}`} title="Project live preview" src={url} sandbox="allow-scripts allow-forms allow-popups allow-modals" className={`h-full border border-[#3a3d41] bg-white ${mobile ? "w-[390px] max-w-full" : "w-full"}`} />
          ) : (
            <div className="text-center text-xs text-[#9da3b2]">
              <p className="mb-3">{loading ? "Запуск dev-сервера..." : "Dev-сервер проекта не запущен."}</p>
              <button type="button" onClick={onStart} disabled={loading} className="rounded bg-[#0e639c] px-3 py-2 text-xs text-white disabled:opacity-50">▶ Запустить preview</button>
            </div>
          )}
        </div>
        <footer className="flex gap-2 border-t border-[#3a3d41] p-2">
          <input value={feedback} onChange={(event) => setFeedback(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitFeedback(); }} placeholder="💬 Написать правку по верстке дизайнеру..." className="min-w-0 flex-1 rounded border border-[#3a3d41] bg-[#1e1e1e] px-2 py-2 text-xs" />
          <button type="button" onClick={submitFeedback} disabled={!feedback.trim()} className="rounded bg-[#ec4899] px-3 py-2 text-xs text-white disabled:opacity-50">💬 Отправить</button>
        </footer>
      </section>
    </div>
  );
}
