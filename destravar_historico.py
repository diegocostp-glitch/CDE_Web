# -*- coding: utf-8 -*-
"""
Destrava os registros que o importar_historico.py deixou sem marca de origem.

Por que existe: o gravar() do importar_diario.py preserva todo registro que nao
tenha _fonte = "planilha", presumindo "digitado na tela — nao pise". Mas o
importar_historico.py, que leu as abas CONSUMO, nunca escreveu essa marca.
Resultado: aqueles registros ficaram IMUNES a sincronizacao e carregam para
sempre o que a aba CONSUMO trazia, mais o que o importador antigo lia errado:

  * saldo inicial zerado (a aba CONSUMO nao tem coluna de inicio);
  * chegada de lula e tentaculo PROCESSADO copiada da compra do in natura —
    a mesma compra contada duas vezes, da epoca em que o importador lia as
    colunas deslocadas;
  * dias de consumo faltando, que a aba diaria tem.

Como se sabe que nao e digitacao de tela: quando alguem grava por cima de um
registro sincronizado, a tela apaga a marca e escreve _editado = True (veja
lancar_movimento no server.py). Nenhum registro travado tem _editado, nem
"inicial", nem qualquer campo fora dos cinco que o importar_historico escreve.
Este script confere isso registro por registro e se recusa a marcar o que
fugir do padrao — se alguem digitou algo, aparece no relatorio e fica de fora.

O que ele faz: poe a marca nos registros travados. NAO muda numero nenhum. O
conserto vem da sincronizacao seguinte:

    python destravar_historico.py --mes 08 --gravar
    python importar_diario.py --mes 08 --gravar

O preco cadastrado nao se perde: o gravar() do importar_diario preserva
"precos" quando sobrescreve.

Uso:
    python destravar_historico.py --mes 08            mostra o que faria
    python destravar_historico.py --mes 08 --gravar   marca
"""
import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
DESTINO = RAIZ / "dados" / "lancamentos.json"
BACKUPS = RAIZ / "backups"

MARCA = "_fonte"
# Os cinco campos que o importar_historico.py escreve. Nada mais: ele nao tem
# "inicial" (a aba CONSUMO nao traz o saldo de abertura) e a tela, quando
# edita, deixa "_editado" para tras.
CAMPOS_HISTORICO = {"final", "entrada", "transferencia", "desperdicio", "uso"}
META = {MARCA, "precos"}


def travados(dados, prefixo):
    """[(iso, casa, insumo, campos)] dos registros sem marca, no mes pedido."""
    fora = []
    for iso, dia in dados.items():
        if not iso.startswith(prefixo):
            continue
        for casa, lan in dia.items():
            if not isinstance(lan, dict):
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if isinstance(campos, dict) and campos.get(MARCA) != "planilha":
                    fora.append((iso, casa, ik, campos))
    return fora


def suspeito(campos):
    """Motivo para NAO marcar este registro, ou None."""
    if campos.get("_editado"):
        return "tem _editado: alguem gravou por cima na tela"
    estranhos = set(campos) - CAMPOS_HISTORICO - META
    if estranhos:
        return "campos fora do padrao do historico: %s" % ", ".join(sorted(estranhos))
    return None


def main():
    args = sys.argv[1:]
    gravar = "--gravar" in args
    if "--mes" not in args:
        print("informe o mes:  python destravar_historico.py --mes 08")
        return 1
    mes = int(args[args.index("--mes") + 1])
    ano = datetime.now().year
    if "--ano" in args:
        ano = int(args[args.index("--ano") + 1])
    prefixo = "%d-%02d" % (ano, mes)

    if not DESTINO.exists():
        print("[erro] dados/lancamentos.json nao encontrado")
        return 1
    with open(DESTINO, encoding="utf-8") as f:
        dados = json.load(f)

    achados = travados(dados, prefixo)
    print("mes: %s" % prefixo)
    print("registros sem marca de origem: %d" % len(achados))
    if not achados:
        print("\nnada a destravar.")
        return 0

    # A fonte tem de ter o registro; senao a marca faria a tela dizer
    # "Planilha" para um dado que planilha nenhuma produz, e a sincronizacao
    # passaria por cima dele sem nunca corrigi-lo.
    print("\nlendo as planilhas-fonte para conferir a contrapartida...")
    import importar_diario as ID
    novos = ID.importar(mes_filtro="%02d" % mes)[0]

    marcar, sem_fonte, recusados = [], [], []
    for iso, casa, ik, campos in achados:
        motivo = suspeito(campos)
        if motivo:
            recusados.append((iso, casa, ik, motivo))
            continue
        if ik not in (((novos.get(iso) or {}).get(casa) or {}).get("insumos") or {}):
            sem_fonte.append((iso, casa, ik))
            continue
        marcar.append((iso, casa, ik, campos))

    print()
    print("a marcar                       : %d" % len(marcar))
    print("sem contrapartida na fonte     : %d (ficam como estao)" % len(sem_fonte))
    print("recusados por parecer digitacao: %d" % len(recusados))
    por_insumo = Counter(m[2] for m in marcar)
    for k, v in por_insumo.most_common():
        print("   %-20s %d" % (k, v))
    if recusados:
        print("\n--- RECUSADOS (confira a mao antes de insistir) ---")
        for iso, casa, ik, motivo in recusados[:20]:
            print("   %s %-5s %-18s %s" % (iso, casa, ik, motivo))
    if sem_fonte:
        print("\n--- SEM CONTRAPARTIDA NA FONTE ---")
        for iso, casa, ik in sem_fonte[:20]:
            print("   %s %-5s %s" % (iso, casa, ik))

    com_preco = sum(1 for m in marcar if m[3].get("precos"))
    print("\ndos que serao marcados, %d ja tem preco cadastrado — o gravar() do"
          "\nimportar_diario preserva 'precos' ao sobrescrever." % com_preco)

    if not gravar:
        print("\n(nada foi gravado — rode com --gravar)")
        return 0

    BACKUPS.mkdir(exist_ok=True)
    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    shutil.copy(DESTINO, BACKUPS / ("lancamentos_antes-de-destravar_%s.json" % carimbo))
    for _iso, _casa, _ik, campos in marcar:
        campos[MARCA] = "planilha"
    tmp = DESTINO.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    tmp.replace(DESTINO)
    print("\n%d registro(s) marcado(s). backup em"
          "\nbackups/lancamentos_antes-de-destravar_%s.json" % (len(marcar), carimbo))
    print("\nagora rode a sincronizacao, que e quem conserta os numeros:"
          "\n    python importar_diario.py --mes %02d --gravar" % mes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
