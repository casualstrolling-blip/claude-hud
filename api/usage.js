export const config = { runtime: 'edge' };

export default async function handler(request) {

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    });
  }

  const TOKEN = process.env.ANTHROPIC_TOKEN;

  if (!TOKEN) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_TOKEN env var not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
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

    // Both 200 and 429 responses include rate-limit headers with live usage data
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

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
