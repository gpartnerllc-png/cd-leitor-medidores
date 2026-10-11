/**
 * crypto-medidor.js
 * Assinatura imutável estilo ledger (SHA-256 encadeado) para cada leitura.
 * Garante auditoria anti-adulteração.
 */

const crypto = require('crypto');

function gerarAssinaturaImutavel(dados) {
  const payload = JSON.stringify({
    idMedidor: dados.idMedidor,
    leituraAtual: dados.leituraAtual,
    idLeiturista: dados.idLeiturista || 'app',
    timestamp: dados.timestamp || Date.now(),
    hashAnterior: dados.hashAnterior || 'genesis',
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function verificarIntegridade(dados, hashRegistrado) {
  return gerarAssinaturaImutavel(dados) === hashRegistrado;
}

module.exports = { gerarAssinaturaImutavel, verificarIntegridade };
