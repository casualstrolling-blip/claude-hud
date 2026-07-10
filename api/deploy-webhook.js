export const config = { runtime: 'edge' };

const SB_URL = 'https://gtyqozhccwfywkmvkeyz.supabase.co';
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    }});
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  // Verify Vercel webhook signature
  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get('x-vercel-signature');
    if (!sig) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401, headers: CORS });
    }
    const body = await request.clone().text();
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (sig !== expected) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: CORS });
    }
  }

  const payload = await request.json();
  const type = payload.type;
  const deployment = payload.payload?.deployment || payload.deployment || {};
  const url = deployment.url || deployment.alias?.[0] || '';
  const name = deployment.name || 'claude-hud';

  // Only act on ready/error events for this project
  if (!['deployment.ready', 'deployment.error', 'deployment.canceled'].includes(type)) {
    return new Response(JSON.stringify({ ok: true, ignored: type }), { headers: CORS });
  }

  const SB_KEY = process.env.SUPABASE_ANON_KEY;
  const sbHeaders = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  let status, taskName, stepText;

  if (type === 'deployment.ready') {
    status = 'deployed';
    taskName = name + ' deployed';
    stepText = url ? 'https://' + url : 'deployment ready';
  } else {
    status = 'deploy_error';
    taskName = name + ' deploy failed';
    stepText = type === 'deployment.canceled' ? 'deployment canceled' : 'deployment error';
  }

  const r = await fetch(SB_URL + '/rest/v1/hud_task_state?id=eq.1', {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify({
      status,
      task_name: taskName,
      step_text: stepText,
      step_num: 1,
      total_steps: 1,
      updated_at: new Date().toISOString()
    })
  });

  return new Response(JSON.stringify({ ok: r.ok, status: r.status, type }), { headers: CORS });
}
