"""Grava o faturamento digitado no CDE Web na planilha Faturamento - 2026.xlsx.

A planilha e a fonte do faturamento para o sistema e para as .xlsm mensais (a
celula L9 de cada aba diaria aponta para ela). Quando alguem digita ou corrige
o faturamento na tela de lancamento, o valor tem de chegar la; senao a planilha
e o sistema passam a contar duas historias.

Como grava:
- pelo proprio Excel, via COM (preparar_planilhas_cde.Excel), nunca openpyxl:
  a planilha tem formulas, formatacao e uma aba protegida que o openpyxl
  estraga ao salvar;
- em segundo plano. Abrir o Excel leva segundos e a tela de lancamento nao
  pode esperar por isso. O pedido vai para uma fila gravada em disco
  (dados/faturamento-pendente.json), que sobrevive a um reinicio do servidor;
- com backup da planilha antes de cada gravacao (backups/faturamento/);
- conferindo a data da linha antes de escrever: se a celula de data do bloco
  nao for o dia pedido, nada e gravado e o motivo fica na fila.

Se a planilha estiver aberta em outro lugar, o pedido fica pendente e e
tentado de novo. Nada falha em silencio: o que nao foi gravado aparece na tela
do dia (veja situacao()).
"""
import json
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
FILA = RAIZ / "dados" / "faturamento-pendente.json"
BACKUPS = RAIZ / "backups" / "faturamento"
GUARDAR_BACKUPS = 40
INTERVALO = 5             # segundos entre olhadas na fila
ESPERA_ERRO = 60          # depois de uma falha, espera isto antes de tentar de novo

_lock = threading.Lock()
_ultima_falha = {"quando": 0.0}


# ------------------------------------------------------------------ fila
def _ler():
    try:
        with open(FILA, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _gravar(fila):
    FILA.parent.mkdir(exist_ok=True)
    tmp = FILA.with_suffix(".%d.tmp" % threading.get_ident())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(fila, f, ensure_ascii=False, indent=1)
    tmp.replace(FILA)


def enfileirar(data_iso, casa, valor):
    """Pede a gravacao de um faturamento. O pedido mais novo do mesmo dia/casa vence."""
    with _lock:
        fila = _ler()
        fila["%s|%s" % (data_iso, casa)] = {
            "data": data_iso, "casa": casa, "valor": round(float(valor), 2),
            "pedido_em": datetime.now().isoformat(timespec="seconds"),
            "erro": None,
        }
        _gravar(fila)


def situacao(data_iso):
    """{casa: {"valor", "erro"}} do que ainda nao chegou a planilha nesse dia."""
    with _lock:
        fila = _ler()
    return {p["casa"]: {"valor": p["valor"], "erro": p.get("erro")}
            for p in fila.values() if p.get("data") == data_iso}


# ------------------------------------------------------------------ planilha
def celula(data_iso):
    """(linha, coluna) 1-based do valor do dia: bloco de 3 colunas por mes, B/C/D."""
    d = datetime.strptime(data_iso, "%Y-%m-%d")
    return 3 + d.day, 4 + (d.month - 1) * 3


def _backup(arq):
    BACKUPS.mkdir(parents=True, exist_ok=True)
    destino = BACKUPS / ("Faturamento_%s.xlsx" % datetime.now().strftime("%Y-%m-%d_%H%M%S"))
    shutil.copy2(arq, destino)
    for velho in sorted(BACKUPS.glob("Faturamento_*.xlsx"))[:-GUARDAR_BACKUPS]:
        velho.unlink()
    return destino


def _data_da_celula(v):
    """A data que o Excel devolve pelo COM (datetime com fuso) ou serial, em ISO."""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (int, float)) and v > 0:
        from datetime import timedelta
        return (datetime(1899, 12, 30) + timedelta(days=int(v))).strftime("%Y-%m-%d")
    return None


def valor_da_celula(v):
    """Numero da celula como float. Celula com formato de moeda chega pelo COM
    como decimal.Decimal, que nao e int nem float — sem converter, a conferencia
    "a planilha ja tem esse numero" nunca batia e o valor era regravado a toa."""
    from decimal import Decimal
    if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)):
        return None
    return float(v)


def gravar_pendentes(arquivo, ano):
    """Uma passada na fila: abre a planilha uma vez e grava tudo que der.

    Devolve (gravados, falhas). Pedido de outro ano fica na fila com o motivo:
    a planilha e de um ano so.
    """
    from preparar_planilhas_cde import Excel, Desprotegida

    with _lock:
        fila = _ler()
    if not fila:
        return 0, 0
    resultado = {}                          # chave -> None (gravado) ou motivo
    validos = {}
    for k, p in fila.items():
        if not p.get("data", "").startswith("%d-" % ano):
            resultado[k] = "a planilha de faturamento e de %d" % ano
        else:
            validos[k] = p
    if validos:
        if not arquivo.exists():
            for k in validos:
                resultado[k] = "planilha de faturamento nao encontrada"
        else:
            try:
                resultado.update(_gravar_no_excel(arquivo, validos, Excel, Desprotegida))
            except Exception as e:          # Excel ocupado, arquivo aberto, COM fora
                for k in validos:
                    resultado[k] = str(e)
    # Tira da fila so o que foi gravado e que nao foi repedido nesse meio tempo.
    gravados = falhas = 0
    with _lock:
        atual = _ler()
        for k, motivo in resultado.items():
            if k not in atual or atual[k].get("pedido_em") != fila[k].get("pedido_em"):
                continue
            if motivo is None:
                del atual[k]
                gravados += 1
            else:
                atual[k]["erro"] = motivo
                falhas += 1
        _gravar(atual)
    return gravados, falhas


def _gravar_no_excel(arquivo, pedidos, Excel, Desprotegida):
    import pythoncom
    pythoncom.CoInitialize()                # COM numa thread que nao e a principal
    try:
        resultado, mudou = {}, False
        with Excel() as xl:
            wb = xl.abrir(arquivo)          # aberta em outro lugar: levanta erro
            abas = {ws.Name: ws for ws in wb.Worksheets}
            alteracoes = []
            for k, p in pedidos.items():
                ws = abas.get("FATURAMENTO - %s" % p["casa"])
                if ws is None:
                    resultado[k] = "aba FATURAMENTO - %s nao existe" % p["casa"]
                    continue
                lin, col = celula(p["data"])
                if _data_da_celula(ws.Cells(lin, col - 2).Value) != p["data"]:
                    resultado[k] = "a linha %d da aba %s nao e o dia %s" % (lin, ws.Name, p["data"])
                    continue
                atual = valor_da_celula(ws.Cells(lin, col).Value)
                if atual is not None and abs(atual - p["valor"]) < 0.005:
                    resultado[k] = None     # a planilha ja tem esse numero
                    continue
                alteracoes.append((k, ws, lin, col, p["valor"]))
            if alteracoes:
                _backup(arquivo)
                for k, ws, lin, col, valor in alteracoes:
                    try:
                        with Desprotegida(ws):
                            ws.Cells(lin, col).Value2 = valor
                        resultado[k] = None
                        mudou = True
                    except Exception as e:
                        resultado[k] = "nao consegui escrever em %s: %s" % (ws.Name, e)
            if mudou:
                xl.salvar(wb)
            else:
                wb.Close(False)
        return resultado
    finally:
        pythoncom.CoUninitialize()


def vigiar(arquivo, ano):
    """Thread do servidor: esvazia a fila sempre que aparece pedido."""
    def laco():
        while True:
            time.sleep(INTERVALO)
            try:
                if not FILA.exists() or not _ler():
                    continue
                if time.time() - _ultima_falha["quando"] < ESPERA_ERRO:
                    continue
                ok, ruins = gravar_pendentes(arquivo, ano)
                if ok:
                    print("  [faturamento] %d valor(es) gravado(s) na planilha" % ok, flush=True)
                if ruins:
                    _ultima_falha["quando"] = time.time()
                    print("  [faturamento] %d pendente(s): veja %s" % (ruins, FILA.name), flush=True)
            except Exception as e:          # nunca derruba o servidor
                _ultima_falha["quando"] = time.time()
                print("  [faturamento] falha ao gravar na planilha: %s" % e, flush=True)

    t = threading.Thread(target=laco, name="faturamento-planilha", daemon=True)
    t.start()
    return t
