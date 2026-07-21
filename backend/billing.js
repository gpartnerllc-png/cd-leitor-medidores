/**
 * billing.js
 * Cálculo de fatura de água e energia a partir da leitura (atual - anterior).
 *
 * IMPORTANTE: as tarifas por m³/kWh mudam por revisão tarifária (ANEEL para
 * energia, ARSAE/agência reguladora estadual para água) e variam por faixa de
 * consumo (tarifa social, faixas progressivas) e por bandeira tarifária mensal
 * no caso de energia. Os valores abaixo são PLACEHOLDERS estruturais — antes de
 * usar em produção, substitua `tarifasConfig` pelos valores oficiais vigentes
 * publicados pela Saneago e pela Equatorial Goiás (ambos divulgam tabelas
 * tarifárias públicas atualizadas). Deixei a estrutura pronta para faixas
 * progressivas, que é como as duas empresas realmente cobram.
 */

const tarifasConfig = {
  AGUA: {
    // Faixas progressivas por m³ (exemplo estrutural — confirme os valores oficiais)
    faixas: [
      { ate: 10, valorM3: 3.20 },
      { ate: 15, valorM3: 5.80 },
      { ate: 25, valorM3: 8.10 },
      { ate: Infinity, valorM3: 10.50 },
    ],
    percentualEsgoto: 0.80, // esgoto = 80% do valor de água, padrão comum no setor
  },
  ENERGIA: {
    faixas: [
      { ate: Infinity, valorKwh: 0.85 },
    ],
    taxaIluminacaoPublica: 15.00,
    bandeiraTarifaria: {
      // custo adicional por 100 kWh, conforme bandeira vigente no mês
      verde: 0,
      amarela: 1.885,
      vermelha1: 4.463,
      vermelha2: 7.877,
    },
  },
};

/**
 * Calcula valor total aplicando tarifa progressiva por faixas.
 */
function calcularPorFaixas(consumo, faixas, campoValor) {
  let restante = consumo;
  let anterior = 0;
  let total = 0;
  const detalhePorFaixa = [];

  for (const faixa of faixas) {
    if (restante <= 0) break;
    const larguraFaixa = faixa.ate - anterior;
    const consumoNaFaixa = Math.min(restante, larguraFaixa);
    const valorFaixa = consumoNaFaixa * faixa[campoValor];

    detalhePorFaixa.push({
      faixaAte: faixa.ate,
      consumoNaFaixa,
      valorUnitario: faixa[campoValor],
      subtotal: Number(valorFaixa.toFixed(2)),
    });

    total += valorFaixa;
    restante -= consumoNaFaixa;
    anterior = faixa.ate;
  }

  return { total, detalhePorFaixa };
}

/**
 * @param {number} leituraAtual
 * @param {number} leituraAnterior
 * @param {'AGUA'|'ENERGIA'} tipo
 * @param {object} opcoes - { bandeira?: 'verde'|'amarela'|'vermelha1'|'vermelha2' }
 */
function calcularFatura(leituraAtual, leituraAnterior, tipo, opcoes = {}) {
  const consumo = leituraAtual - leituraAnterior;

  if (consumo < 0) {
    return {
      sucesso: false,
      erro: 'Leitura atual menor que a anterior. Verifique se o medidor foi trocado ' +
            'ou se houve erro de leitura antes de faturar.',
    };
  }

  if (tipo === 'AGUA') {
    const { faixas, percentualEsgoto } = tarifasConfig.AGUA;
    const { total: valorAgua, detalhePorFaixa } = calcularPorFaixas(consumo, faixas, 'valorM3');
    const valorEsgoto = valorAgua * percentualEsgoto;
    const total = valorAgua + valorEsgoto;

    return {
      sucesso: true,
      tipo,
      consumo_m3: consumo,
      detalhePorFaixa,
      valor_agua: Number(valorAgua.toFixed(2)),
      valor_esgoto: Number(valorEsgoto.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  if (tipo === 'ENERGIA') {
    const { faixas, taxaIluminacaoPublica, bandeiraTarifaria } = tarifasConfig.ENERGIA;
    const { total: valorEnergiaBase, detalhePorFaixa } = calcularPorFaixas(consumo, faixas, 'valorKwh');

    const bandeira = opcoes.bandeira || 'verde';
    const custoBandeira = ((bandeiraTarifaria[bandeira] || 0) / 100) * consumo;

    const total = valorEnergiaBase + custoBandeira + taxaIluminacaoPublica;

    return {
      sucesso: true,
      tipo,
      consumo_kwh: consumo,
      detalhePorFaixa,
      bandeira_aplicada: bandeira,
      valor_energia: Number(valorEnergiaBase.toFixed(2)),
      custo_bandeira: Number(custoBandeira.toFixed(2)),
      taxa_iluminacao_publica: taxaIluminacaoPublica,
      total: Number(total.toFixed(2)),
    };
  }

  return { sucesso: false, erro: `Tipo de medidor desconhecido: ${tipo}` };
}

module.exports = { calcularFatura, tarifasConfig };
