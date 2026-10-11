/**
 * worker.js
 * Worker mínimo funcional para Cloudflare.
 * Coloque na raiz do repositório.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

// Rota raiz (evita 404)
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    servico: 'Seter Pro · Leitura de Medidores',
    versao: '2.0',
    endpoints: ['/api/login', '/api/ler-medidor', '/api/enviar-whatsapp', '/webhook/whatsapp'],
  });
});

// Login simples (JWT manual com Web Crypto)
app.post('/api/login', async (c) => {
  const { usuarioId } = await c.req.json();
  if (!usuarioId) return c.json({ erro: 'usuarioId obrigatório' }, 400);

  const secret = c.env.JWT_SECRET || 'dev-secret';
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
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return c.json({ token: `${data}.${signature}` });
});

// Leitura (placeholder — OCR real deve ficar em serviço Node externo)
app.post('/api/ler-medidor', async (c) => {
  const form = await c.req.formData();
  const tipo = form.get('tipo');
  const leituraAnterior = Number(form.get('leituraAnterior') || 0);

  if (!['AGUA', 'ENERGIA'].includes(tipo)) {
    return c.json({ erro: 'tipo inválido' }, 400);
  }

  // Placeholder de leitura
  const leitura = 1248;
  const consumo = leitura - leituraAnterior;

  return c.json({
    leitura: { sucesso: true, leitura, confianca: 'alta', metodo: 'placeholder' },
    fatura: {
      tipo,
      consumo,
      total: tipo === 'AGUA' ? consumo * 8.5 : consumo * 0.89,
    },
  });
});

// Webhook WhatsApp
app.get('/webhook/whatsapp', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  if (mode === 'subscribe' && token === (c.env.WHATSAPP_VERIFY_TOKEN || 'meu-token')) {
    return c.text(challenge);
  }
  return c.text('Forbidden', 403);
});

app.post('/webhook/whatsapp', async (c) => {
  return c.text('OK');
});

export default app;
