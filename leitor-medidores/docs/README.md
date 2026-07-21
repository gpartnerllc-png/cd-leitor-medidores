# Motor de Leitura de Medidores — Água e Energia

## O que este projeto realmente é

Um backend que:
1. Recebe uma foto de medidor (digital ou analógico)
2. Extrai a leitura por visão computacional (OCR para digital, detecção geométrica de ponteiros para analógico)
3. Calcula a fatura com tarifa progressiva por faixa (padrão real de cobrança de concessionárias de água e energia)
4. Envia o resumo para o WhatsApp do proprietário cadastrado

## O que este projeto NÃO é (importante para não vender algo que não existe)

- **Não substitui um medidor inteligente (smart meter/AMI)**, que é o padrão real usado pelas maiores utilities do mundo (EUA, Japão, Israel etc.) — aqueles medem e transmitem sozinhos, sem foto e sem OCR.
- **A leitura analógica por foto não tem 100% de precisão.** É um problema real e difícil de visão computacional. O módulo entregue usa detecção geométrica (Hough Transform), que funciona bem em condições controladas (boa luz, sem ângulo, sem reflexo) mas deve ser validado em campo com os modelos reais de medidor da sua região antes de faturar sem revisão humana.
- **As tarifas no código são placeholders estruturais.** Antes de cobrar qualquer cliente de verdade, substitua os valores em `billing.js` pelas tabelas tarifárias oficiais vigentes da Saneago e da Equatorial Goiás (ambas publicam publicamente, e mudam por revisão tarifária).

## Precisão esperada (baseado em estudos publicados sobre OCR de medidores)

| Abordagem | Acurácia típica |
|---|---|
| OCR genérico de nuvem sem tratamento de imagem | ~50% |
| OpenCV + regras | ~86–95% |
| CNN treinada + Tesseract com pré-processamento | ~97% |

O módulo `ocr-digital.js` já entrega o pipeline de pré-processamento (a parte que mais eleva a acurácia). Para chegar aos ~97%, o passo seguinte é treinar uma CNN com fotos reais dos medidores da sua base — Tesseract sozinho não chega lá.

## Como rodar

```bash
cd backend
npm install
export JWT_SECRET="sua_chave_secreta_forte"
export WHATSAPP_PHONE_ID="seu_id_do_whatsapp_business"
export WHATSAPP_TOKEN="seu_token_da_meta"
npm start
```

## Endpoints

- `POST /api/login` — gera token JWT (15 min de validade)
- `POST /api/ler-medidor` — multipart/form-data: `foto`, `tipo` (AGUA|ENERGIA), `leituraAnterior`, `bandeira` (opcional, só energia)
- `POST /api/enviar-whatsapp` — envia o resultado da fatura para o cliente

## Segurança implementada

- TLS deve ser terminado por um proxy na frente (Cloudflare/Nginx) — Node não deve expor HTTP direto à internet
- JWT de curta duração (15 min) para autenticação
- Rate limiting (100 req / 15 min por IP)
- Helmet (cabeçalhos HTTP contra XSS, sniffing, clickjacking)
- Validação estrita de tipo e tamanho de arquivo no upload

## Leitura analógica (Python)

```bash
pip install opencv-python numpy
python analog_meter_reader.py caminho/da/foto.jpg 4
```
(o `4` é a quantidade de mostradores/ponteiros do medidor — ajuste conforme o modelo)
