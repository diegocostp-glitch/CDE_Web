# -*- coding: utf-8 -*-
"""
Conserta dois defeitos herdados das planilhas no dados/lancamentos.json.

1) SAIDA GRAVADA COMO ENTRADA NEGATIVA
   A planilha tem uma coluna so, "ENTRADA/SAIDA DE ESTOQUE": chegada entra
   positiva, transferencia para outra casa entra negativa. A importacao jogava
   tudo em "entrada". A conta do uso continua certa (somar -8 e o mesmo que
   subtrair 8), mas a tela mostrava chegada de -8 kg e a coluna Saida ficava
   sempre vazia — nao dava para responder "quanto saiu daqui para a outra casa
   neste mes". Aqui a entrada negativa vira transferencia positiva.

2) DESPERDICIO ESPELHANDO O ESTOQUE FINAL
   Na aba CONSUMO - SALMAO das planilhas, a coluna DESPERDICIO (KG) repete o
   valor do estoque final — e formula errada na origem, nao perda. Importado
   como esta, o salmao aparecia com centenas de quilos de desperdicio por mes
   (mais de R$ 200 mil), o que enterraria qualquer relatorio de perda. Onde o
   desperdicio e exatamente igual ao estoque final, o valor e descartado.

Nada mais e tocado: contagem final, chegada real e uso ficam como estao.

Uso:  python corrigir_lancamentos.py             mostra o que mudaria
      python corrigir_lancamentos.py --gravar    aplica (com backup antes)
"""
import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
ARQ = RAIZ / "dados" / "lancamentos.json"
BACKUPS = RAIZ / "backups"


def corrigir(dados):
    conta = Counter()
    exemplos = []
    for iso in sorted(dados):
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if not isinstance(campos, dict):
                    continue
                entrada = campos.get("entrada")
                if entrada is not None and float(entrada) < 0:
                    saida = round(-float(entrada), 4)
                    campos["entrada"] = 0
                    campos["transferencia"] = round(
                        float(campos.get("transferencia") or 0) + saida, 4)
                    conta["saidas"] += 1
                    if len(exemplos) < 6:
                        exemplos.append("%s %s %s: entrada %.3f -> saida %.3f"
                                        % (iso, ck, ik, float(entrada), saida))
                desp, final = campos.get("desperdicio"), campos.get("final")
                if (desp not in (None, "") and final not in (None, "")
                        and abs(float(desp)) > 0
                        and abs(float(desp) - float(final)) < 1e-9):
                    del campos["desperdicio"]
                    conta["desperdicio_espelhado"] += 1
                    conta["kg_desperdicio_removido"] += float(final)
    return conta, exemplos


def main():
    gravar = "--gravar" in sys.argv
    with open(ARQ, encoding="utf-8") as f:
        dados = json.load(f)
    conta, exemplos = corrigir(dados)

    print("saidas recuperadas (entrada negativa -> transferencia): %d" % conta["saidas"])
    for e in exemplos:
        print("   " + e)
    print("desperdicio espelhando o estoque final, descartado: %d registro(s) (%.1f un.)"
          % (conta["desperdicio_espelhado"], conta["kg_desperdicio_removido"]))

    if not gravar:
        print("\n(sem --gravar: nada foi alterado)")
        return
    BACKUPS.mkdir(exist_ok=True)
    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    shutil.copy(ARQ, BACKUPS / ("lancamentos_antes-da-correcao_%s.json" % carimbo))
    tmp = ARQ.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ)
    print("\ndados/lancamentos.json corrigido (backup em backups/).")


if __name__ == "__main__":
    main()
