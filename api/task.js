export const config = { runtime: 'edge' };

const SB_URL  = 'https://gtyqozhccwfywkmvkeyz.supabase.co';
const SB_KEY  = process.env.SUPABASE_ANON_KEY;
const HEADERS = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
const CORS    = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type,x-hud-token' } });
  }

  // Auth — protect writes (POST) with x-hud-token
  const HUD_SECRET = process.env.HUD_SECRET;
  if (request.method === 'POST' && HUD_SECRET && request.headers.get('x-hud-token') !== HUD_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const r = await fetch(`${SB_URL}/rest/v1/hud_task_state?id=eq.1`, {
      method: 'PATCH',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
    });
    return new Response(JSON.stringify({ ok: r.ok, status: r.status }), { headers: CORS });
  }

  // GET - return current state
  const r = await fetch(`${SB_URL}/rest/v1/hud_task_state?id=eq.1&select=*`, { headers: HEADERS });
  const data = await r.json();
  return new Response(JSON.stringify(data[0] || { status: 'idle' }), { headers: CORS });
}
