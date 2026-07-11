export const config = { runtime: 'edge' };

const SB_URL = 'https://gtyqozhccwfywkmvkeyz.supabase.co';
const CORS   = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST')
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: CORS });

  let payload;
  try { payload = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: CORS });
  }

  const type = payload.type;
  const dep  = payload.payload?.deployment || {};
  const SB_KEY = process.env.SUPABASE_ANON_KEY;

  let state;

  if (type === 'deployment.building') {
    state = {
      status:      'running',
      task_name:   (dep.name || 'vercel') + ' deploying…',
      step_text:   'build in progress',
      step_num:    1,
      total_steps: 2,
      updated_at:  new Date().toISOString()
    };
  } else if (type === 'deployment.ready') {
    state = {
      status:      'deployed',
      task_name:   (dep.name || 'vercel') + ' deployed',
      step_text:   dep.url ? 'https://' + dep.url.replace(/^https?:\/\//, '') : 'claude-hud.vercel.app',
      step_num:    2,
      total_steps: 2,
      updated_at:  new Date().toISOString()
    };
  } else if (type === 'deployment.error') {
    state = {
      status:      'deploy_error',
      task_name:   (dep.name || 'vercel') + ' failed',
      step_text:   'deployment error',
      step_num:    1,
      total_steps: 1,
      updated_at:  new Date().toISOString()
    };
  } else {
    return new Response(JSON.stringify({ ok: true, ignored: type }), { headers: CORS });
  }

  const r = await fetch(`${SB_URL}/rest/v1/hud_task_state?id=eq.1`, {
    method:  'PATCH',
    headers: {
      apikey:         SB_KEY,
      Authorization:  `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal'
    },
    body: JSON.stringify(state)
  });

  return new Response(JSON.stringify({ ok: true, status: r.status, type }), { headers: CORS });
}
