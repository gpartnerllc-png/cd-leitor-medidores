/**
 * worker.js
 * Worker puro (sem Hono) — Seter Pro · Dael Engine + Asaas Proxy Suite + Cloudflare D1 Universal DB
 * Salve este código na raiz do seu repositório Cloudflare Worker.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, access_token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Rota raiz
    if (path === '/' && request.method === 'GET') {
      return json({
        status: 'ok',
        servico: 'Seter Pro · Leitura de Medidores & Asaas Gateway Suite',
        versao: '2.5',
        endpoints: [
          '/api/login', 
          '/api/ler-medidor', 
          '/webhook/whatsapp',
          '/api/unidades',
          '/api/historico',
          '/api/configuracoes',
          '/api/asaas/*' // Proxy seguro para toda a suíte Asaas Sandbox
        ],
      }, corsHeaders);
    }

    // Login (JWT)
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

    // Leitura de Medidores (OCR / Manual)
    if (path === '/api/ler-medidor' && request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      if (!form) return json({ erro: 'FormData inválido' }, corsHeaders, 400);

      const tipo = form.get('tipo');
      const leituraAnterior = Number(form.get('leituraAnterior') || 0);

      if (!['AGUA', 'ENERGIA'].includes(tipo)) {
        return json({ erro: 'tipo inválido' }, corsHeaders, 400);
      }

      const leitura = 1248; // placeholder IA
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

    // Webhook WhatsApp (Verificação e Eventos)
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

    // =========================================================================
    // CLOUDFLARE D1 DATABASE: UNIDADES E MEDIDORES (Sincronização Universal)
    // =========================================================================
    if (path === '/api/unidades' && request.method === 'GET') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const { results } = await env.DB.prepare("SELECT * FROM unidades ORDER BY id DESC").all();
        return json(results, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    if (path === '/api/unidades' && request.method === 'POST') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const d = await request.json();
        await env.DB.prepare(`
          INSERT INTO unidades (nome, tipo, uc, numMedidor, padrao, doc, email, whats, empresaAgua, empresaEnergia, tarifaAgua, tarifaEnergia, cosip)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          d.nome || '', d.tipo || 'AGUA', d.uc || '', d.numMedidor || '', d.padrao || 'analogico', 
          d.doc || '', d.email || '', d.whats || '', d.empresaAgua || '', d.empresaEnergia || '', 
          d.tarifaAgua || 8.42, d.tarifaEnergia || 0.892, d.cosip || 16.56
        ).run();
        return json({ sucesso: true }, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    if (path.startsWith('/api/unidades/') && request.method === 'DELETE') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const id = path.split('/').pop();
        await env.DB.prepare("DELETE FROM unidades WHERE id = ?").bind(id).run();
        return json({ sucesso: true }, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    // =========================================================================
    // CLOUDFLARE D1 DATABASE: HISTÓRICO DE LEITURAS (Sincronização Universal)
    // =========================================================================
    if (path === '/api/historico' && request.method === 'GET') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const { results } = await env.DB.prepare("SELECT * FROM historico ORDER BY id DESC").all();
        return json(results, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    if (path === '/api/historico' && request.method === 'POST') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const h = await request.json();
        await env.DB.prepare(`
          INSERT INTO historico (data, medidor, tipo, anterior, leitura, consumo, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          h.data || new Date().toISOString(), 
          h.medidor || '', 
          h.tipo || 'AGUA', 
          h.anterior || 0, 
          h.leitura || 0, 
          h.consumo || 0, 
          h.total || 0
        ).run();
        return json({ sucesso: true }, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    if (path.startsWith('/api/historico/') && request.method === 'DELETE') {
      try {
        if (!env.DB) return json({ erro: 'Banco de dados D1 (DB) não associado no Cloudflare Worker.' }, corsHeaders, 500);
        const id = path.split('/').pop();
        await env.DB.prepare("DELETE FROM historico WHERE id = ?").bind(id).run();
        return json({ sucesso: true }, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    // =========================================================================
    // CLOUDFLARE D1 DATABASE: CONFIGURAÇÕES GLOBAIS (Banco Inter, Asaas, WhatsApp)
    // =========================================================================
    if (path === '/api/configuracoes' && request.method === 'GET') {
      try {
        if (!env.DB) return json({ erro: 'Banco D1 não associado' }, corsHeaders, 500);
        const { results } = await env.DB.prepare("SELECT * FROM configuracoes").all();
        const configMap = {};
        results.forEach(r => configMap[r.chave] = r.valor);
        return json(configMap, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    if (path === '/api/configuracoes' && request.method === 'POST') {
      try {
        if (!env.DB) return json({ erro: 'Banco D1 não associado' }, corsHeaders, 500);
        const d = await request.json();
        for (const [chave, valor] of Object.entries(d)) {
          await env.DB.prepare(`
            INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
            ON CONFLICT(chave) DO UPDATE SET valor = ?
          `).bind(chave, valor, valor).run();
        }
        return json({ sucesso: true }, corsHeaders);
      } catch (e) {
        return json({ erro: e.message }, corsHeaders, 500);
      }
    }

    // =========================================================================
    // PROXY SEGURO PARA A API DO ASAAS SANDBOX
    // =========================================================================
    if (path.startsWith('/api/asaas/')) {
      const asaasPath = path.replace('/api/asaas', '');
      const asaasUrl = `https://api-sandbox.asaas.com/v3${asaasPath}${url.search}`;

      // Tenta buscar a API Key gravada no banco D1 se existir, senão usa o Secret do Worker
      let apiKey = env.ASAAS_API_KEY || '';
      try {
        if (env.DB) {
          const cfg = await env.DB.prepare("SELECT valor FROM configuracoes WHERE chave = 'asaas_api_key'").first();
          if (cfg && cfg.valor) apiKey = cfg.valor;
        }
      } catch(err) {}

      const asaasHeaders = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'access_token': apiKey,
        'User-Agent': 'SeterProDaelEngine/1.0.0'
      };

      const init = {
        method: request.method,
        headers: asaasHeaders,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.text();
      }

      try {
        const asaasResponse = await fetch(asaasUrl, init);
        const responseBody = await asaasResponse.text();

        return new Response(responseBody, {
          status: asaasResponse.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (err) {
        return json({ erro: 'Falha na comunicação com o Asaas Sandbox', detalhes: err.message }, corsHeaders, 500);
      }
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
