/**
 * server.js
 * API principal melhorada — pronta para Cloudflare (via adapter) ou Node tradicional.
 * Inclui: OCR enhanced, assinatura imutável, validação de anomalia e webhook WhatsApp.
 */

const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const { lerMedidorDigital } = require('./ocr-enhanced');
const { gerarAssinaturaImutavel } = require('./crypto-medidor');
const { enviarFaturaTemplate, processarWebhookIA } = require('./whatsapp');
const { calcularFatura } = require('./billing'); // mantenha o seu billing.js original

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(helmet());

const JWT_SECRET = process.env.JWT_SECRET || 'troque-em-producao';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'meu-token-secreto';
const LLM_API_KEY = process.env.LLM_API_KEY;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Formato não suportado'));
    }
    cb(null, true);
  },
});

function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Token ausente' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido' });
  }
}

// Login simples
app.post('/api/login', (req, res) => {
  const { usuarioId } = req.body;
  if (!usuarioId) return res.status(400).json({ erro: 'usuarioId obrigatório' });
  const token = jwt.sign({ usuarioId }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ token });
});

// Leitura principal
app.post('/api/ler-medidor', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const { tipo, leituraAnterior, bandeira, idMedidor, hashAnterior } = req.body;
    if (!req.file) return res.status(400).json({ erro: 'Foto obrigatória' });
    if (!['AGUA', 'ENERGIA'].includes(tipo)) return res.status(400).json({ erro: 'tipo inválido' });

    const ocr = await lerMedidorDigital(req.file.buffer, tipo);
    if (!ocr.sucesso) return res.status(422).json(ocr);

    // Validação de consistência / anomalia
    const anterior = Number(leituraAnterior) || 0;
    if (ocr.leitura < anterior) {
      return res.status(422).json({ erro: 'Leitura menor que a anterior — possível violação', leitura: ocr.leitura });
    }
    const consumo = ocr.leitura - anterior;
    if (anterior > 0 && consumo > anterior * 1.5) {
      return res.status(202).json({
        status: 'REVISAO_REQUERIDA',
        msg: 'Consumo anômalo detectado. Enviado para auditoria.',
        leitura: ocr.leitura,
        consumo,
      });
    }

    const fatura = calcularFatura(ocr.leitura, anterior, tipo, { bandeira });
    if (!fatura.sucesso) return res.status(422).json(fatura);

    // Assinatura imutável
    const assinatura = gerarAssinaturaImutavel({
      idMedidor: idMedidor || 'desconhecido',
      leituraAtual: ocr.leitura,
      timestamp: Date.now(),
      hashAnterior: hashAnterior || 'genesis',
    });

    res.json({
      leitura: ocr,
      fatura,
      assinatura,
      hashParaProxima: assinatura,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// Envio WhatsApp (template)
app.post('/api/enviar-whatsapp', autenticar, async (req, res) => {
  const { numeroCliente, fatura } = req.body;
  if (!numeroCliente || !fatura) return res.status(400).json({ erro: 'Dados incompletos' });

  const resultado = await enviarFaturaTemplate(
    WHATSAPP_PHONE_ID,
    WHATSAPP_TOKEN,
    numeroCliente,
    fatura
  );
  res.status(resultado.sucesso ? 200 : 502).json(resultado);
});

// Webhook Meta (verificação + mensagens)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    await processarWebhookIA(req.body, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN, LLM_API_KEY);
  } catch (e) {
    console.error(e);
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

module.exports = app;
