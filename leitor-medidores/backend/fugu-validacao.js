/**
 * fugu-validacao.js
 * Usa o Sakana Fugu (API compatível com OpenAI) como segunda opinião quando
 * o OCR local (Tesseract) devolve confiança baixa — por exemplo, medidor com
 * reflexo, sujeira ou ângulo ruim.
 *
 * Por que só nesse caso: chamar um modelo de IA a cada foto sairia caro e
 * mais lento sem necessidade — o Tesseract já resolve a maioria dos casos
 * bem enquadrados sozinho. O Fugu entra como reforço, não substituição.
 *
 * IMPORTANTE: a chave de API NUNCA fica neste arquivo. Ela deve ser definida
 * como variável de ambiente FUGU_API_KEY no Railway (Settings → Variables).
 * Se você colou sua chave em algum lugar exposto (chat, print de tela,
 * repositório público), gere uma nova em console.sakana.ai e revogue a antiga
 * antes de colocar este código em produção.
 */

const OpenAI = require('openai');

const FUGU_BASE_URL = process.env.FUGU_BASE_URL || 'https://api.sakana.ai/v1';
const FUGU_MODEL = process.env.FUGU_MODEL || 'fugu'; // use 'fugu-ultra' para casos ainda mais difíceis

function getClienteFugu() {
  if (!process.env.FUGU_API_KEY) {
    return null;
  }
  return new OpenAI({
    apiKey: process.env.FUGU_API_KEY,
    baseURL: FUGU_BASE_URL,
  });
}

/**
 * Pede ao Fugu para ler os dígitos da foto, usada como reforço quando o
 * OCR local não teve confiança suficiente.
 * @param {Buffer} imagemBuffer - foto original (sem pré-processamento, o Fugu se vira melhor com a imagem crua)
 * @param {'AGUA'|'ENERGIA'} tipoMedidor
 * @param {string} leituraOcrLocal - o que o Tesseract já leu, como contexto
 */
async function validarComFugu(imagemBuffer, tipoMedidor, leituraOcrLocal) {
  const cliente = getClienteFugu();
  if (!cliente) {
    return { sucesso: false, erro: 'FUGU_API_KEY não configurada — validação extra desativada.' };
  }

  const imagemBase64 = imagemBuffer.toString('base64');
  const unidadeMedidor = tipoMedidor === 'AGUA' ? 'hidrômetro (m³)' : 'medidor de energia (kWh)';

  try {
    const resposta = await cliente.chat.completions.create({
      model: FUGU_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Esta é a foto de um ${unidadeMedidor}. Um OCR local leu o valor "${leituraOcrLocal}", ` +
                `mas com baixa confiança. Observe os dígitos com atenção e responda APENAS em JSON, ` +
                `neste formato exato, sem nenhum texto antes ou depois: ` +
                `{"leitura": <numero_inteiro>, "confianca": "alta"|"media"|"baixa", "observacao": "<breve nota se houver algo incomum>"}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imagemBase64}` },
            },
          ],
        },
      ],
      temperature: 0,
    });

    const textoResposta = resposta.choices[0].message.content.trim();
    const jsonLimpo = textoResposta.replace(/```json|```/g, '').trim();
    const dados = JSON.parse(jsonLimpo);

    return {
      sucesso: true,
      leitura: dados.leitura,
      confianca: dados.confianca,
      observacao: dados.observacao,
      modeloUsado: FUGU_MODEL,
    };
  } catch (erro) {
    return {
      sucesso: false,
      erro: `Falha ao consultar o Fugu: ${erro.message}`,
    };
  }
}

module.exports = { validarComFugu };
