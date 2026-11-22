// «Сила мозга»: провайдеры принимают reasoning_effort / reasoning.effort только
// для моделей, которые умеют рассуждать. Для остальных переключатель должен
// быть неактивен, иначе он обещает то, чего не будет.

export type ReasoningEffort = "auto" | "off" | "low" | "medium" | "high" | "max";

export const REASONING_OPTIONS: Array<{ value: ReasoningEffort; ru: string; en: string }> = [
  { value: "auto", ru: "авто (по умолчанию)", en: "auto (default)" },
  { value: "off", ru: "выкл", en: "off" },
  { value: "low", ru: "низкое", en: "low" },
  { value: "medium", ru: "среднее", en: "medium" },
  { value: "high", ru: "высокое", en: "high" },
  { value: "max", ru: "максимум", en: "max" },
];

// Модели, у которых рассуждение заявлено провайдером. Список намеренно
// консервативный: лучше показать «авто», чем соврать про поддержку.
const REASONING_PATTERNS: RegExp[] = [
  /^o\d/i, // OpenAI o1 / o3 / o4
  /gpt-5/i,
  /deepseek-reasoner/i,
  /deepseek-r1/i,
  /-r1\b/i,
  /thinking/i,
  /reason/i,
  /qwq/i,
  /gemini-2\.5-(pro|flash)/i,
  /claude-(3[.-]7|4)[-.]/i,
  /sonnet-4/i,
  /opus-4/i,
  /grok-(3|4)/i,
  /magistral/i,
  /minimax-m\d/i,
];

export function supportsReasoning(model: string) {
  const name = (model ?? "").trim();
  if (!name) return false;
  return REASONING_PATTERNS.some((pattern) => pattern.test(name));
}

export function normalizeEffort(value: string | null | undefined): ReasoningEffort {
  const allowed: ReasoningEffort[] = ["auto", "off", "low", "medium", "high", "max"];
  return allowed.includes(value as ReasoningEffort) ? (value as ReasoningEffort) : "auto";
}

// Что именно уйдёт провайдеру. Пустая строка = не передавать ничего.
export function effortForRequest(effort: ReasoningEffort, model: string) {
  if (!supportsReasoning(model)) return "";
  if (effort === "auto") return "";
  // OpenAI-совместимые знают low/medium/high; max у них не документирован.
  if (effort === "max") return "high";
  if (effort === "off") return "minimal";
  return effort;
}
