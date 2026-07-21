"""
analog_meter_reader.py
Leitura de medidores ANALÓGICOS (de ponteiro/relógio) — o tipo mais comum em
hidrômetros antigos e ainda presente em muitos medidores de energia residenciais.

AVISO TÉCNICO HONESTO: ler ponteiros por foto é o problema mais difícil desta
categoria de app. Não existe forma confiável de fazer isso com regex ou OCR comum
— precisa de visão computacional geométrica (detectar o centro do mostrador e o
ângulo de cada ponteiro) ou, para alta precisão real, uma rede neural treinada
com fotos rotuladas dos MESMOS modelos de medidor que você vai atender.
Este módulo implementa a abordagem geométrica (funciona bem com foto bem
enquadrada e iluminação razoável); trate-o como uma primeira versão sólida,
não como produto finalizado sem testes de campo.

Pipeline:
1. Detecta os círculos (mostradores) na imagem com a Transformada de Hough.
2. Para cada mostrador, isola a região e detecta a linha do ponteiro.
3. Calcula o ângulo do ponteiro em relação ao "12" (topo) do mostrador.
4. Converte ângulo -> dígito (0-9), considerando que mostradores alternados
   giram em sentido horário/anti-horário (padrão universal de hidrômetros).
"""

import cv2
import numpy as np
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class LeituraMostrador:
    indice: int
    angulo_graus: float
    digito_estimado: int


def detectar_mostradores(imagem_gray: np.ndarray) -> List[np.ndarray]:
    """Detecta círculos (mostradores) via Hough Circle Transform."""
    imagem_suavizada = cv2.GaussianBlur(imagem_gray, (9, 9), 2)
    circulos = cv2.HoughCircles(
        imagem_suavizada,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=40,
        param1=100,
        param2=30,
        minRadius=15,
        maxRadius=120,
    )
    if circulos is None:
        return []
    return np.round(circulos[0, :]).astype(int)


def calcular_angulo_ponteiro(recorte_mostrador: np.ndarray, centro: tuple, raio: int) -> Optional[float]:
    """
    Encontra a linha mais provável do ponteiro dentro do mostrador via
    Transformada de Hough para linhas, e retorna o ângulo em graus (0 = topo,
    sentido horário positivo).
    """
    bordas = cv2.Canny(recorte_mostrador, 50, 150)
    linhas = cv2.HoughLinesP(
        bordas, 1, np.pi / 180, threshold=20,
        minLineLength=int(raio * 0.5), maxLineGap=5
    )
    if linhas is None:
        return None

    cx, cy = centro
    melhor_linha = None
    maior_distancia = 0

    # Escolhe a linha cuja ponta mais distante do centro é a mais longa
    # (o ponteiro costuma ser o traço dominante que cruza o centro do mostrador)
    for linha in linhas:
        x1, y1, x2, y2 = linha[0]
        d1 = np.hypot(x1 - cx, y1 - cy)
        d2 = np.hypot(x2 - cx, y2 - cy)
        distancia_max = max(d1, d2)
        if distancia_max > maior_distancia:
            maior_distancia = distancia_max
            ponta_x, ponta_y = (x1, y1) if d1 > d2 else (x2, y2)
            melhor_linha = (ponta_x, ponta_y)

    if melhor_linha is None:
        return None

    ponta_x, ponta_y = melhor_linha
    # Ângulo em relação ao topo (12h), sentido horário
    angulo = np.degrees(np.arctan2(ponta_x - cx, -(ponta_y - cy)))
    return angulo % 360


def angulo_para_digito(angulo_graus: float) -> int:
    """Converte ângulo (0-360) em dígito de 0 a 9 (cada dígito = 36 graus)."""
    return int(angulo_graus // 36) % 10


def ler_medidor_analogico(caminho_imagem: str, quantidade_mostradores: int) -> dict:
    """
    Função principal. Retorna a leitura completa concatenando os dígitos
    de cada mostrador, da esquerda para a direita (padrão de hidrômetros/
    medidores de energia com múltiplos ponteiros).
    """
    imagem = cv2.imread(caminho_imagem)
    if imagem is None:
        return {"sucesso": False, "erro": "Não foi possível abrir a imagem."}

    imagem_gray = cv2.cvtColor(imagem, cv2.COLOR_BGR2GRAY)
    mostradores = detectar_mostradores(imagem_gray)

    if len(mostradores) == 0:
        return {
            "sucesso": False,
            "erro": "Nenhum mostrador detectado. Oriente o usuário a fotografar de frente, "
                    "sem ângulo, com luz direta e sem reflexo no vidro.",
        }

    # Ordena os mostradores da esquerda para a direita (ordem de leitura)
    mostradores_ordenados = sorted(mostradores, key=lambda c: c[0])[:quantidade_mostradores]

    leituras: List[LeituraMostrador] = []
    for idx, (x, y, r) in enumerate(mostradores_ordenados):
        margem = int(r * 1.3)
        y0, y1 = max(0, y - margem), y + margem
        x0, x1 = max(0, x - margem), x + margem
        recorte = imagem_gray[y0:y1, x0:x1]
        centro_recorte = (x - x0, y - y0)

        angulo = calcular_angulo_ponteiro(recorte, centro_recorte, r)
        if angulo is None:
            leituras.append(LeituraMostrador(idx, 0.0, -1))  # -1 = falha nesse mostrador
            continue

        digito = angulo_para_digito(angulo)
        # Mostradores alternados em hidrômetros costumam girar no sentido oposto
        if idx % 2 == 1:
            digito = 9 - digito
        leituras.append(LeituraMostrador(idx, round(angulo, 1), digito))

    houve_falha = any(l.digito_estimado == -1 for l in leituras)
    numero_final = "".join(
        str(l.digito_estimado) if l.digito_estimado != -1 else "?" for l in leituras
    )

    return {
        "sucesso": not houve_falha,
        "leitura_estimada": numero_final,
        "detalhe_mostradores": [l.__dict__ for l in leituras],
        "aviso": None if not houve_falha else
                 "Um ou mais mostradores não puderam ser lidos com confiança — "
                 "recomenda-se confirmação manual antes de faturar.",
    }


if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 3:
        print("Uso: python analog_meter_reader.py <caminho_imagem> <qtd_mostradores>")
        sys.exit(1)

    resultado = ler_medidor_analogico(sys.argv[1], int(sys.argv[2]))
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
