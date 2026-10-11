/**
 * worker.js
 * Worker puro (sem Hono) — evita o erro de autoconfig do Cloudflare Builds.
 * Coloque na raiz do repositório.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Rota raiz
    if (path === '/' && request.method === 'GET') {
      return json({
        status: 'ok',
        servico: 'Seter Pro · Leitura de Medidores',
        versao: '2.0',
        endpoints: ['/api/login', '/api/ler-medidor', '/webhook/whatsapp'],
      }, corsHeaders);
    }

    // Login
    if (path === '/api/login' && request.method === 'POST') {
      const { usuarioId } = await request.json().catch(() => ({}));
      if (!usuarioId) return json({ erro: 'usuarioId obrigatório' }, corsHeaders, 400);

      const secret = env.JWT_SECRET || 'dev-secret';
      const payload = { usuarioId, exp: Math.floor(Date.now() / 1000) + 900 };
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
      const body = btoa(JSON.stringify(payload)).replace(/=/g, '');
      const data = `${header}.${body}`;

      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
      const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      return json({ token: `${data}.${signature}` }, corsHeaders);
    }

    // Leitura
    if (path === '/api/ler-medidor' && request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      if (!form) return json({ erro: 'FormData inválido' }, corsHeaders, 400);

      const tipo = form.get('tipo');
      const leituraAnterior = Number(form.get('leituraAnterior') || 0);

      if (!['AGUA', 'ENERGIA'].includes(tipo)) {
        return json({ erro: 'tipo inválido' }, corsHeaders, 400);
      }

      const leitura = 1248; // placeholder
      const consumo = leitura - leituraAnterior;

      return json({
        leitura: { sucesso: true, leitura, confianca: 'alta', metodo: 'placeholder' },
        fatura: {
          tipo,
          consumo,
          total: tipo === 'AGUA' ? consumo * 8.5 : consumo * 0.89,
        },
      }, corsHeaders);
    }

    // Webhook WhatsApp
    if (path === '/webhook/whatsapp' && request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === (env.WHATSAPP_VERIFY_TOKEN || 'meu-token')) {
        return new Response(challenge, { headers: corsHeaders });
      }
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    if (path === '/webhook/whatsapp' && request.method === 'POST') {
      return new Response('OK', { headers: corsHeaders });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};

function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
