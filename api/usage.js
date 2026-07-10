export const config = { runtime: 'edge' };

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};

export default async function handler(request) {

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'x-hud-token',
      }
    });
  }

  // Auth — require x-hud-token if HUD_SECRET env var is set
  const HUD_SECRET = process.env.HUD_SECRET;
  if (HUD_SECRET && request.headers.get('x-hud-token') !== HUD_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: CORS
    });
  }

  const TOKEN = process.env.ANTHROPIC_TOKEN;
  if (!TOKEN) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_TOKEN env var not set' }), {
      status: 500, headers: CORS
    });
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.0.37',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'x' }]
      })
    });

    const data = {
      sessionUtilization: resp.headers.get('anthropic-ratelimit-unified-5h-utilization'),
      sessionReset:       resp.headers.get('anthropic-ratelimit-unified-5h-reset'),
      sessionStatus:      resp.headers.get('anthropic-ratelimit-unified-5h-status'),
      weeklyUtilization:  resp.headers.get('anthropic-ratelimit-unified-7d-utilization'),
      weeklyReset:        resp.headers.get('anthropic-ratelimit-unified-7d-reset'),
      weeklyStatus:       resp.headers.get('anthropic-ratelimit-unified-7d-status'),
      overallStatus:      resp.headers.get('anthropic-ratelimit-unified-status'),
      httpStatus:         resp.status
    };

    return new Response(JSON.stringify(data), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: CORS
    });
  }
}
