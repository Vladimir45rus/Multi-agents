export type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  fallbackModels: string[];
  supportsPublicModels?: boolean;
};

export const OPENROUTER_MODEL_IDS = [
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "deepseek/deepseek-r1",
] as const;

const OPENROUTER_MODEL_ALIASES: Record<string, string> = {
  "anthropic/claude-3.7-sonnet": "anthropic/claude-3.5-sonnet",
};

export function normalizeProviderModel(providerId: string | undefined, model: string | undefined) {
  const value = (model ?? "").trim();
  if (providerId === "openrouter") return OPENROUTER_MODEL_ALIASES[value] ?? value;
  return value;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: OPENROUTER_MODEL_IDS[0],
    fallbackModels: [...OPENROUTER_MODEL_IDS],
    supportsPublicModels: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    fallbackModels: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o-mini"],
  },
  {
    id: "anthropic",
    label: "Anthropic / Claude",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    fallbackModels: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    fallbackModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  },
  {
    id: "qwen",
    label: "Qwen / DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen2.5-coder-32b-instruct",
    fallbackModels: ["qwen2.5-coder-32b-instruct", "qwen2.5-coder-14b-instruct", "qwen-plus"],
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    fallbackModels: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-Coder-32B-Instruct",
      "deepseek-ai/DeepSeek-R1",
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    fallbackModels: ["grok-3-mini", "grok-3"],
  },
  {
    id: "perplexity",
    label: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    fallbackModels: ["sonar", "sonar-pro", "sonar-reasoning"],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    fallbackModels: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/deepseek-v3",
      "accounts/fireworks/models/qwen2p5-coder-32b-instruct",
    ],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.1-70b",
    fallbackModels: ["llama3.1-8b", "llama3.1-70b"],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    fallbackModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    fallbackModels: ["gemini-2.5-pro", "gemini-2.0-flash"],
  },
  {
    id: "mock",
    label: "Mock-Agent (Demo)",
    baseUrl: "local://mock",
    defaultModel: "mock-agent-v1",
    fallbackModels: ["mock-agent-v1", "mock-script-runner"],
  },
  {
    id: "custom",
    label: "Custom Endpoint",
    baseUrl: "",
    defaultModel: "custom-model",
    fallbackModels: ["custom-model"],
  },
];

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDER_PRESETS.map((provider) => [provider.id, provider]));

export function getProviderPreset(providerId: string | undefined) {
  return PROVIDER_BY_ID[providerId ?? ""] ?? PROVIDER_BY_ID.custom;
}
