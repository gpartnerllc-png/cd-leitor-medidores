/**
 * server.js
 * API principal: recebe a foto do medidor, roda OCR, calcula a fatura e
 * (opcionalmente) envia o resumo por WhatsApp.
 *
 * Segurança aplicada (real, sem rótulos de marketing):
 * - helmet: cabeçalhos HTTP seguros contra ataques comuns (XSS, sniffing, clickjacking)
 * - express-rate-limit: protege contra força bruta / abuso de endpoint
 * - jsonwebtoken: autenticação por token de curta duração (JWT)
 * - Validação estrita de tipo/tamanho de arquivo no upload
 * - HTTPS/TLS 1.3 deve ser garantido pelo proxy reverso (Cloudflare, Nginx) na frente
 *   deste serviço — Node não deve terminar TLS diretamente em produção.
 */

const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const { lerMedidorDigital } = require('./ocr-digital');
const { calcularFatura } = require('./billing');
const { enviarFaturaWhatsApp } = require('./whatsapp');

const app = express();
app.use(express.json());
app.use(helmet());

const JWT_SECRET = process.env.JWT_SECRET; // NUNCA hardcode em produção
if (!JWT_SECRET) {
  console.warn('AVISO: defina JWT_SECRET como variável de ambiente antes de subir em produção.');
}

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,                 // 100 requisições por IP nesse período
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use(limitador);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — margem confortável pra fotos de celular
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Formato de imagem não suportado.'));
    }
    cb(null, true);
  },
});

/**
 * Middleware de autenticação — exige token JWT de curta duração no header.
 */
function autenticar(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ erro: 'Token de acesso ausente.' });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

/**
 * POST /api/login
 * Gera um token JWT de curta duração (exemplo simplificado — em produção,
 * valide contra um banco de usuários com senha com hash bcrypt/argon2).
 */
app.post('/api/login', (req, res) => {
  const { usuarioId } = req.body;
  if (!usuarioId) {
    return res.status(400).json({ erro: 'usuarioId é obrigatório.' });
  }
  const token = jwt.sign({ usuarioId }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ token, expiraEm: '15 minutos' });
});

/**
 * POST /api/ler-medidor
 * Recebe: multipart/form-data com campo "foto" + campos "tipo" (AGUA|ENERGIA)
 * e "leituraAnterior" (número).
 */
app.post('/api/ler-medidor', autenticar, upload.single('foto'), async (req, res) => {
  try {
    const { tipo, leituraAnterior, bandeira } = req.body;

    if (!req.file) {
      return res.status(400).json({ erro: 'Envie a foto do medidor no campo "foto".' });
    }
    if (!['AGUA', 'ENERGIA'].includes(tipo)) {
      return res.status(400).json({ erro: 'Campo "tipo" deve ser AGUA ou ENERGIA.' });
    }
    if (leituraAnterior === undefined || isNaN(Number(leituraAnterior))) {
      return res.status(400).json({ erro: 'Campo "leituraAnterior" é obrigatório e deve ser numérico.' });
    }

    const resultadoOcr = await lerMedidorDigital(req.file.buffer, tipo);
    if (!resultadoOcr.sucesso) {
      return res.status(422).json(resultadoOcr);
    }

    const fatura = calcularFatura(resultadoOcr.leitura, Number(leituraAnterior), tipo, { bandeira });
    if (!fatura.sucesso) {
      return res.status(422).json(fatura);
    }

    res.json({
      leitura: resultadoOcr,
      fatura,
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno ao processar a leitura.' });
  }
});

/**
 * POST /api/enviar-whatsapp
 * Envia o resumo já calculado para o WhatsApp do proprietário.
 */
app.post('/api/enviar-whatsapp', autenticar, async (req, res) => {
  const { numeroCliente, fatura } = req.body;
  if (!numeroCliente || !fatura) {
    return res.status(400).json({ erro: 'numeroCliente e fatura são obrigatórios.' });
  }

  const resultado = await enviarFaturaWhatsApp(
    process.env.WHATSAPP_PHONE_ID,
    process.env.WHATSAPP_TOKEN,
    numeroCliente,
    fatura
  );

  res.status(resultado.sucesso ? 200 : 502).json(resultado);
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
  console.log(`Servidor rodando na porta ${PORTA}`);
});

module.exports = app;
