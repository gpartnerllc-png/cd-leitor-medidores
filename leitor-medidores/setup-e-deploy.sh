#!/bin/bash
# setup-e-deploy.sh
# Roda os passos automatizáveis de Git + Railway.
# O que este script NÃO substitui: login interativo (ele vai abrir o navegador
# pra você autorizar sua conta GitHub e Railway — isso é obrigatório por segurança,
# nenhuma ferramenta externa pode fazer login por você).

set -e

echo "=== 1. Verificando Git ==="
if ! command -v git &> /dev/null; then
  echo "Git não encontrado. Instale em https://git-scm.com/downloads e rode de novo."
  exit 1
fi

echo "=== 2. Inicializando repositório ==="
git init -q
git add .
git commit -q -m "Motor de leitura de medidores: OCR, fatura e WhatsApp" || echo "(nada novo pra commitar)"

read -p "Cole aqui a URL do repositório GitHub vazio que você criou (ex: https://github.com/seu-usuario/leitor-medidores.git): " REPO_URL
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git branch -M main
git push -u origin main

echo "=== 3. Instalando Railway CLI (se necessário) ==="
if ! command -v railway &> /dev/null; then
  npm install -g @railway/cli
fi

echo "=== 4. Login no Railway (vai abrir o navegador) ==="
railway login

echo "=== 5. Deploy do backend Node ==="
cd backend
railway init -n "leitor-medidores-backend"
railway up
cd ..

echo "=== 6. Deploy do serviço Python (leitura analógica) ==="
cd backend/analog-api
railway init -n "leitor-medidores-analog"
railway up
cd ../..

echo ""
echo "Feito. Agora, no site do Railway (railway.app), abra cada serviço e:"
echo "  - no backend Node: adicione as variáveis JWT_SECRET, WHATSAPP_PHONE_ID, WHATSAPP_TOKEN"
echo "  - copie a URL pública gerada de cada serviço"
echo ""
echo "Depois cole a URL do backend Node em frontend/index.html na linha API_URL,"
echo "dê 'git add . && git commit -m \"conecta API\" && git push' de novo,"
echo "e conecte o Cloudflare Pages ao repositório (passo manual, é só clicar Connect to Git)."
