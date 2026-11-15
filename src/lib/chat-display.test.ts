import { describe, expect, it } from "vitest";
import { isTechnicalErrorText, sanitizeChatContent, parseToolCallDisplay } from "@/lib/chat-display";

describe("isTechnicalErrorText", () => {
  it("detects provider payloads", () => {
    expect(isTechnicalErrorText("HTTP 429 Too Many Requests")).toBe(true);
    expect(isTechnicalErrorText("ProviderGatewayError: upstream timeout")).toBe(true);
    expect(isTechnicalErrorText("Ошибка подключения к модели OpenRouter. Повторите попытку")).toBe(true);
    expect(isTechnicalErrorText("fetch failed")).toBe(true);
    expect(isTechnicalErrorText("ECONNRESET")).toBe(true);
  });

  it("does not swallow a substantive answer that mentions a limit", () => {
    // Audit low #6 regression: this used to be classified as a technical error.
    expect(isTechnicalErrorText("429 — это лимит запросов, переключился на резервную модель и продолжил")).toBe(false);
    expect(isTechnicalErrorText("Проверки прошли, но в логах был rate limit")).toBe(false);
  });

  it("keeps long messages and normal text", () => {
    expect(isTechnicalErrorText(`HTTP 500 ${"x".repeat(500)}`)).toBe(false);
    expect(isTechnicalErrorText("Готово: файл записан, тесты зелёные")).toBe(false);
    expect(isTechnicalErrorText("")).toBe(false);
  });
});

describe("parseToolCallDisplay", () => {
  it("recognizes a pure tool call", () => {
    expect(parseToolCallDisplay('{"function":{"name":"read_file","arguments":"{}"}}')).toEqual({ name: "read_file" });
  });

  it("ignores prose with JSON inside", () => {
    expect(parseToolCallDisplay("Смотрите: {\"a\":1}")).toBeNull();
  });
});

describe("sanitizeChatContent", () => {
  it("replaces a tool call with a status chip", () => {
    const text = sanitizeChatContent('{"function":{"name":"run_command","arguments":"{}"}}', "ru");
    expect(text).toContain("Выполняю команду в терминале");
  });

  it("keeps ordinary text untouched", () => {
    expect(sanitizeChatContent("Готово, всё зелёное", "ru")).toBe("Готово, всё зелёное");
  });
});
