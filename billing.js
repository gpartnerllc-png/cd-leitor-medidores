/**
 * billing.js
 * Cálculo unificado de fatura de água e energia.
 * Tarifas baseadas nos dados originais do repositório (Saneago 2026 + Equatorial).
 * Pronto para Node ou Workers (sem dependências).
 */

const perfisAgua = {
  'GO-SANEAGO': {
    nome: 'Saneago (Goiás)',
    categorias: {
      residencial: {
        tarifaBasicaMensal: 17.46,
        faixas: [
          { ate: 10, valorM3: 5.77, valorEsgotoM3: 5.76 },
          { ate: 15, valorM3: 6.51, valorEsgotoM3: 6.51 },
          { ate: 20, valorM3: 7.45, valorEsgotoM3: 7.45 },
          { ate: 25, valorM3: 8.45, valorEsgotoM3: 8.45 },
          { ate: 30, valorM3: 9.54, valorEsgotoM3: 9.54 },
          { ate: 40, valorM3: 10.89, valorEsgotoM3: 10.89 },
          { ate: 50, valorM3: 12.33, valorEsgotoM3: 12.33 },
          { ate: Infinity, valorM3: 14.06, valorEsgotoM3: 14.06 },
        ],
      },
    },
  },
};

const perfisEnergia = {
  'GO-EQUATORIAL': {
    nome: 'Equatorial Goiás',
    valorKwh: 0.891,
    taxaIluminacaoPublica: 15.0,
    bandeiras: { verde: 0, amarela: 1.885, vermelha1: 4.463, vermelha2: 7.877 },
  },
};

function calcularFaturaAgua(consumo, categoria = 'residencial', perfil = 'GO-SANEAGO') {
  const p = perfisAgua[perfil]?.categorias[categoria];
  if (!p) return { sucesso: false, erro: 'Perfil/categoria inválido' };

  let total = p.tarifaBasicaMensal;
  let restante = consumo;
  let anterior = 0;

  for (const faixa of p.faixas) {
    const limite = faixa.ate === Infinity ? restante : Math.min(restante, faixa.ate - anterior);
    if (limite <= 0) break;
    total += limite * (faixa.valorM3 + faixa.valorEsgotoM3);
    restante -= limite;
    anterior = faixa.ate;
    if (restante <= 0) break;
  }

  return {
    sucesso: true,
    tipo: 'AGUA',
    consumo_m3: consumo,
    total: Number(total.toFixed(2)),
    perfil,
    categoria,
  };
}

function calcularFaturaEnergia(consumo, bandeira = 'verde', perfil = 'GO-EQUATORIAL') {
  const p = perfisEnergia[perfil];
  if (!p) return { sucesso: false, erro: 'Perfil inválido' };

  const valorEnergia = consumo * p.valorKwh;
  const adicionalBandeira = (p.bandeiras[bandeira] || 0) * (consumo / 100); // por 100 kWh
  const total = valorEnergia + adicionalBandeira + p.taxaIluminacaoPublica;

  return {
    sucesso: true,
    tipo: 'ENERGIA',
    consumo_kwh: consumo,
    total: Number(total.toFixed(2)),
    bandeira,
    perfil,
  };
}

function calcularFatura(leituraAtual, leituraAnterior, tipo, opts = {}) {
  const consumo = Math.max(0, leituraAtual - (leituraAnterior || 0));
  if (tipo === 'AGUA') {
    return calcularFaturaAgua(consumo, opts.categoria || 'residencial', opts.perfil || 'GO-SANEAGO');
  }
  if (tipo === 'ENERGIA') {
    return calcularFaturaEnergia(consumo, opts.bandeira || 'verde', opts.perfil || 'GO-EQUATORIAL');
  }
  return { sucesso: false, erro: 'Tipo inválido' };
}

module.exports = { calcularFatura, calcularFaturaAgua, calcularFaturaEnergia };
