/**
 * Claude 5 models reject the legacy `temperature` sampling parameter.
 * The model family is the third segment in Anthropic model IDs, so
 * `claude-haiku-4-5` remains a Claude 4.x model rather than a Claude 5 model.
 */
export function isAnthropicClaude5Family(model: string): boolean {
  const match = model.trim().toLowerCase().match(/^claude-[a-z0-9]+-(\d+)(?:[-.]|$)/);
  return match?.[1] === '5';
}

export function anthropicTemperatureOption(
  model: string,
  temperature: number | undefined
): Partial<{ temperature: number }> {
  if (temperature === undefined || isAnthropicClaude5Family(model)) return {};
  return { temperature };
}
