// Cloudflare Worker — Proxy para Anthropic API + Meta Ads API
// Permite llamadas desde el dashboard en GitHub Pages

const ALLOWED_ORIGIN = 'https://paulete-bb.github.io';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const service = body.service || 'anthropic';

    // ── ANTHROPIC ───────────────────────────────────────────────────────────
    if (service === 'anthropic') {
      if (!env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const { service: _, ...anthropicBody } = body;
      let response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(anthropicBody),
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: `Anthropic unreachable: ${e.message}` }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ── META ADS API ────────────────────────────────────────────────────────
    if (service === 'meta') {
      // tokenKey permite que un cliente use un token de Meta distinto al de
      // Bigbuda (ej. cuando el System User vive en el Business Manager del
      // cliente en vez del de la agencia). Sin tokenKey, se usa META_TOKEN
      // por defecto — comportamiento sin cambios para todos los clientes
      // que no lo necesitan.
      let token = env.META_TOKEN;
      if (body.tokenKey) {
        const safeKey = String(body.tokenKey).toUpperCase().replace(/[^A-Z0-9_]/g, '');
        const secretName = `META_TOKEN_${safeKey}`;
        token = env[secretName];
        if (!token) {
          return new Response(JSON.stringify({ error: `${secretName} not configured` }), {
            status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }
      if (!token) {
        return new Response(JSON.stringify({ error: 'META_TOKEN not configured' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const { endpoint, params = {} } = body;
      if (!endpoint) {
        return new Response(JSON.stringify({ error: 'Missing endpoint' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const qs = new URLSearchParams({ ...params, access_token: token }).toString();
      const url = `https://graph.facebook.com/v19.0${endpoint}?${qs}`;
      let response;
      try {
        response = await fetch(url);
      } catch (e) {
        return new Response(JSON.stringify({ error: `Meta API unreachable: ${e.message}` }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ error: `Unknown service: ${service}` }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
