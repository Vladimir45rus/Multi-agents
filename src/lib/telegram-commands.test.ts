import { describe, expect, it } from "vitest";
import { formatTelegramStatus, isAllowedTelegramChat, parseTelegramCommand, telegramHelpText } from "@/lib/telegram-commands";

describe("parseTelegramCommand", () => {
  it("parses a plain command", () => {
    expect(parseTelegramCommand("/status")).toEqual({ kind: "status" });
    expect(parseTelegramCommand("/help")).toEqual({ kind: "help" });
    expect(parseTelegramCommand("/start")).toEqual({ kind: "start" });
    expect(parseTelegramCommand("/stop")).toEqual({ kind: "stop" });
    expect(parseTelegramCommand("/log")).toEqual({ kind: "log" });
  });

  it("strips the bot username suffix", () => {
    expect(parseTelegramCommand("/status@MultiAgentStudioBot")).toEqual({ kind: "status" });
  });

  it("keeps the whole task text", () => {
    expect(parseTelegramCommand("/task починить поиск в src/lib")).toEqual({ kind: "task", task: "починить поиск в src/lib" });
  });

  it("rejects an empty task", () => {
    expect(parseTelegramCommand("/task")).toEqual({ kind: "unknown", raw: "task" });
  });

  it("caps a very long task", () => {
    const command = parseTelegramCommand(`/task ${"x".repeat(5_000)}`);
    expect(command.kind).toBe("task");
    if (command.kind === "task") expect(command.task.length).toBe(4_000);
  });

  it("reports unknown commands", () => {
    expect(parseTelegramCommand("/deploy")).toEqual({ kind: "unknown", raw: "deploy" });
  });

  it("treats free text as a message", () => {
    expect(parseTelegramCommand("привет")).toEqual({ kind: "text", text: "привет" });
  });
});

describe("isAllowedTelegramChat", () => {
  it("accepts the configured chat only", () => {
    expect(isAllowedTelegramChat(123456, "123456")).toBe(true);
    expect(isAllowedTelegramChat("123456", "123456")).toBe(true);
    expect(isAllowedTelegramChat(999, "123456")).toBe(false);
  });

  it("rejects everything while no chat is configured", () => {
    expect(isAllowedTelegramChat(123456, "")).toBe(false);
    expect(isAllowedTelegramChat(undefined, "123456")).toBe(false);
  });
});

describe("telegram help and status", () => {
  it("lists every supported command", () => {
    const help = telegramHelpText();
    for (const command of ["/status", "/task", "/stop", "/log", "/help"]) expect(help).toContain(command);
  });

  it("formats an idle status", () => {
    const text = formatTelegramStatus({ projectRoot: "", activeTask: null, lastReport: null, autoApprove: false });
    expect(text).toContain("Активной задачи нет");
    expect(text).toContain("Проект: (не подключён)");
  });

  it("formats a running task with its last report", () => {
    const text = formatTelegramStatus({
      projectRoot: "C:/project",
      activeTask: { task: "добавить кнопку", step: "checks", iteration: 2, maxIterations: 5 },
      lastReport: { status: "FAILED", summary: "Проверки не пройдены", createdAt: "2026-11-15T00:00:00.000Z" },
      autoApprove: true,
    });
    expect(text).toContain("Проект: C:/project");
    expect(text).toContain("Шаг: checks, итерация 2/5");
    expect(text).toContain("Последний отчёт: FAILED");
  });
});
