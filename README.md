# Seter Pro — Leitura Inteligente de Medidores

Versão melhorada e pronta para Cloudflare Pages (frontend) + Node/Cloudflare Workers (backend).

## Arquivos

- `index.html` → Frontend polido (deploy no Cloudflare Pages)
- `server.js` → API principal
- `ocr-enhanced.js` → OCR digital reforçado
- `crypto-medidor.js` → Assinatura imutável
- `whatsapp.js` → Templates + webhook de IA
- `billing.js` → (mantenha o original do repositório)

## Variáveis de ambiente

```
JWT_SECRET=sua_chave_forte
WHATSAPP_PHONE_ID=seu_phone_number_id
WHATSAPP_TOKEN=seu_token_meta
WHATSAPP_VERIFY_TOKEN=meu-token-secreto
LLM_API_KEY=opcional (Grok, OpenAI etc.)
```

## Deploy Cloudflare

1. **Frontend**: suba a pasta com `index.html` no Cloudflare Pages.
2. **Backend**:
   - Opção A: Node tradicional (Railway, Render, VPS) rodando `npm start`.
   - Opção B: Adapte `server.js` para Hono + Cloudflare Workers (recomendado para escala zero).

## WhatsApp

1. Crie o template `fatura_resumo` no WhatsApp Manager (categoria Utility).
2. Configure o webhook apontando para `/webhook/whatsapp`.
3. Dentro da janela de 24h o webhook responde com IA.

Pronto para GitHub e Cloudflare.
