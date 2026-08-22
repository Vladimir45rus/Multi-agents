function sseDataLines(block: string) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
}

export function hasSseData(block: string) {
  return sseDataLines(block).length > 0;
}

export function parseSseJson<T>(block: string): T | null {
  const data = sseDataLines(block).join("\n").trim();
  if (!data) return null;

  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
