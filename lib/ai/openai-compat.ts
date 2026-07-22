/**
 * GPT-5 family on Chat Completions rejects fixed sampling params like `temperature`;
 * use model defaults instead (see OpenAI latest-model guide).
 */
export function isOpenAIGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model.trim());
}

/** GPT-5+ Chat Completions use `max_completion_tokens` instead of `max_tokens`. */
export function openaiCompletionTokenLimit(
  model: string,
  limit: number
): { max_tokens: number } | { max_completion_tokens: number } {
  if (isOpenAIGpt5Family(model)) {
    return { max_completion_tokens: limit };
  }
  return { max_tokens: limit };
}
