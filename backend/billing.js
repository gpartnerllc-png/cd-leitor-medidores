/**
 * billing.js
 * Cálculo de fatura de água e energia a partir da leitura (atual - anterior).
 *
 * FONTE DOS DADOS DE ÁGUA (Saneago/Goiás):
 * Resolução Conjunta Nº 1/2026/AGR/GESG-06064 - AGR/AMAE, assinada em 25-26/02/2026,
 * vigente a partir de 1º de abril de 2026, reajuste linear de 4,845%.
 * Documento oficial (SEI/GOVERNADORIA nº 86760411), verificável em:
 * http://sei.go.gov.br/sei/controlador_externo.php?acao=documento_conferir&id_orgao_acesso_externo=1
 * (código verificador 86760411, código CRC F53A80AF)
 *
 * Tabela extraída ipsis litteris do Anexo Único dessa resolução — CONFIRMADA por
 * duas cópias do mesmo documento oficial (SEI nº 86760411). Inclui TODAS as
 * faixas de consumo residencial (normal e social) e as categorias comercial,
 * industrial e pública, exatamente como publicadas — nenhuma faixa aqui é
 * suposição ou fallback por falta de dado.
 *
 * FONTE DOS DADOS DE ENERGIA (Equatorial Goiás):
 * Ainda é uma aproximação (R$/kWh convencional levantado de fontes secundárias) —
 * não tenho a Resolução Homologatória da ANEEL com o valor exato em mãos ainda.
 * Se você tiver o PDF dela como teve o da Saneago, me manda que eu deixo tão
 * preciso quanto a parte de água ficou agora.
 *
 * Estrutura por PERFIL (estado + empresa) — pensada pra você adicionar outras
 * concessionárias do Brasil depois sem reescrever a lógica de cálculo.
 */

const perfisAgua = {
  'GO-SANEAGO': {
    nome: 'Saneago (Goiás)',
    fonte: 'Resolução Conjunta Nº 1/2026/AGR/GESG-06064 - AGR/AMAE (vigente 01/04/2026)',
    atualizadoEm: '2026-04-01',
    categorias: {
      // Cada faixa já traz o valor de esgoto (coleta + tratamento somados)
      // exatamente como consta no Anexo Único da resolução.
      residencial: {
        tarifaBasicaMensal: 17.46,
        faixas: [
          { ate: 10, valorM3: 5.77, valorEsgotoM3: 4.61 + 1.15 },
          { ate: 15, valorM3: 6.51, valorEsgotoM3: 5.21 + 1.30 },
          { ate: 20, valorM3: 7.45, valorEsgotoM3: 5.96 + 1.49 },
          { ate: 25, valorM3: 8.45, valorEsgotoM3: 6.76 + 1.69 },
          { ate: 30, valorM3: 9.54, valorEsgotoM3: 7.63 + 1.91 },
          { ate: 40, valorM3: 10.89, valorEsgotoM3: 8.71 + 2.18 },
          { ate: 50, valorM3: 12.33, valorEsgotoM3: 9.86 + 2.47 },
          { ate: Infinity, valorM3: 14.06, valorEsgotoM3: 11.25 + 2.81 },
        ],
      },
      residencialSocial: {
        tarifaBasicaMensal: 8.73,
        // Confirmado com o documento oficial (2 cópias conferidas): a resolução
        // só define 3 faixas pra Residencial Social (1-10, 11-15, 16-20). Não há
        // faixa publicada acima de 20 m³ pra essa categoria — por isso o valor
        // de 16-20 é usado como teto pra qualquer consumo social acima disso.
        faixas: [
          { ate: 10, valorM3: 2.73, valorEsgotoM3: 2.18 + 0.55 },
          { ate: 15, valorM3: 3.07, valorEsgotoM3: 2.46 + 0.61 },
          { ate: Infinity, valorM3: 3.52, valorEsgotoM3: 2.82 + 0.70 },
        ],
      },
      // Categorias não-residenciais, também da mesma resolução:
      publica: {
        tarifaBasicaMensal: 17.46,
        faixas: [
          { ate: 10, valorM3: 10.89, valorEsgotoM3: 8.71 + 2.18 },
          { ate: Infinity, valorM3: 12.33, valorEsgotoM3: 9.86 + 2.47 },
        ],
      },
      comercial1: {
        // Comercial I — Médio e Grande Porte
        tarifaBasicaMensal: 17.46,
        faixas: [
          { ate: 10, valorM3: 12.33, valorEsgotoM3: 9.86 + 2.47 },
          { ate: Infinity, valorM3: 14.06, valorEsgotoM3: 11.25 + 2.81 },
        ],
      },
      comercial2: {
        // Comercial II — Pequeno Porte. Confirmado: a resolução só define uma
        // única faixa (1-10) pra essa categoria, sem faixa "+10" — não é dado
        // faltando, é assim que a tabela oficial define essa categoria.
        tarifaBasicaMensal: 8.73,
        faixas: [
          { ate: Infinity, valorM3: 6.15, valorEsgotoM3: 4.92 + 1.23 },
        ],
      },
      industrial: {
        tarifaBasicaMensal: 17.46,
        faixas: [
          { ate: 10, valorM3: 12.33, valorEsgotoM3: 9.86 + 2.47 },
          { ate: Infinity, valorM3: 14.06, valorEsgotoM3: 11.25 + 2.81 },
        ],
      },
    },
  },
};

const perfisEnergia = {
  'GO-EQUATORIAL': {
    nome: 'Equatorial Goiás',
    fonte: 'Aproximação de tarifa convencional residencial (fonte secundária) — ' +
           'AINDA PRECISA da Resolução Homologatória ANEEL oficial pra ficar tão preciso quanto a água',
    atualizadoEm: '2025-10-22',
    faixas: [
      { ate: Infinity, valorKwh: 0.891 }, // atualizado conforme referência mais recente encontrada
    ],
    taxaIluminacaoPublica: 15.00, // COSIP/CIP varia por município — confirme na prefeitura/fatura local
    bandeiraTarifaria: {
      // Valores nacionais definidos pela ANEEL (Decreto 8.401/2015), não específicos da Equatorial
      verde: 0,
      amarela: 1.885,
      vermelha1: 4.463,
      vermelha2: 7.877,
    },
  },
};

/**
 * Calcula valor total aplicando tarifa progressiva por faixas, pra um campo
 * de valor específico (ex: 'valorM3', 'valorEsgotoM3' ou 'valorKwh').
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
      valorUnitario: Number(faixa[campoValor].toFixed(4)),
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
 * @param {object} opcoes - {
 *   perfil?: string    — chave do perfil, ex: 'GO-SANEAGO' ou 'GO-EQUATORIAL' (padrão: Goiás)
 *   categoria?: string — só pra água: 'residencial' (padrão), 'residencialSocial',
 *                        'publica', 'comercial1', 'comercial2', 'industrial'
 *   bandeira?: string  — só pra energia: 'verde'|'amarela'|'vermelha1'|'vermelha2'
 * }
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
    const chavePerfil = opcoes.perfil || 'GO-SANEAGO';
    const perfil = perfisAgua[chavePerfil];
    if (!perfil) {
      return { sucesso: false, erro: `Perfil de água desconhecido: ${chavePerfil}` };
    }

    const categoria = opcoes.categoria || 'residencial';
    const dadosCategoria = perfil.categorias[categoria];
    if (!dadosCategoria) {
      return { sucesso: false, erro: `Categoria desconhecida para ${perfil.nome}: ${categoria}` };
    }

    const { total: valorAgua, detalhePorFaixa: faixasAgua } =
      calcularPorFaixas(consumo, dadosCategoria.faixas, 'valorM3');
    const { total: valorEsgoto, detalhePorFaixa: faixasEsgoto } =
      calcularPorFaixas(consumo, dadosCategoria.faixas, 'valorEsgotoM3');

    const total = valorAgua + valorEsgoto + dadosCategoria.tarifaBasicaMensal;

    return {
      sucesso: true,
      tipo,
      perfil: perfil.nome,
      fonteTarifa: perfil.fonte,
      atualizadoEm: perfil.atualizadoEm,
      categoria,
      consumo_m3: consumo,
      detalhePorFaixaAgua: faixasAgua,
      detalhePorFaixaEsgoto: faixasEsgoto,
      tarifa_basica: dadosCategoria.tarifaBasicaMensal,
      valor_agua: Number(valorAgua.toFixed(2)),
      valor_esgoto: Number(valorEsgoto.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  if (tipo === 'ENERGIA') {
    const chavePerfil = opcoes.perfil || 'GO-EQUATORIAL';
    const perfil = perfisEnergia[chavePerfil];
    if (!perfil) {
      return { sucesso: false, erro: `Perfil de energia desconhecido: ${chavePerfil}` };
    }

    const { total: valorEnergiaBase, detalhePorFaixa } = calcularPorFaixas(consumo, perfil.faixas, 'valorKwh');

    const bandeira = opcoes.bandeira || 'verde';
    const custoBandeira = ((perfil.bandeiraTarifaria[bandeira] || 0) / 100) * consumo;

    const total = valorEnergiaBase + custoBandeira + perfil.taxaIluminacaoPublica;

    return {
      sucesso: true,
      tipo,
      perfil: perfil.nome,
      fonteTarifa: perfil.fonte,
      atualizadoEm: perfil.atualizadoEm,
      consumo_kwh: consumo,
      detalhePorFaixa,
      bandeira_aplicada: bandeira,
      valor_energia: Number(valorEnergiaBase.toFixed(2)),
      custo_bandeira: Number(custoBandeira.toFixed(2)),
      taxa_iluminacao_publica: perfil.taxaIluminacaoPublica,
      total: Number(total.toFixed(2)),
    };
  }

  return { sucesso: false, erro: `Tipo de medidor desconhecido: ${tipo}` };
}

module.exports = { calcularFatura, perfisAgua, perfisEnergia };
