function findJsonEnd(input: string): number {
  const open = input[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
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
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  return input.length;
}

export function extractJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = cleaned.search(/[{[]/);
  if (start < 0) throw new Error("No JSON object found in model response");

  const slice = cleaned.slice(start);
  const json = slice.slice(0, findJsonEnd(slice));
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("Model returned invalid JSON");
  }
}
