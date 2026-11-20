// Token counting for budget checks.
// With ANTHROPIC_API_KEY set, counts with the Anthropic token-counting API (exact for that model).
// Without it, uses a conservative estimate: characters / 3, rounded up.

const MODEL = process.env.NEXUM_TOKEN_MODEL || 'claude-sonnet-4-5';

export function estimateTokens(text) {
  return Math.ceil(text.length / 3);
}

async function apiCount(text) {
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: text }] }),
  });
  if (!res.ok) throw new Error(`token API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // Subtract the fixed overhead of an otherwise empty message.
  const empty = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: '.' }] }),
  }).then(r => r.json());
  return Math.max(0, data.input_tokens - empty.input_tokens + 1);
}

/** Returns {tokens, method}. */
export async function countTokens(text) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { tokens: await apiCount(text), method: `api:${MODEL}` };
    } catch (e) {
      console.warn(`token API failed (${e.message}); using the estimate`);
    }
  }
  return { tokens: estimateTokens(text), method: 'estimate (chars/3)' };
}
