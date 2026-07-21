# Checklist — o que só você consegue fazer (por segurança)

Nenhuma ferramenta de IA deveria conseguir fazer estas 4 coisas sozinha —
todas exigem prova de identidade sua ou login direto na sua conta:

## 1. Criar o repositório vazio no GitHub
https://github.com/new → nome `leitor-medidores` → **não** marque "Add README" → Create.
Cole a URL gerada quando o `setup-e-deploy.sh` pedir.

## 2. Login no Railway
O script abre o navegador sozinho (`railway login`) — você só confirma com sua conta
GitHub/Google. Depois disso, o deploy roda sem mais telas.

## 3. Conta Meta Business + WhatsApp (a parte mais burocrática)
1. https://business.facebook.com → criar conta comercial (se não tiver)
2. https://developers.facebook.com/apps → **Create App** → tipo "Business"
3. Adicionar o produto **WhatsApp** ao app
4. Em WhatsApp → **API Setup**, copiar o `Phone Number ID` (isso é o `WHATSAPP_PHONE_ID`)
5. Gerar um **token de acesso permanente** (não o temporário de 24h): System Users →
   criar um usuário de sistema → gerar token com permissão `whatsapp_business_messaging`
6. Colar esse token como `WHATSAPP_TOKEN` no Railway

Sem verificação da conta Business, a Meta permite enviar mensagens de teste só para
números que você mesmo cadastrar como testadores — o suficiente para validar tudo
antes de ir pra clientes reais.

## 4. Conectar o Cloudflare Pages ao repositório
Dashboard Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** →
autorizar o GitHub → selecionar `leitor-medidores` → Root directory: `frontend`.

---

Depois desses 4 passos (que somam uns 15-20 minutos, a maior parte é a verificação
da Meta), tudo mais — build, deploy, atualizações futuras — acontece sozinho a
cada `git push`.
