// Shared chat display helpers: keep agent chat windows clean by detecting
// technical payloads (raw provider errors, tool-call JSON) and turning them
// into friendly status chips. Used by both the desktop UI and the overlay.

const TOOL_LABELS_RU: Record<string, string> = {
  read_file: "Выполняю чтение файлов...",
  write_file: "Сохраняю изменения в файлах...",
  create_file: "Создаю файлы...",
  delete_file: "Удаляю файлы...",
  list_files: "Просматриваю структуру проекта...",
  run_command: "Выполняю команду в терминале...",
  search_files: "Ищу по проекту...",
};

const TOOL_LABELS_EN: Record<string, string> = {
  read_file: "Reading files...",
  write_file: "Saving file changes...",
  create_file: "Creating files...",
  delete_file: "Deleting files...",
  list_files: "Browsing project tree...",
  run_command: "Running terminal command...",
  search_files: "Searching project...",
};

function toolLabel(name: string, locale?: string) {
  const table = locale === "en" ? TOOL_LABELS_EN : TOOL_LABELS_RU;
  return table[name] ?? (locale === "en" ? "Running tool..." : "Выполняю инструмент...");
}

/** Detect a pure tool-call JSON payload: {"function":{"name":...,"arguments":...}} or {"name":...,"arguments":...}. */
export function parseToolCallDisplay(text: string): { name: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  if (trimmed.length > 100_000) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (obj && typeof obj === "object") {
      const fn = obj.function as Record<string, unknown> | undefined;
      if (fn && typeof fn.name === "string") return { name: fn.name };
      if (typeof obj.name === "string" && obj.arguments !== undefined) return { name: obj.name };
    }
  } catch {
    return null;
  }
  return null;
}

/** Raw provider/connection errors that belong in the logs panel, not in chat. */
export function isTechnicalErrorText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 400) return false;
  return /^(HTTP \d{3}\b)|(ProviderGatewayError)|(Ошибка подключения к модели)|(fetch failed)|(ECONNRESET|ETIMEDOUT|ENOTFOUND)|(rate.?limit|quota exceeded|429)/i.test(trimmed);
}

/**
 * Replace tool-call JSON inside a chat message with a clean status chip line.
 * Pure tool-call messages become a single chip; mixed prose keeps its text and
 * gets embedded call lines replaced.
 */
export function sanitizeChatContent(text: string, locale?: string): string {
  if (!text) return text;

  const pure = parseToolCallDisplay(text);
  if (pure) return `⚙️ ${toolLabel(pure.name, locale)}`;

  let changed = false;
  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{\"function\"") && !trimmed.startsWith("{\"name\"")) return line;
    const parsed = parseToolCallDisplay(trimmed);
    if (!parsed) return line;
    changed = true;
    return `⚙️ ${toolLabel(parsed.name, locale)}`;
  });
  return changed ? lines.join("\n") : text;
}
