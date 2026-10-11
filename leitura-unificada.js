/**
 * leitura-unificada.js
 * Módulo unificado: tenta OCR digital e, se falhar ou for analógico, chama detecção de ponteiros.
 * Pronto para Node (usa ocr-enhanced.js + chamada opcional ao Python analog).
 */

const { lerMedidorDigital } = require('./ocr-enhanced');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Chama o script Python de leitura analógica (se existir).
 * @param {string} caminhoImagem
 * @returns {Promise<object>}
 */
function lerAnalogicoPython(caminhoImagem) {
  return new Promise((resolve) => {
    const script = path.join(__dirname, 'analog_meter_reader.py');
    if (!fs.existsSync(script)) {
      return resolve({ sucesso: false, erro: 'Script analógico não encontrado' });
    }
    const py = spawn('python3', [script, caminhoImagem, '4']); // 4 mostradores padrão
    let out = '';
    py.stdout.on('data', (d) => (out += d));
    py.stderr.on('data', (d) => console.error(d.toString()));
    py.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({ sucesso: false, erro: 'Falha ao parsear saída do Python', raw: out });
      }
    });
  });
}

/**
 * Leitura unificada.
 * @param {Buffer} buffer
 * @param {'AGUA'|'ENERGIA'} tipo
 * @param {boolean} forcarAnalogico
 */
async function lerMedidorUnificado(buffer, tipo = 'AGUA', forcarAnalogico = false) {
  // 1. Tenta digital primeiro (mais rápido e preciso em displays LCD)
  if (!forcarAnalogico) {
    const digital = await lerMedidorDigital(buffer, tipo);
    if (digital.sucesso && digital.confianca === 'alta') {
      return { ...digital, metodo: 'digital' };
    }
  }

  // 2. Fallback analógico (salva temp e chama Python)
  const tempPath = path.join('/tmp', `medidor-${Date.now()}.jpg`);
  fs.writeFileSync(tempPath, buffer);
  const analog = await lerAnalogicoPython(tempPath);
  fs.unlinkSync(tempPath);

  if (analog.sucesso) {
    return { ...analog, metodo: 'analogico', tipo };
  }

  return {
    sucesso: false,
    erro: 'Não foi possível ler nem como digital nem como analógico',
    digitalTentado: !forcarAnalogico,
    analogico: analog,
  };
}

module.exports = { lerMedidorUnificado };
