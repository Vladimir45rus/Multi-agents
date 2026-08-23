"use client";

import { useEffect, useState } from "react";
import { PROVIDER_PRESETS } from "@/lib/providers";

type AgentInfo = { id: number; name: string; role: string; color: string; isActive: boolean; provider: string; model: string };

const ROLE_LABELS: Record<string, string> = {
  main: "Главный", advisor: "Советник", reviewer: "Ревьюер",
  tester: "Тестировщик", architect: "Архитектор", uiux: "UI/UX Дизайнер",
  security: "Секурити", observer: "Наблюдатель",
};

export function MobileSettings({ onBack, agents, accessToken }: { onBack: () => void; agents: AgentInfo[]; accessToken: string }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<{ autoApprove: boolean; mobileAuthToken: string }>({ autoApprove: false, mobileAuthToken: "" });

  useEffect(() => {
    const headers = accessToken ? { "x-mobile-access-token": accessToken } : undefined;
    fetch("/api/settings", { headers }).then(async (response) => {
      if (!response.ok) throw new Error("Не удалось загрузить настройки");
      return response.json();
    }).then(d => {
      setKeys(d.apiKeys || {});
      setConfig({ autoApprove: d.autoApprove || false, mobileAuthToken: d.mobileAuthToken || "" });
      setToken(d.mobileAuthToken || "");
    }).catch((reason) => {
      setSaved(false);
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить настройки");
    });
  }, [accessToken]);

  async function saveKeys() {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (accessToken) headers.set("x-mobile-access-token", accessToken);
    const body: Record<string, unknown> = { apiKeys: keys };
    if (token.trim()) body.mobileAuthToken = token.trim();
    const response = await fetch("/api/settings", {
      method: "PATCH", headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Не удалось сохранить настройки");
    setError("");
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  const vars = (k: string) => `var(--${k})`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: vars("bg-app"), color: vars("text-primary") }}>
      <header style={{ background: vars("bg-panel"), borderBottom: `1px solid ${vars("border-default")}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: vars("text-accent"), fontSize: 16, cursor: "pointer" }}>← Назад</button>
        <span style={{ fontSize: 14, fontWeight: 700 }}>⚙️ Настройки</span>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {/* Token info */}
        <div style={{ background: vars("bg-panel"), borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: vars("text-secondary"), margin: "0 0 8px" }}>Токен для мобильного доступа</p>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={token} onChange={e => setToken(e.target.value)}
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${vars("border-input")}`, background: vars("bg-input"), color: vars("text-primary"), fontSize: 13 }} placeholder="Введите токен..." />
          </div>
          <p style={{ fontSize: 11, color: vars("text-muted"), marginTop: 6 }}>
            Открой в браузере: <code>http://IP-ПК:3210/mobile?token=...</code>
          </p>
        </div>

        {/* API Keys */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>API Ключи</p>
          {PROVIDER_PRESETS.map(p => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 11, color: vars("text-secondary"), margin: "0 0 4px" }}>{p.label}</p>
              <input type="password" value={keys[p.id] || ""}
                onChange={e => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${vars("border-input")}`, background: vars("bg-input"), color: vars("text-primary"), fontSize: 13, boxSizing: "border-box" }} />
            </div>))}
        </div>

        {/* Agents */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Агенты ({agents.length})</p>
          {agents.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${vars("border-default")}` }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: a.color || "#888", flexShrink: 0, opacity: a.isActive ? 1 : 0.3 }} />
              <span style={{ fontSize: 13, flex: 1 }}>{a.name}</span>
              <span style={{ fontSize: 10, color: vars("text-muted") }}>{ROLE_LABELS[a.role] || a.role}</span>
              <span style={{ fontSize: 10, color: a.isActive ? "#6a9955" : "#f48771" }}>{a.isActive ? "●" : "○"}</span>
            </div>))}
        </div>

        {error ? <p style={{ color: "#f48771", fontSize: 12, marginBottom: 8 }}>{error}</p> : null}
        <button onClick={() => void saveKeys().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось сохранить настройки"))}
          style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: saved ? "#6a9955" : vars("bg-status"), color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}