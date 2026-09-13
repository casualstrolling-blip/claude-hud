export const config = { runtime: 'edge' };

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const out = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const numberOrNull = value => { if (value === null) return null; const n = Number(value); return Number.isFinite(n) ? n : null; };

export default async function handler(request) {
  if (request.method !== 'GET') return out({ error: 'method not allowed' }, 405);
  const token = process.env.ANTHROPIC_TOKEN;
  if (!token) return out({ error: 'ANTHROPIC_TOKEN is not configured' }, 500);
  try {
    const isApiKey = token.startsWith('sk-ant-api');
    const authentication = isApiKey
      ? { 'x-api-key': token }
      : { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' };
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: {
        ...authentication, 'anthropic-version': '2023-06-01',
        'User-Agent': 'claude-code/2.0.37', 'Content-Type': 'application/json',
      }, body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] }),
    });
    if (!response.ok) return out({ error: `Claude usage endpoint returned ${response.status}` }, 502);
    return out({
      sessionUtilization: numberOrNull(response.headers.get('anthropic-ratelimit-unified-5h-utilization')),
      sessionReset: response.headers.get('anthropic-ratelimit-unified-5h-reset'),
      sessionStatus: response.headers.get('anthropic-ratelimit-unified-5h-status'),
      weeklyUtilization: numberOrNull(response.headers.get('anthropic-ratelimit-unified-7d-utilization')),
      weeklyReset: response.headers.get('anthropic-ratelimit-unified-7d-reset'),
      weeklyStatus: response.headers.get('anthropic-ratelimit-unified-7d-status'), httpStatus: response.status,
    });
  } catch (_) { return out({ error: 'Claude usage endpoint unavailable' }, 502); }
}
