/**
 * ocr-digital.js
 * Leitura de medidores DIGITAIS (visor de LCD/mecânico com dígitos em janela)
 * Estratégia: pré-processamento de imagem (o que mais aumenta a acurácia do OCR,
 * segundo a literatura: normalização de contraste + binarização + recorte da região
 * de dígitos) e depois OCR com Tesseract.js.
 *
 * Para produção real, o ideal é treinar uma CNN específica de dígitos de medidor
 * (dataset próprio de fotos da Saneago/Equatorial) — Tesseract genérico chega a
 * ~85-95% de acerto; uma CNN dedicada chega a ~97%. Este módulo já deixa o ponto
 * de troca isolado (função `reconhecerDigitos`) para você plugar um modelo próprio
 * depois, sem mudar o resto do pipeline.
 */

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

/**
 * Pré-processa a imagem para maximizar contraste dos dígitos.
 * @param {Buffer} imagemBuffer
 * @returns {Promise<Buffer>} imagem tratada em PNG
 */
async function preprocessarImagem(imagemBuffer) {
  return sharp(imagemBuffer)
    .resize({ width: 1200, withoutEnlargement: false }) // padroniza resolução
    .grayscale()                                        // remove cor, foca em forma
    .normalize()                                         // estica o contraste
    .threshold(150)                                      // binariza (preto/branco)
    .sharpen()
    .png()
    .toBuffer();
}

/**
 * Roda o OCR e filtra apenas sequências numéricas plausíveis de leitura.
 * @param {Buffer} imagemTratada
 * @returns {Promise<string>} dígitos brutos reconhecidos
 */
async function reconhecerDigitos(imagemTratada) {
  const worker = await createWorker('eng'); // dígitos independem de idioma
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.,',
    tessedit_pageseg_mode: '7', // trata a imagem como uma única linha de texto
  });

  const { data } = await worker.recognize(imagemTratada);
  await worker.terminate();

  return data.text.trim();
}

/**
 * Extrai o valor de leitura mais provável de um texto OCR bruto.
 * Medidores geralmente mostram 4 a 6 dígitos "inteiros" e às vezes 1-2 decimais
 * em vermelho (que representam litros/frações — normalmente NÃO entram na conta).
 */
function extrairLeitura(textoOcr) {
  const candidatos = textoOcr.match(/\d{3,7}/g);
  if (!candidatos || candidatos.length === 0) {
    return null;
  }
  // Assume o maior agrupamento de dígitos contíguos como a leitura principal
  const leitura = candidatos.sort((a, b) => b.length - a.length)[0];
  return parseInt(leitura, 10);
}

/**
 * Função principal: recebe a foto (buffer) e o tipo de medidor, devolve a leitura.
 * @param {Buffer} imagemBuffer - foto tirada pelo usuário
 * @param {'AGUA'|'ENERGIA'} tipoMedidor
 */
async function lerMedidorDigital(imagemBuffer, tipoMedidor) {
  const imagemTratada = await preprocessarImagem(imagemBuffer);
  const textoOcr = await reconhecerDigitos(imagemTratada);
  const leitura = extrairLeitura(textoOcr);

  if (leitura === null) {
    return {
      sucesso: false,
      erro: 'Não foi possível identificar os dígitos. Peça para o usuário tirar a foto mais de perto, sem reflexo no visor, e com boa iluminação.',
      textoOcrBruto: textoOcr,
    };
  }

  return {
    sucesso: true,
    tipoMedidor,
    leitura,
    textoOcrBruto: textoOcr,
    confiancaEstimada: textoOcr.replace(/\D/g, '').length >= 4 ? 'alta' : 'baixa',
  };
}

module.exports = { lerMedidorDigital, preprocessarImagem, extrairLeitura };
