// Self-healing model choice: providers rename and retire models all the time.
// When an agent points at a model the provider no longer lists, we pick a live
// replacement instead of letting the user see a cryptic 404.

const NON_CHAT = /embed|whisper|tts|moderation|rerank|image|vision-preview/i;

export function usableChatModels(models: string[]) {
  const clean = models.map((model) => model.trim()).filter(Boolean);
  const chat = clean.filter((model) => !NON_CHAT.test(model));
  return chat.length > 0 ? chat : clean;
}

export function pickReplacementModel(models: string[], providerDefault: string) {
  const usable = usableChatModels(models);
  if (usable.length === 0) return null;
  if (usable.includes(providerDefault)) return providerDefault;
  // Shortest id is usually the cheapest general-purpose model of the provider.
  return [...usable].sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
}

export function needsReplacement(currentModel: string, models: string[]) {
  if (!currentModel) return true;
  if (models.length === 0) return false;
  return !models.includes(currentModel);
}
