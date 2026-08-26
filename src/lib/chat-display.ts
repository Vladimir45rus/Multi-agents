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

function tryParseToolCallObject(obj: unknown): { name: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  const fn = record.function as Record<string, unknown> | undefined;
  if (fn && typeof fn.name === "string") return { name: fn.name };
  if (typeof record.name === "string" && record.arguments !== undefined) return { name: record.name };
  return null;
}

/** Detect a pure tool-call JSON payload: {"function":{"name":...}} or {"name":...,"arguments":...}. */
export function parseToolCallDisplay(text: string): { name: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  if (trimmed.length > 200_000) return null;
  try {
    const parsed = tryParseToolCallObject(JSON.parse(trimmed));
    if (parsed) return parsed;
  } catch {
    // Fall through to the escaped variant below.
  }
  // Escaped variant: {\"function\":...} embedded inside a string literal.
  if (trimmed.includes('\\"')) {
    try {
      const unescaped = trimmed.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return tryParseToolCallObject(JSON.parse(unescaped));
    } catch {
      return null;
    }
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
 * Find the start of a tool-call JSON fragment at/after `from`, handling both
 * plain {"function": and escaped {\"function\": variants.
 */
function findToolStart(text: string, from: number): number {
  let idx = text.indexOf('{"function"', from);
  const escapedIdx = text.indexOf('{\\"function\\"', from);
  if (escapedIdx !== -1 && (idx === -1 || escapedIdx < idx)) idx = escapedIdx;
  if (idx !== -1) return idx;
  const plainName = text.indexOf('{"name"', from);
  const escapedName = text.indexOf('{\\"name\\"', from);
  const best = escapedName !== -1 && (plainName === -1 || escapedName < plainName) ? escapedName : plainName;
  return best;
}

/**
 * Return the index just past the closing brace of the balanced JSON object
 * starting at `open` (handles strings and escapes), or -1 if unbalanced.
 */
function findBalancedEnd(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Replace every inline tool-call JSON fragment with a clean status chip line.
 * Handles plain and escaped variants, multi-line pretty-printed payloads and
 * multiple fragments per message; prose around them is preserved verbatim.
 */
export function sanitizeChatContent(text: string, locale?: string): string {
  if (!text || !text.includes("{" )) return text;

  const pure = findToolStart(text, 0);
  if (pure === 0) {
    const end = findBalancedEnd(text, 0);
    const candidate = end > 0 ? text.slice(0, end) : text;
    const parsed = parseToolCallDisplay(candidate);
    if (parsed) return `\n⚙️ ${toolLabel(parsed.name, locale)}\n`;
  }

  let out = "";
  let cursor = 0;
  let changed = false;
  while (cursor < text.length) {
    const start = findToolStart(text, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, start);
    const end = findBalancedEnd(text, start);
    const candidate = end > 0 ? text.slice(start, end) : text.slice(start);
    const parsed = parseToolCallDisplay(candidate);
    if (parsed) {
      changed = true;
      out += `⚙️ ${toolLabel(parsed.name, locale)}`;
      cursor = end > 0 ? end : text.length;
    } else {
      out += text[start];
      cursor = start + 1;
    }
  }
  void changed;
  return out !== text ? out : text;
}

/** True when a streamed chunk is itself a complete tool-call JSON payload. */
export function isPureToolCallChunk(chunk: string): boolean {
  const trimmed = chunk.trim();
  if (!trimmed.startsWith("{")) return false;
  return parseToolCallDisplay(trimmed) !== null;
}
