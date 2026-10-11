/**
 * whatsapp.js
 * Envio de fatura via WhatsApp Cloud API (templates oficiais) +
 * webhook para respostas com IA (dentro da janela de 24h).
 *
 * Variáveis de ambiente necessárias:
 * WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN
 * LLM_API_KEY (opcional — Grok, OpenAI, Gemini etc.)
 */

const axios = require('axios');

const API_VERSION = 'v23.0';

async function enviarFaturaTemplate(phoneId, token, numero, dados) {
  const unidade = dados.tipo === 'AGUA' ? 'm³' : 'kWh';
  const consumo = dados.consumo ?? dados.consumo_m3 ?? dados.consumo_kwh ?? 0;

  try {
    const res = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: 'fatura_resumo', // crie e aprove este template na Meta
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(consumo) },
                { type: 'text', text: unidade },
                { type: 'text', text: Number(dados.total).toFixed(2) },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return { sucesso: true, id: res.data.messages?.[0]?.id };
  } catch (err) {
    return { sucesso: false, erro: err.response?.data || err.message };
  }
}

// Fallback para texto livre (só dentro da janela de 24h)
async function enviarTextoLivre(phoneId, token, numero, mensagem) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: mensagem },
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return { sucesso: true, id: res.data.messages?.[0]?.id };
  } catch (err) {
    return { sucesso: false, erro: err.response?.data || err.message };
  }
}

/**
 * Webhook de IA — responde mensagens recebidas usando um LLM.
 * Dentro da janela de 24h você pode responder livremente.
 */
async function processarWebhookIA(payload, phoneId, token, llmApiKey) {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (!message || message.type !== 'text') return { ignorado: true };

  const from = message.from;
  const textoUsuario = message.text.body;

  // Exemplo simples de chamada a LLM (substitua pela API real: Grok, OpenAI, Gemini...)
  let respostaIA = 'Obrigado pelo contato. Sua fatura foi processada. Qualquer dúvida, estou à disposição.';
  if (llmApiKey) {
    try {
      // Placeholder — adapte para a API do seu LLM preferido
      const llmRes = await axios.post(
        'https://api.x.ai/v1/chat/completions', // exemplo Grok
        {
          model: 'grok-beta',
          messages: [
            { role: 'system', content: 'Você é um assistente de faturas de água e energia. Seja claro, educado e objetivo.' },
            { role: 'user', content: textoUsuario },
          ],
        },
        { headers: { Authorization: `Bearer ${llmApiKey}` } }
      );
      respostaIA = llmRes.data.choices?.[0]?.message?.content || respostaIA;
    } catch (e) {
      console.error('Erro LLM:', e.message);
    }
  }

  return enviarTextoLivre(phoneId, token, from, respostaIA);
}

module.exports = {
  enviarFaturaTemplate,
  enviarTextoLivre,
  processarWebhookIA,
};
