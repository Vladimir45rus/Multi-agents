// Prices per 1M tokens in USD (input / output). Values are the public list
// prices at the time of writing; they are used only for a rough estimate next
// to the real token counts reported by the provider.
type Price = { input: number; output: number };

const PRICES: Array<{ match: RegExp; price: Price; label: string }> = [
  { match: /gpt-4o-mini/i, price: { input: 0.15, output: 0.6 }, label: "gpt-4o-mini" },
  { match: /gpt-4o/i, price: { input: 2.5, output: 10 }, label: "gpt-4o" },
  { match: /gpt-4\.1-mini/i, price: { input: 0.4, output: 1.6 }, label: "gpt-4.1-mini" },
  { match: /gpt-4\.1/i, price: { input: 2, output: 8 }, label: "gpt-4.1" },
  { match: /claude-3\.5-haiku|claude-haiku/i, price: { input: 0.8, output: 4 }, label: "claude-haiku" },
  { match: /claude-sonnet/i, price: { input: 3, output: 15 }, label: "claude-sonnet" },
  { match: /gemini-2\.0-flash/i, price: { input: 0.1, output: 0.4 }, label: "gemini-2.0-flash" },
  { match: /gemini-2\.5-flash/i, price: { input: 0.3, output: 2.5 }, label: "gemini-2.5-flash" },
  { match: /deepseek-chat/i, price: { input: 0.27, output: 1.1 }, label: "deepseek-chat" },
  { match: /llama-3\.3-70b/i, price: { input: 0.6, output: 0.7 }, label: "llama-3.3-70b" },
  { match: /qwen2\.5-coder/i, price: { input: 0, output: 0 }, label: "qwen2.5-coder (локально)" },
];

export type TokenUsage = { prompt: number; completion: number };

export function priceFor(model: string): { price: Price; label: string } {
  const found = PRICES.find((entry) => entry.match.test(model));
  if (found) return { price: found.price, label: found.label };
  return { price: { input: 1, output: 3 }, label: model };
}

export function estimateCost(model: string, usage: TokenUsage) {
  const { price } = priceFor(model);
  const cost = (usage.prompt / 1_000_000) * price.input + (usage.completion / 1_000_000) * price.output;
  return Number.isFinite(cost) ? cost : 0;
}

export function formatCost(value: number) {
  if (value <= 0) return "0";
  if (value < 0.01) return value.toFixed(5);
  return value.toFixed(3);
}

export function formatTokens(usage: TokenUsage) {
  return `${usage.prompt}+${usage.completion}`;
}
