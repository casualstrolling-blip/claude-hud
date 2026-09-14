export const config = { runtime: 'edge' };

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const out = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const utilizationOrNull = value => {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(1, n) : null;
};

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
    const sessionStatus = response.headers.get('anthropic-ratelimit-unified-5h-status');
    const weeklyStatus = response.headers.get('anthropic-ratelimit-unified-7d-status');
    const rawSessionUtilization = utilizationOrNull(response.headers.get('anthropic-ratelimit-unified-5h-utilization'));
    const rawWeeklyUtilization = utilizationOrNull(response.headers.get('anthropic-ratelimit-unified-7d-utilization'));
    const sessionUtilization = ['exhausted', 'rejected'].includes(sessionStatus) ? 1 : rawSessionUtilization;
    const weeklyUtilization = ['exhausted', 'rejected'].includes(weeklyStatus) ? 1 : rawWeeklyUtilization;
    if (!response.ok) {
      // A 429 is not itself proof of 100% usage: Anthropic also uses it for
      // ordinary request limiting. Only an explicit exhausted status is a
      // safe conversion to a full usage bar.
      return out({
        sessionUtilization: sessionStatus === 'exhausted' ? 1 : sessionUtilization,
        sessionReset: response.headers.get('anthropic-ratelimit-unified-5h-reset'),
        sessionStatus, weeklyUtilization, weeklyReset: response.headers.get('anthropic-ratelimit-unified-7d-reset'),
        weeklyStatus, upstreamStatus: response.status, rateLimited: response.status === 429,
      });
    }
    return out({ sessionUtilization, sessionReset: response.headers.get('anthropic-ratelimit-unified-5h-reset'), sessionStatus,
      weeklyUtilization, weeklyReset: response.headers.get('anthropic-ratelimit-unified-7d-reset'), weeklyStatus, httpStatus: response.status });
  } catch (_) { return out({ error: 'Claude usage endpoint unavailable' }, 502); }
}
