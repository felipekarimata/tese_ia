/**
 * LLMs often emit "JSON" with literal control characters (tab, newline, etc.)
 * inside string values. JSON.parse rejects those. This escapes them in-place
 * only while inside double-quoted string literals (respecting backslash escapes).
 */
export function escapeControlCharsInsideJsonStrings(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const code = c.charCodeAt(0);

    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }

    if (inString) {
      if (c === '\\') {
        out += c;
        escaped = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        out += c;
        continue;
      }
      if (code < 0x20) {
        if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += c;
      continue;
    }

    if (c === '"') {
      inString = true;
    }
    out += c;
  }

  return out;
}

export function parseJsonWithLlmRepair(raw: string): unknown {
  const trimmed = raw.trim();
  let text = trimmed;
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(escapeControlCharsInsideJsonStrings(text));
  }
}
