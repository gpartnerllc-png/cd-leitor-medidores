"""
app.py — API Flask do leitor analógico.
Empacota analog_meter_reader.py como um serviço web independente,
deployável em Railway/Render junto com o backend Node.
"""

import os
import tempfile
from flask import Flask, request, jsonify
from analog_meter_reader import ler_medidor_analogico

app = Flask(__name__)

MAX_TAMANHO_MB = 8


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.route('/ler-analogico', methods=['POST'])
def ler_analogico():
    if 'foto' not in request.files:
        return jsonify({"sucesso": False, "erro": "Envie a foto no campo 'foto'."}), 400

    arquivo = request.files['foto']
    quantidade_mostradores = int(request.form.get('quantidadeMostradores', 4))

    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
        arquivo.save(tmp.name)
        caminho_temp = tmp.name

    try:
        resultado = ler_medidor_analogico(caminho_temp, quantidade_mostradores)
        status = 200 if resultado.get('sucesso') else 422
        return jsonify(resultado), status
    finally:
        os.unlink(caminho_temp)


if __name__ == '__main__':
    porta = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=porta)
