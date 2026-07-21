/**
 * whatsapp.js
 * Envio da fatura calculada para o WhatsApp do proprietário cadastrado,
 * via API oficial do WhatsApp Business (Meta Cloud API).
 *
 * Pré-requisitos reais (não são opcionais):
 * 1. Conta Meta Business verificada
 * 2. Número de telefone comercial cadastrado no WhatsApp Business Platform
 * 3. Token de acesso permanente (gerado no painel developers.facebook.com)
 * 4. Template de mensagem aprovado pela Meta, se for enviar fora da janela de
 *    24h de atendimento (mensagens de fatura recorrentes SEMPRE precisam de
 *    template aprovado — mensagem de texto livre só funciona dentro de 24h
 *    após o cliente ter escrito para o número).
 */

const axios = require('axios');

const WHATSAPP_API_VERSION = 'v20.0';

/**
 * @param {string} idTelefoneWhatsapp - Phone Number ID da Meta (não é o número em si)
 * @param {string} tokenAcesso - token de acesso da API
 * @param {string} numeroCliente - formato internacional, ex: 5562999999999
 * @param {object} dadosFatura - resultado de calcularFatura()
 */
async function enviarFaturaWhatsApp(idTelefoneWhatsapp, tokenAcesso, numeroCliente, dadosFatura) {
  const unidade = dadosFatura.tipo === 'AGUA' ? 'm³' : 'kWh';
  const consumo = dadosFatura.consumo_m3 ?? dadosFatura.consumo_kwh;

  const mensagem =
    `📊 *Resumo da sua Fatura — ${dadosFatura.tipo === 'AGUA' ? 'Água' : 'Energia'}*\n\n` +
    `Consumo registrado: *${consumo} ${unidade}*\n` +
    `Valor total: *R$ ${dadosFatura.total.toFixed(2)}*\n\n` +
    `Leitura feita automaticamente pelo sistema. Qualquer divergência, responda esta mensagem.`;

  try {
    const resposta = await axios.post(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${idTelefoneWhatsapp}/messages`,
      {
        messaging_product: 'whatsapp',
        to: numeroCliente,
        type: 'text',
        text: { body: mensagem },
      },
      {
        headers: {
          Authorization: `Bearer ${tokenAcesso}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return { sucesso: true, idMensagem: resposta.data.messages?.[0]?.id };
  } catch (erro) {
    return {
      sucesso: false,
      erro: erro.response?.data || erro.message,
    };
  }
}

module.exports = { enviarFaturaWhatsApp };
