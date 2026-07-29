# Seter · Motor de Leitura de Medidores

Estrutura:
```
leitor-medidores/
├── backend/            → API Node (OCR digital + fatura + WhatsApp)
│   └── analog-api/     → Serviço Python separado (leitura de ponteiros)
├── frontend/           → Dashboard (index.html) — deploy no Cloudflare Pages
└── docs/README.md      → Detalhes técnicos e limites reais de cada módulo
```

## 1. Subir para o GitHub

No seu computador, dentro da pasta `leitor-medidores`:

```bash
git init
git add .
git commit -m "Motor de leitura de medidores: OCR, fatura e WhatsApp"
```

Crie o repositório vazio em https://github.com/new (sem README, sem .gitignore — já temos os nossos), depois:

```bash
git remote add origin https://github.com/SEU-USUARIO/leitor-medidores.git
git branch -M main
git push -u origin main
```

## 2. Deploy do backend Node (Railway)

1. Acesse https://railway.app → **New Project → Deploy from GitHub repo**
2. Selecione o repositório e, em **Root Directory**, informe `backend`
3. Railway detecta o `Procfile` e o `package.json` automaticamente
4. Em **Variables**, adicione:
   - `JWT_SECRET` — uma string aleatória forte
   - `WHATSAPP_PHONE_ID` — Phone Number ID da Meta
   - `WHATSAPP_TOKEN` — token de acesso da Meta
5. Deploy. Railway te dá uma URL tipo `https://leitor-backend.up.railway.app`

(Render.com funciona de forma equivalente, se preferir.)

## 3. Deploy do serviço Python (leitura analógica)

Mesmo processo, mas com **Root Directory** = `backend/analog-api`. Railway detecta o `requirements.txt` e o `Procfile` (`gunicorn app:app`) sozinho.

## 4. Deploy do dashboard (Cloudflare Pages)

Esse sim fica perfeito no Cloudflare, porque é 100% estático:

1. Dashboard da Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**
2. Selecione o repositório, **Root directory** = `frontend`
3. Não precisa de build command (é HTML puro) — deixe em branco ou `echo "sem build"`
4. **Output directory**: `/`
5. Deploy. Você recebe uma URL tipo `leitor-medidores.pages.dev`

Depois, abra `frontend/index.html` e troque a linha:
```js
const API_URL = 'https://SEU-BACKEND-NODE.exemplo.com';
```
pela URL real do Railway do passo 2, e descomente o bloco de `fetch` real (está marcado no arquivo).

## 5. Depois do primeiro deploy

Qualquer novo `git push` para `main` já dispara build e deploy automático nos três serviços — não precisa repetir os passos acima.
