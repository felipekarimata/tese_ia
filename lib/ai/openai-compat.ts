/**
 * GPT-5 family on Chat Completions rejects fixed sampling params like `temperature`;
 * use model defaults instead (see OpenAI latest-model guide).
 */
export function isOpenAIGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model.trim());
}
