/**
 * ocr-enhanced.js
 * OCR digital reforçado (combina o pipeline Sharp + Tesseract existente
 * com melhorias de pré-processamento inspiradas no adaptive threshold).
 * Pronto para uso no backend Node ou adaptável a Workers (via fetch de serviço Python se necessário).
 */

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

async function preprocessarImagem(buffer) {
  return sharp(buffer)
    .resize({ width: 1400, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(140) // binarização mais agressiva
    .png()
    .toBuffer();
}

async function reconhecerDigitos(imagemTratada) {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7',
  });
  const { data } = await worker.recognize(imagemTratada);
  await worker.terminate();
  return data.text.trim();
}

function extrairLeitura(texto) {
  const candidatos = texto.match(/\d{3,8}/g);
  if (!candidatos || candidatos.length === 0) return null;
  return parseInt(candidatos.sort((a, b) => b.length - a.length)[0], 10);
}

async function lerMedidorDigital(buffer, tipo = 'AGUA') {
  try {
    const tratada = await preprocessarImagem(buffer);
    const texto = await reconhecerDigitos(tratada);
    const leitura = extrairLeitura(texto);

    if (!leitura) {
      return {
        sucesso: false,
        erro: 'Nenhum dígito claro detectado. Tire a foto mais próxima, sem reflexo e com boa luz.',
        textoBruto: texto,
      };
    }

    return {
      sucesso: true,
      tipo,
      leitura,
      textoBruto: texto,
      confianca: String(leitura).length >= 4 ? 'alta' : 'baixa',
    };
  } catch (err) {
    return { sucesso: false, erro: err.message };
  }
}

module.exports = { lerMedidorDigital, preprocessarImagem, extrairLeitura };
