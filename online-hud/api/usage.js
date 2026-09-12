const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Content-Type-Options': 'nosniff' };
function reply(res, body, status = 200) { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(body)); }
async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://auth.openai.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: 'app_EMoamEEZ73f0CkXaXp7hrann' }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`OAuth refresh failed (${response.status})`);
  return data;
}
async function readUsage(accessToken) {
  return fetch('https://chatgpt.com/backend-api/wham/usage', { headers: { Authorization: `Bearer ${accessToken}`, ...(process.env.OPENAI_ACCOUNT_ID ? { 'ChatGPT-Account-Id': process.env.OPENAI_ACCOUNT_ID } : {}), Accept: 'application/json', Origin: 'https://chatgpt.com', Referer: 'https://chatgpt.com/', 'User-Agent': 'Mozilla/5.0' } });
}
function parseWindow(window) { if (!window) return null; const used = Number(window.used_percent ?? window.usedPercent); return { utilization: Number.isFinite(used) ? used / 100 : null, reset: window.reset_at ? new Date(Number(window.reset_at) * 1000).toISOString() : null, status: window.status || null, duration: Number(window.limit_window_seconds) || null }; }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return reply(res, { error: 'method not allowed' }, 405);
  let accessToken = process.env.OPENAI_ACCESS_TOKEN; const refreshToken = process.env.OPENAI_REFRESH_TOKEN;
  if (!accessToken) return reply(res, { error: 'OPENAI_ACCESS_TOKEN is not configured' }, 500);
  let response = await readUsage(accessToken); let refreshed = false;
  if (response.status === 401 && refreshToken) { try { const next = await refreshAccessToken(refreshToken); accessToken = next.access_token; response = await readUsage(accessToken); refreshed = response.ok; } catch (error) { return reply(res, { error: error.message }, 502); } }
  if (!response.ok) return reply(res, { error: `ChatGPT usage endpoint returned ${response.status}` }, 502);
  const raw = await response.json(); const root = raw.rate_limit || raw.rate_limits || {};
  const candidates = [root.five_hour, root.primary_window, root.primary, root.weekly, root.secondary_window, root.secondary].filter(Boolean).map(parseWindow).filter(Boolean);
  const session = candidates.find(x => x.duration && x.duration < 172800) || candidates[0] || {}; const weekly = candidates.find(x => x.duration && x.duration >= 172800) || candidates[1] || {};
  return reply(res, { sessionUtilization: session.utilization ?? null, sessionReset: session.reset ?? null, sessionStatus: session.status ?? null, weeklyUtilization: weekly.utilization ?? null, weeklyReset: weekly.reset ?? null, weeklyStatus: weekly.status ?? null, refreshed, source: 'chatgpt-wham' });
};
