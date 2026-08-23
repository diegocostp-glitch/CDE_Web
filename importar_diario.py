# -*- coding: utf-8 -*-
"""
Le as ABAS DIARIAS (01..31) das planilhas de cada casa.

Por que existe, ao lado do importar_historico.py: aquele le as abas
"CONSUMO - X", que ja vem consolidadas e trazem so o uso do dia (e, no caso do
salmao, apenas o total ja convertido para peixe-equivalente). As abas diarias
tem o lancamento cru, e e nele que estao:

  * inicio, final, chegada, transferencia e perda de CADA insumo;
  * o salmao separado por FAIXA (08/10, 10/12, 12/14, 14/16), que a aba de
    consumo nao mostra.

Com isso o CDE Web passa a receber a movimentacao inteira, e o salmao
equivalente deixa de ser importado: ele e CALCULADO a partir das faixas, pelos
mesmos fatores que o sistema ja usa (08/10 = 1,00; 10/12 = 1,25; 12/14 = 1,48;
14/16 = 1,67).

Cada bloco da planilha traz no proprio titulo o uso que a casa calculou
("LIBRA (08/10) - USO = 6,000"). Isso vira conferencia automatica: se a conta
do sistema nao bate com a da planilha, a linha aparece no relatorio em vez de
entrar calada.

Uso:
    python importar_diario.py                    confere tudo e mostra o relatorio
    python importar_diario.py --gravar           mescla em dados/lancamentos.json
    python importar_diario.py --casa SL          so uma casa
    python importar_diario.py --mes 08           so um mes
"""
import json
import re
import shutil
import sys
import tempfile
import unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
ORIGEM = (RAIZ / ".." / ".." / ".." / "Documentos 2026" / "CDE - Controle Diário de Estoque").resolve()
DESTINO = RAIZ / "dados" / "lancamentos.json"
BACKUPS = RAIZ / "backups"

CASAS = ["SL", "DC", "DLU", "DLCN"]
FATOR_LIBRA = {"salmao_0810": 1.00, "salmao_1012": 1.25, "salmao_1214": 1.48, "salmao_1416": 1.67}
MARCA_PLANILHA = "_fonte"

# Titulo do bloco (ou da secao, quando o bloco vem sem nome) -> insumo do CDE.
# A comparacao e por "comeca com", sobre o texto sem acento e em maiuscula.
MAPA = [
    ("LIBRA (08/10", "salmao_0810"),
    ("LIBRA (10/12", "salmao_1012"),
    ("LIBRA (12/14", "salmao_1214"),
    ("LIBRA (14/16", "salmao_1416"),
    ("LIBRA (00/00", "salmao_1416"),      # faixa ainda nao nomeada na planilha
    ("FILE PRODUCAO", "salmao_file"),
    ("CAMARAO G - S/RABO", "camarao_g"),
    ("CAMARAO M - S/RABO", "camarao_m"),
    ("CAMARAO P - S/RABO", "camarao_p"),
    ("KANI", "kani"),
    ("ANCHOVA", "anchova"),
    ("NORI", "nori"),
    ("CREAM CHEESE", "cream_cheese"),
    ("ARROZ DE SUSHI", "arroz"),
    ("FILE DE TILAPIA", "file_tilapia"),
    ("PATINHO", "patinho"),
]
# Itens que a planilha quebra em IN NATURA e PROCESSADO: o CDE acompanha o
# PROCESSADO, que e o que vai para o balcao. O in natura e materia-prima do
# processamento e ja esta contado dentro dele.
MAPA_PROCESSADO = [
    ("ANEL DE LULA", "lula"),
    ("TENTACULO DE LULA", "polvo"),
    ("LOMBO DE ATUM", "atum"),
]
# Blocos que existem na planilha e nao entram no CDE Web
IGNORAR = ["CAMARAO P - C/RABO", "RASPA DE SALMAO", "APARA DE SALMAO", "PELE DE SALMAO",
           "CAMARAO P (GERAL)", "PROCESSAMENTO", "IN NATURA"]

CAMPOS = [("INICIO", "inicial"), ("INÍCIO", "inicial"), ("FINAL", "final"),
          ("CHEGADA", "entrada"), ("TRANSFERENCIA", "transferencia"),
          ("PERDA", "desperdicio")]
COLUNAS = [2, 5, 8, 11]                   # B, E, H, K — os quatro blocos por linha


def sem_acento(s):
    t = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(c for c in t if not unicodedata.combining(c)).upper().strip()


def numero(v):
    return float(v) if isinstance(v, (int, float)) else None


def uso_do_titulo(titulo):
    """O uso que a propria planilha calculou, escrito no titulo do bloco."""
    m = re.search(r"USO\s*=\s*([\d.,]+)", str(titulo or ""))
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


def data_da_aba(v):
    """Le a data escrita na celula, que nem sempre e uma data.

    Janeiro, fevereiro, junho e julho trazem data do Excel; marco, abril e maio
    trazem texto ("05/03/26"). Devolve (ano, mes, dia) ou None.
    """
    if isinstance(v, datetime):
        return (v.year, v.month, v.day)
    t = str(v or "").strip()
    for formato in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            d = datetime.strptime(t, formato)
            return (d.year, d.month, d.day)
        except ValueError:
            continue
    return None


def data_do_dia(arq, aba, celula):
    """A data do lancamento: quem manda e a PASTA e o NOME DA ABA.

    Descoberto na conferencia: o arquivo de abril foi criado copiando o de
    marco, e a data das abas diarias — que ali e texto, nao formula — ficou em
    marco. Confiar na celula fazia abril sobrescrever marco dia a dia, com 550
    series divergentes e o inicio de cada item vindo do mes errado.

    A pasta ("04 - Abril") e o nome da aba ("02") nao mentem: sao o mes e o dia.
    A celula so e usada para descobrir o ANO, e quando ela discorda do resto a
    divergencia entra no relatorio em vez de virar dado errado em silencio.
    """
    dia = int(str(aba).strip())
    mes = int(arq.parts[-2][:2])
    lida = data_da_aba(celula)
    ano = lida[0] if lida else datetime.now().year
    if ano < 2000:
        ano += 2000
    try:
        iso = datetime(ano, mes, dia).strftime("%Y-%m-%d")
    except ValueError:
        return None, None                     # dia 31 em mes de 30: aba sobrando
    divergiu = bool(lida) and (lida[1], lida[2]) != (mes, dia)
    return iso, divergiu


def campo_do_rotulo(rotulo):
    r = sem_acento(rotulo)
    for prefixo, campo in CAMPOS:
        if r.startswith(prefixo):
            return campo
    return None


def insumo_do_titulo(titulo, secao, subtitulo):
    """Descobre o insumo do bloco.

    O titulo do bloco as vezes e so 'USO = 0,000' — nesse caso o nome esta na
    linha de secao, acima (ex.: 'KANI - SUSHIBAR'). Quando a planilha quebra o
    item em IN NATURA e PROCESSADO, o subtitulo desempata.
    """
    t, sc = sem_acento(titulo), sem_acento(secao)
    for alvo in IGNORAR:
        if t.startswith(alvo) or (sc.startswith(alvo) and "PROCESSAMENTO" in t):
            return None
    for prefixo, chave in MAPA:
        if t.startswith(prefixo):
            return chave
    for prefixo, chave in MAPA_PROCESSADO:
        if sc.startswith(prefixo) and sem_acento(subtitulo).startswith("PROCESSADO"):
            return chave
        if t.startswith(prefixo) and sem_acento(subtitulo).startswith("PROCESSADO"):
            return chave
    # bloco sem nome proprio: vale o nome da secao
    for prefixo, chave in MAPA:
        if sc.startswith(prefixo):
            return chave
    return None


def ler_aba_dia(ws, iso):
    """Devolve (data, faturamento, {insumo: campos}) de uma aba de dia."""
    fat = numero(ws.cell(row=9, column=12).value)           # L9
    if not iso:
        return None, None, {}, []

    # secao vigente por coluna: a ultima linha de titulo vista acima do bloco
    secao = {c: "" for c in COLUNAS}
    insumos, conferencias = {}, []

    for r in range(10, ws.max_row + 1):
        # Linha de secao: os titulos dela mandam nas colunas a partir de onde
        # aparecem ate a proxima coluna com titulo. O item processado ocupa duas
        # colunas (IN NATURA e PROCESSADO) e so tem titulo na primeira — sem
        # essa regra, a secao da coluna anterior vazava e o bloco PROCESSADO do
        # anel de lula era lido como nori, que era a secao vizinha.
        titulos_secao = {}
        for c in COLUNAS:
            v = ws.cell(row=r, column=c).value
            if not isinstance(v, str) or not v.strip():
                continue
            abaixo = ws.cell(row=r + 1, column=c).value
            eh_bloco = isinstance(abaixo, str) and campo_do_rotulo(abaixo)
            if not eh_bloco and "USO =" not in v and not campo_do_rotulo(v):
                titulos_secao[c] = v
        if titulos_secao:
            atual = None
            for c in COLUNAS:
                if c in titulos_secao:
                    atual = titulos_secao[c]
                if atual:
                    secao[c] = atual

        for c in COLUNAS:
            titulo = ws.cell(row=r, column=c).value
            if not isinstance(titulo, str) or not titulo.strip():
                continue
            abaixo = ws.cell(row=r + 1, column=c).value
            if not (isinstance(abaixo, str) and campo_do_rotulo(abaixo)):
                continue

            # o subtitulo (IN NATURA / PROCESSADO) vem no proprio titulo do bloco
            chave = insumo_do_titulo(titulo, secao[c], titulo)
            if not chave:
                continue
            campos = insumos.setdefault(chave, {})
            for k in range(1, 7):
                rot = ws.cell(row=r + k, column=c).value
                if not isinstance(rot, str):
                    continue
                campo = campo_do_rotulo(rot)
                if not campo:
                    continue
                val = numero(ws.cell(row=r + k, column=c + 1).value)
                if val is not None:
                    campos[campo] = round(val, 4)
            uso_planilha = uso_do_titulo(titulo)
            if uso_planilha is not None:
                campos["uso"] = round(uso_planilha, 4)
                # conferencia: a conta do CDE bate com a da planilha?
                meu = (campos.get("inicial", 0) + campos.get("entrada", 0)
                       - campos.get("transferencia", 0) - campos.get("final", 0))
                if abs(meu - uso_planilha) > 0.011:
                    conferencias.append((chave, uso_planilha, round(meu, 3)))
    return iso, fat, insumos, conferencias


def equivalente(insumos):
    """Salmao equivalente 08/10, calculado das faixas — nunca importado."""
    fora = {}
    tem = False
    for campo in ("inicial", "final", "entrada", "transferencia", "desperdicio", "uso"):
        soma, achou = 0.0, False
        for faixa, fator in FATOR_LIBRA.items():
            v = (insumos.get(faixa) or {}).get(campo)
            if v is not None:
                soma += v * fator
                achou = True
        if achou:
            fora[campo] = round(soma, 4)
            tem = True
    return fora if tem else None


def abrir(arq):
    """Abre a planilha mesmo com o Excel segurando o arquivo."""
    import openpyxl
    try:
        return openpyxl.load_workbook(arq, data_only=True)
    except PermissionError:
        copia = Path(tempfile.gettempdir()) / ("cde_tmp_" + arq.name)
        try:
            shutil.copy(arq, copia)
        except PermissionError:
            return None
        return openpyxl.load_workbook(copia, data_only=True)


def importar(arquivos=None, casa_filtro=None, mes_filtro=None):
    if not ORIGEM.exists():
        raise SystemExit("Pasta de origem nao encontrada:\n  %s" % ORIGEM)
    if arquivos is None:
        arquivos = sorted(ORIGEM.glob("*/*/*.xlsm"))
    dados, relato, divergencias, bloqueados, datas_erradas = {}, [], [], [], []

    for arq in [Path(a) for a in arquivos]:
        casa = arq.parts[-3]
        if casa not in CASAS or (casa_filtro and casa != casa_filtro):
            continue
        if mes_filtro and not arq.parts[-2].startswith(mes_filtro):
            continue
        wb = abrir(arq)
        if wb is None:
            bloqueados.append("%s / %s" % (casa, arq.parts[-2]))
            continue
        dias = 0
        for aba in wb.sheetnames:
            if not re.fullmatch(r"\d{1,2}", aba.strip()):
                continue
            iso, divergiu = data_do_dia(arq, aba, wb[aba].cell(row=7, column=12).value)
            if divergiu:
                datas_erradas.append("%s %s aba %s" % (casa, arq.parts[-2], aba))
            iso, fat, insumos, confs = ler_aba_dia(wb[aba], iso)
            if not iso or not fat:            # dia sem faturamento nao vale leitura
                continue
            eq = equivalente(insumos)
            if eq:
                insumos["salmao_equivalente"] = eq
            insumos = {k: v for k, v in insumos.items() if v}
            if not insumos:
                continue
            dia = dados.setdefault(iso, {})
            dia[casa] = {"faturamento": round(fat, 2), "insumos": insumos}
            dias += 1
            for chave, planilha, meu in confs:
                divergencias.append((casa, iso, chave, planilha, meu))
        wb.close()
        relato.append((casa, arq.parts[-2], dias))
    return dados, relato, divergencias, bloqueados, datas_erradas


def comparar_com_atual(novos):
    """Confere o uso novo contra o que ja esta gravado (veio das abas CONSUMO)."""
    if not DESTINO.exists():
        return []
    with open(DESTINO, encoding="utf-8") as f:
        atual = json.load(f)
    fora = []
    for iso, dia in novos.items():
        for casa, lan in dia.items():
            velho = ((atual.get(iso) or {}).get(casa) or {}).get("insumos") or {}
            for ik, campos in lan["insumos"].items():
                a, b = velho.get(ik, {}).get("uso"), campos.get("uso")
                if a is None or b is None:
                    continue
                if abs(float(a) - float(b)) > max(0.02, abs(float(a)) * 0.02):
                    fora.append((casa, iso, ik, float(a), float(b)))
    return fora


def gravar(novos):
    """Mescla preservando o que foi digitado no sistema, como a sincronizacao faz."""
    atual = {}
    if DESTINO.exists():
        with open(DESTINO, encoding="utf-8") as f:
            atual = json.load(f)
    BACKUPS.mkdir(exist_ok=True)
    carimbo = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    if DESTINO.exists():
        shutil.copy(DESTINO, BACKUPS / ("lancamentos_antes-do-diario_%s.json" % carimbo))
    tocados = 0
    for iso, dia in novos.items():
        alvo = atual.setdefault(iso, {})
        for casa, lan in dia.items():
            destino = alvo.get(casa)
            if not isinstance(destino, dict):
                destino = alvo[casa] = {}
            insumos = destino.setdefault("insumos", {})
            for ik, campos in lan["insumos"].items():
                antigo = insumos.get(ik)
                if isinstance(antigo, dict) and antigo.get(MARCA_PLANILHA) != "planilha":
                    continue                  # digitado na tela: preservado
                marcado = dict(campos)
                marcado[MARCA_PLANILHA] = "planilha"
                insumos[ik] = marcado
                tocados += 1
            if not destino.get("faturamento"):
                destino["faturamento"] = lan["faturamento"]
    tmp = DESTINO.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(atual, f, ensure_ascii=False, indent=1)
    tmp.replace(DESTINO)
    return tocados


def main():
    casa = mes = None
    if "--casa" in sys.argv:
        casa = sys.argv[sys.argv.index("--casa") + 1]
    if "--mes" in sys.argv:
        mes = sys.argv[sys.argv.index("--mes") + 1]
    novos, relato, divergencias, bloqueados, datas_erradas = importar(casa_filtro=casa, mes_filtro=mes)

    print("PLANILHAS LIDAS")
    for c, m, dias in relato:
        print("  %-5s %-14s %3d dia(s)" % (c, m, dias))
    if bloqueados:
        print("  bloqueadas (abertas no Excel): " + ", ".join(bloqueados))
    print("\n%d dia(s) montado(s)" % len(novos))
    if datas_erradas:
        print("\nDATA ESCRITA NA ABA DIVERGE DA PASTA (a pasta prevaleceu): %d aba(s)"
              % len(datas_erradas))
        print("   " + ", ".join(datas_erradas[:6]) + (" ..." if len(datas_erradas) > 6 else ""))
        print("   Vale corrigir na planilha: o arquivo foi copiado do mes anterior")
        print("   e a data das abas ficou para tras.")

    print("\nCONFERENCIA CONTRA A PROPRIA PLANILHA (uso do titulo do bloco)")
    if divergencias:
        print("  %d linha(s) em que inicio+chegada-transferencia-final nao bate com o uso:" % len(divergencias))
        for c, iso, ik, planilha, meu in divergencias[:15]:
            print("     %-5s %s %-18s planilha=%-9s calculado=%s" % (c, iso, ik, planilha, meu))
    else:
        print("  tudo bate")

    print("\nCONFERENCIA CONTRA O QUE JA ESTA NO SISTEMA (abas CONSUMO)")
    difs = comparar_com_atual(novos)
    if difs:
        print("  %d serie(s) com uso diferente (acima de 2%%):" % len(difs))
        for c, iso, ik, a, b in difs[:15]:
            print("     %-5s %s %-20s atual=%-10.3f diario=%.3f" % (c, iso, ik, a, b))
    else:
        print("  o uso importado bate com o que ja estava gravado")

    if "--gravar" in sys.argv:
        n = gravar(novos)
        print("\n%d campo(s) gravado(s) em dados/lancamentos.json (backup em backups/)." % n)
    else:
        print("\n(sem --gravar: nada foi alterado)")


if __name__ == "__main__":
    main()
