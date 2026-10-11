/**
 * worker.js
 * Versão do servidor adaptada para Cloudflare Workers usando Hono.
 * Deploy: wrangler deploy
 *
 * Dependências no wrangler.toml:
 * compatibility_date = "2024-10-01"
 * [vars] ou secrets para JWT_SECRET, WHATSAPP_*, LLM_API_KEY
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

const app = new Hono();

app.use('*', cors());

// Middleware JWT simples
const auth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ erro: 'Token ausente' }, 401);
  try {
    const payload = await jwt.verify(token, c.env.JWT_SECRET);
    c.set('usuario', payload);
    await next();
  } catch {
    return c.json({ erro: 'Token inválido' }, 401);
  }
};

// Login
app.post('/api/login', async (c) => {
  const { usuarioId } = await c.req.json();
  if (!usuarioId) return c.json({ erro: 'usuarioId obrigatório' }, 400);
  const token = await jwt.sign({ usuarioId }, c.env.JWT_SECRET, { expiresIn: '15m' });
  return c.json({ token });
});

// Leitura (recebe FormData com foto)
app.post('/api/ler-medidor', auth, async (c) => {
  const form = await c.req.formData();
  const foto = form.get('foto');
  const tipo = form.get('tipo');
  const leituraAnterior = Number(form.get('leituraAnterior') || 0);
  const idMedidor = form.get('idMedidor') || 'desconhecido';
  const hashAnterior = form.get('hashAnterior') || 'genesis';

  if (!foto || !['AGUA', 'ENERGIA'].includes(tipo)) {
    return c.json({ erro: 'Dados inválidos' }, 400);
  }

  // Em Workers, OCR pesado (Sharp/Tesseract) deve ser feito em um serviço externo
  // ou via AI (Workers AI / external OCR API). Aqui é um stub que você troca.
  const buffer = await foto.arrayBuffer();
  // TODO: chamar serviço de OCR (ex: seu Node antigo, ou API de visão)
  const leitura = 1248; // placeholder — substitua pela chamada real de OCR
  const confianca = 'alta';

  if (leitura < leituraAnterior) {
    return c.json({ erro: 'Leitura menor que anterior', leitura }, 422);
  }

  const consumo = leitura - leituraAnterior;
  if (leituraAnterior > 0 && consumo > leituraAnterior * 1.5) {
    return c.json({ status: 'REVISAO_REQUERIDA', leitura, consumo }, 202);
  }

  // Billing (importe a função do seu billing.js ou reimplemente)
  const fatura = {
    sucesso: true,
    tipo,
    consumo,
    total: tipo === 'AGUA' ? consumo * 8.5 : consumo * 0.89,
  };

  // Assinatura (crypto nativo do Workers)
  const payload = JSON.stringify({
    idMedidor,
    leituraAtual: leitura,
    timestamp: Date.now(),
    hashAnterior,
  });
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const assinatura = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return c.json({
    leitura: { sucesso: true, leitura, confianca },
    fatura,
    assinatura,
    hashParaProxima: assinatura,
  });
});

// WhatsApp template
app.post('/api/enviar-whatsapp', auth, async (c) => {
  const { numeroCliente, fatura } = await c.req.json();
  const phoneId = c.env.WHATSAPP_PHONE_ID;
  const token = c.env.WHATSAPP_TOKEN;

  const body = {
    messaging_product: 'whatsapp',
    to: numeroCliente,
    type: 'template',
    template: {
      name: 'fatura_resumo',
      language: { code: 'pt_BR' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: String(fatura.consumo) },
          { type: 'text', text: fatura.tipo === 'AGUA' ? 'm³' : 'kWh' },
          { type: 'text', text: Number(fatura.total).toFixed(2) },
        ],
      }],
    },
  };

  const res = await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return c.json({ sucesso: res.ok, data });
});

// Webhook WhatsApp
app.get('/webhook/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  if (mode === 'subscribe' && token === c.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge);
  }
  return c.text('Forbidden', 403);
});

app.post('/webhook/whatsapp', async (c) => {
  const payload = await c.req.json();
  // Processar mensagem com IA (chamar LLM externo)
  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message?.type === 'text') {
    // TODO: chamar LLM e responder
    console.log('Mensagem recebida:', message.text.body);
  }
  return c.text('OK');
});

export default app;
