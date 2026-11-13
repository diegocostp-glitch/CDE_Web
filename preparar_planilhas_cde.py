# -*- coding: utf-8 -*-
"""
Prepara as planilhas mensais do CDE (.xlsm) para ESPELHAR o sistema.

Por que existe: a partir de 29/10/2026 o controle diario e lancado so na tela
de Lancamento Diario. As planilhas das casas continuam sendo o documento de
consulta (abas CONSUMO, coeficiente, graficos), entao precisam mostrar o que
foi lancado — mas gravar a .xlsm por programa e arriscado: o openpyxl descarta
graficos, botoes, consultas e validacoes ao salvar.

A saida e a planilha PUXAR o dado:

  * o sistema grava "dados/consolidado/CDE <ano> - <CASA>.xlsx", aba PLANILHA
    (uma linha por dia, uma coluna por celula de digitacao — consolidar_cde.py);
  * cada .xlsm tem a consulta Power Query SISTEMA_CDE, que le essa aba para a
    aba oculta SISTEMA ao abrir o arquivo;
  * as celulas de digitacao das abas diarias viram formula que procura a
    coluna da celula pela data da aba (L7).

Toda alteracao na .xlsm e feita pelo PROPRIO Excel (automacao COM): e ele que
salva, entao macros, graficos e consultas continuam como estavam. Antes de
mexer, cada arquivo e copiado para backups/planilhas-cde/<carimbo>/.

Comandos:
    python preparar_planilhas_cde.py corrigir             formulas padrao em jan..out
    python preparar_planilhas_cde.py base                 BASE neutra, ja ligada ao sistema
    python preparar_planilhas_cde.py ligar 2026-10 --de 29   liga dias de um mes existente
    python preparar_planilhas_cde.py novo-mes 2026-11     cria o mes nas 4 casas a partir da BASE
    python preparar_planilhas_cde.py religar              reinstala a consulta nos meses ligados
Opcoes: --raiz <pasta> (padrao: a pasta das planilhas), --casa SL.
"""
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

import consolidar_cde as cc
from importar_diario import ORIGEM, CASAS

RAIZ = Path(__file__).parent
CONSOLIDADO = RAIZ / "dados" / "consolidado"
BACKUPS = RAIZ / "backups" / "planilhas-cde"
NOME_BASE = "CDE - Controle Diário de Estoque - BASE.xlsm"
FATURAMENTO = (RAIZ / ".." / ".." / ".." / "Documentos 2026" /
               "Coeficiente de Consumo 2026" / "Faturamento - 2026.xlsx").resolve()

UNIDADES = {"SL": "UNIDADE SENADOR LEMOS", "DC": "UNIDADE DUQUE DE CAXIAS",
            "DLU": "UNIDADE DELIVERY UMARIZAL", "DLCN": "UNIDADE CIDADE NOVA"}
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
         "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
SIGLAS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

# Vinculos e consulta herdados de modelos antigos, sem uso: o vinculo para a
# planilha de 2023, o vinculo para o modelo "UNIDADE (SIGLA)" de 2025 e a
# consulta FATURAMENTO - DLU, que aponta para um arquivo de 2025 noutro
# computador (C:\Users\sushi) e estava em todas as casas, nao so na DLU.
VINCULOS_MORTOS = ("Documentos 2023", "UNIDADE (SIGLA)")
CONSULTA_MORTA = "FATURAMENTO - DLU"

# Fator do peixe-equivalente 08/10 por libragem, o mesmo do sistema
# (server.FATOR_LIBRA). A planilha usava 1 para a ultima faixa, que ainda se
# chamava "LIBRA (00/00)".
FATOR_1416 = "1.67"

COLS = "ABCDEFGHIJKL"
VALOR_DE = {"B": "C", "E": "F", "H": "I", "K": "L"}      # rotulo -> coluna do numero
# Blocos com celula de uso na linha inicio+5 (o bloco 25, subprodutos, nao tem)
BLOCOS_COM_USO = (16, 34, 43, 52, 61, 70)
INICIOS = [(16, "CFIL"), (25, "FIL"), (34, "CFIL"), (43, "CFIL"),
           (52, "CFI"), (61, "CFI"), (70, "CFI")]


def uso(col, ini):
    """inicio + chegada - transferencia - final - perda: perda nao e consumo."""
    return "%s%d+%s%d-%s%d-%s%d-%s%d" % (col, ini, col, ini + 2, col, ini + 3,
                                         col, ini + 1, col, ini + 4)


# Titulo de cada bloco (linha acima do inicio): o texto antes do "USO =".
# None = bloco sem nome proprio, o nome esta na linha de secao acima.
TITULOS = {
    "B15": "LIBRA (08/10)", "E15": "LIBRA (10/12)", "H15": "LIBRA (12/14)",
    "K15": "LIBRA (14/16)",
    "E24": "RASPA DE SALMÃO", "H24": "APARA DE SALMÃO", "K24": "PELE DE SALMÃO",
    "B33": "CAMARÃO G - S/RABO (31/35)", "E33": "CAMARÃO M - S/RABO (31/50)",
    "H33": "CAMARÃO P - S/RABO (51/70) ", "K33": "CAMARÃO P - C/RABO (51/70) ",
    "B42": None, "E42": None, "H42": None, "K42": None,
    "B51": None, "E51": "IN NATURA", "H51": "PROCESSADO",
    "B60": None, "E60": "IN NATURA", "H60": "PROCESSADO",
    "B69": None, "E69": "IN NATURA", "H69": "PROCESSADO",
}


def formulas_padrao():
    """{celula: formula} que toda aba diaria deve ter, igual nas quatro casas."""
    fora = {}
    for cel, nome in TITULOS.items():
        v, ini = VALOR_DE[cel[0]], int(cel[1:]) + 1
        texto = 'TEXT(%s,"0,000")' % uso(v, ini)
        if nome is None:
            fora[cel] = '=" USO = "&' + texto
        elif nome in ("IN NATURA", "PROCESSADO"):
            fora[cel] = '="%s - USO = "&%s' % (nome, texto)
        else:
            fora[cel] = '="%s"&" - USO = "&%s' % (nome, texto)
    # celula de uso de cada bloco (linha inicio+5), a que as abas CONSUMO leem
    for ini, cols in INICIOS:
        if ini in BLOCOS_COM_USO:
            for c in cols:
                fora["%s%d" % (c, ini + 5)] = "=" + uso(c, ini)
                # ao lado, entrada menos saida, que as abas CONSUMO tambem leem
                if ini != 16:
                    rot = {"C": "B", "F": "E", "I": "H", "L": "K"}[c]
                    fora["%s%d" % (rot, ini + 5)] = "=%s%d-%s%d" % (c, ini + 2, c, ini + 3)
    for ini in (52, 61, 70):                  # itens processados: totais do par
        u = ini + 5
        fora["H%d" % u] = "=I%d-I%d-L%d" % (ini + 2, ini + 3, ini + 1)
        fora["J%d" % u] = "=F%d+I%d" % (ini + 1, ini + 1)
        fora["K%d" % u] = "=E%d+H%d" % (u, u)
        fora["L%d" % u] = "=F%d+I%d" % (ini + 4, ini + 4)
    fora.update({
        "D21": "=C18-C19+F18-F19+I18-I19+L18-L19",
        # equivalente 08/10, com o fator do sistema para a 14/16
        "B21": "=(C17)+(F17/0.8)+(I17*1.48)+(L17*%s)" % FATOR_1416,
        "E21": "=(C17)+(F17/0.8)+(I17*1.48)+(L17*%s)" % FATOR_1416,
        "F30": "=C21*1+F21/0.8+I21*1.48+L21*%s" % FATOR_1416,
        # processamento: perda e rendimento (SL maio tinha #REF! e o processado
        # do polvo lendo o in natura)
        "L54": '=IF(L52="","",L52-L53)', "L55": '=IFERROR(L53/L52,"")',
        "L63": '=IF(L61="","",L61-L62)', "L64": '=IFERROR(L62/L61,"")',
        "L72": '=IF(L70="","",L70-L71)', "L73": '=IFERROR(L71/L70,"")',
    })
    return fora


PADRAO = formulas_padrao()


def normal(f):
    return re.sub(r"\s+", "", str(f or "")).replace("$", "").upper()


# ------------------------------------------------------------------ Excel
class Excel:
    """Uma instancia propria do Excel, invisivel, que nunca pergunta nada."""

    def __enter__(self):
        import win32com.client
        self.app = win32com.client.DispatchEx("Excel.Application")
        self.app.Visible = False
        self.app.DisplayAlerts = False
        self.app.AskToUpdateLinks = False
        self.app.EnableEvents = False
        return self

    def abrir(self, arq):
        wb = self.app.Workbooks.Open(str(arq), UpdateLinks=0)
        if wb.ReadOnly:
            wb.Close(False)
            raise RuntimeError("aberto em outro lugar (somente leitura): %s" % arq.name)
        # Aberto do OneDrive, o Excel liga o salvamento automatico: um erro no
        # meio deixaria o arquivo gravado pela metade. So o salvar() grava.
        try:
            wb.AutoSaveOn = False
        except Exception:
            pass
        self.app.Calculation = -4135          # manual enquanto escreve
        return wb

    def salvar(self, wb):
        self.app.Calculation = -4105          # automatico: e o modo que vai no arquivo
        self.app.CalculateFull()
        wb.Save()
        wb.Close(False)

    def __exit__(self, *_):
        try:
            for wb in list(self.app.Workbooks):
                wb.Close(False)
        finally:
            self.app.Quit()


def abas_diarias(wb):
    return [ws for ws in wb.Worksheets if re.fullmatch(r"\d\d", ws.Name)]


class Desprotegida:
    """Desprotege a aba enquanto mexe e protege de novo como estava."""

    def __init__(self, ws):
        self.ws, self.estava = ws, bool(ws.ProtectContents)

    def __enter__(self):
        if self.estava:
            self.ws.Unprotect("")
        return self.ws

    def __exit__(self, *_):
        if self.estava:
            self.ws.Protect("", True, True, True)


def grade(ws, propriedade="Formula"):
    """{"C17": valor} de A1:L95 numa chamada so (COM celula a celula e lento)."""
    linhas = getattr(ws.Range("A1:L95"), propriedade)
    return {"%s%d" % (COLS[c], r + 1): v for r, linha in enumerate(linhas)
            for c, v in enumerate(linha)}


# ------------------------------------------------------------- correcoes
def padronizar_aba(ws, anterior, log):
    """Formulas padrao, encadeamento do inicio e atalho final=inicio."""
    f = grade(ws)
    # Formula devolve constante como TEXTO ("5"): o numero vem do Value2
    val = grade(ws, "Value2")
    val_ant = grade(anterior, "Value2") if anterior is not None else {}
    mudou = 0
    with Desprotegida(ws):
        # formulas de uso, titulos, fator e as fixas
        for cel, nova in PADRAO.items():
            if normal(nova) != normal(f.get(cel)):
                ws.Range(cel).Formula = nova
                mudou += 1
        # Inicio digitado no lugar da formula que puxa o final da vespera: volta
        # a formula SO quando o numero digitado e o proprio final da vespera —
        # ai nada muda no valor. Quando difere, foi acerto de contagem: fica e
        # sai no relatorio para decisao.
        if anterior is not None:
            for ini, cols in INICIOS:
                for col in cols:
                    cel, fim_ontem = "%s%d" % (col, ini), "%s%d" % (col, ini + 1)
                    atual = f.get(cel)
                    if isinstance(atual, str) and atual.startswith("="):
                        continue
                    ontem = val_ant.get(fim_ontem)
                    ontem = ontem if isinstance(ontem, (int, float)) else 0
                    num = val.get(cel)
                    num = num if isinstance(num, (int, float)) else 0
                    if abs(num - ontem) < 0.0005:
                        ws.Range(cel).Formula = "='%s'!%s" % (anterior.Name, fim_ontem)
                        mudou += 1
                    else:
                        log.append("inicio digitado diferente da vespera: aba %s %s = %s "
                                   "(vespera %s)" % (ws.Name, cel, atual, ontem))
        # "final = inicio" digitado como formula (=F25): vira o numero
        for cel in cc.celulas_da_planilha():
            atual = f.get(cel)
            if isinstance(atual, str) and re.fullmatch(r"=\$?[A-L]\$?\d+", atual):
                r = ws.Range(cel)
                r.Value2 = r.Value2
                mudou += 1
    return mudou


def limpar_herancas(wb, log):
    for link in list(wb.LinkSources(1) or []):
        if any(m in link for m in VINCULOS_MORTOS):
            wb.BreakLink(link, 1)
            log.append("vinculo removido: %s" % link.split("/")[-1])
    for q in list(wb.Queries):
        if q.Name == CONSULTA_MORTA:
            q.Delete()
            log.append("consulta removida: %s" % CONSULTA_MORTA)
    for c in list(wb.Connections):
        if CONSULTA_MORTA in c.Name:
            c.Delete()


# ------------------------------------------------------- ligar ao sistema
# A base e procurada A PARTIR DA PASTA DA PROPRIA PLANILHA: sobe N pastas e
# desce ate dados/consolidado. Assim o mesmo arquivo funciona em qualquer
# computador que sincronize o OneDrive, seja qual for o usuario do Windows.
# A pasta vem de CELL("filename") (nome PASTA_DA_PLANILHA, aba SISTEMA).
# Com o Office sincronizando o OneDrive, o Excel abre o arquivo pelo endereco
# https://d.docs.live.net/<id>/...: ai a consulta precisa da pasta local do
# OneDrive, que tira da pasta atual do Excel, INFO("directory") (nome
# PASTA_DO_EXCEL), em geral C:\Users\<usuario>\OneDrive\Documentos. Nao
# varre C:\Users: pasta de outro usuario barra o Power Query sem "try".
CELULAS = {"PASTA_DA_PLANILHA": ("ZZ1", '=LEFT(CELL("filename",ZZ1),FIND("[",CELL("filename",ZZ1))-2)'),
           "PASTA_DO_EXCEL": ("ZZ2", '=INFO("directory")')}   # longe da tabela (ate DS)


def relativo(alvo, pasta):
    """(quantas pastas subir, resto do caminho) de pasta ate alvo."""
    # realpath nos dois: o Excel pode devolver o nome curto (SUPRIM~1)
    partes = Path(os.path.relpath(os.path.realpath(alvo), os.path.realpath(pasta))).parts
    subir = sum(1 for p in partes if p == "..")
    return subir, "\\".join(partes[subir:])


def m_consulta(subir, resto):
    colunas = ["data"] + list(cc.celulas_da_planilha()) + list(cc.CELULAS_PROC)
    lista = "{" + ", ".join('"%s"' % c for c in colunas) + "}"
    # Sem destino (a BASE) da tabela vazia; arquivo nao achado da ERRO ao abrir,
    # de proposito: planilha mostrando zero por arquivo nao achado seria pior.
    # CAMINHO_SISTEMA, quando preenchido, passa por cima do caminho automatico.
    return """let
    Colunas = %s,
    Subir = %d,
    Resto = "%s",
    Celula = (nome) => try Excel.CurrentWorkbook(){[Name=nome]}[Content]{0}[Column1] otherwise "",
    Pasta = Celula("PASTA_DA_PLANILHA"),
    NaWeb = Text.StartsWith(Pasta, "http"),
    Partes = if NaWeb then List.Skip(Text.Split(Pasta, "/"), 4) else Text.Split(Pasta, "\\"),
    Destino = Text.Combine(List.FirstN(Partes, List.Count(Partes) - Subir) & {Resto}, "\\"),
    Atual = List.Select(Text.Split(Celula("PASTA_DO_EXCEL"), "\\"), each _ <> ""),
    NoAtual = List.PositionOf(List.Transform(Atual, each Text.StartsWith(_, "OneDrive")), true),
    Usuario = if List.Count(Atual) >= 3 and Text.Lower(Atual{1}) = "users"
        then Text.Combine(List.FirstN(Atual, 3), "\\") else null,
    Raizes = List.Distinct(
        (if NoAtual >= 0 then {Text.Combine(List.FirstN(Atual, NoAtual + 1), "\\")} else {})
        & (if Usuario = null then {} else try List.Transform(Table.SelectRows(Folder.Contents(Usuario),
            each Text.StartsWith([Name], "OneDrive") and [Attributes]?[Directory]? = true)[Name],
            each Usuario & "\\" & _) otherwise {})),
    NoOneDrive = List.First(List.Select(List.Transform(Raizes, each _ & "\\" & Destino),
        each not (try Binary.Length(File.Contents(_)))[HasError]), null),
    Automatico = if Resto = "" then ""
        else if not NaWeb then Destino
        else if NoOneDrive <> null then NoOneDrive
        else error Error.Record("CDE Web",
            "Base do CDE Web nao achada no OneDrive deste computador. Preencha CAMINHO_SISTEMA.", Destino),
    Caminho = if CAMINHO_SISTEMA <> "" then CAMINHO_SISTEMA else Automatico,
    Fonte = if Caminho = "" then null else Excel.Workbook(File.Contents(Caminho), null, true),
    Tabela = if Fonte = null then #table(Colunas, {})
        else Table.SelectColumns(Table.PromoteHeaders(Fonte{[Item="PLANILHA",Kind="Sheet"]}[Data],
            [PromoteAllScalars=true]), Colunas, MissingField.UseNull),
    Tipos = Table.TransformColumnTypes(Tabela,
        {{"data", type date}} & List.Transform(List.Skip(Colunas), each {_, type number}))
in
    Tipos""" % (lista, subir, resto.replace('"', '""'))


def m_caminho(caminho):
    return ('"%s" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=false]'
            % caminho.replace('"', '""'))


def marcar_pasta(wb, ws):
    """Celulas com a pasta da planilha e a pasta atual do Excel, lidas pela consulta."""
    for nome, (cel, formula) in CELULAS.items():
        ws.Range(cel).Formula = formula
        try:
            wb.Names(nome).Delete()
        except Exception:
            pass
        wb.Names.Add(nome, "=SISTEMA!" + ws.Range(cel).Address)
    # A consulta junta celulas desta pasta de trabalho com o arquivo da base:
    # sem isso o Power Query barra a combinacao pelos niveis de privacidade.
    wb.Queries.FastCombine = True


def instalar_consulta(wb, arq, alvo, abrir_atualiza=True):
    """Consulta SISTEMA_CDE lendo `alvo` (a base da casa; None na BASE), na aba SISTEMA.

    `arq` e o caminho local da planilha: o wb.Path pode ser o endereco https.
    """
    subir, resto = relativo(alvo, arq.parent) if alvo else (0, "")
    nomes = {q.Name: q for q in wb.Queries}
    # o parametro fica vazio: so serve para forcar um caminho na mao
    if "CAMINHO_SISTEMA" in nomes:
        nomes["CAMINHO_SISTEMA"].Formula = m_caminho("")
    else:
        wb.Queries.Add("CAMINHO_SISTEMA", m_caminho(""),
                       "Vazio = automatico. Preencha so para forcar o arquivo da base desta casa")
    try:
        ws = wb.Worksheets("SISTEMA")
    except Exception:
        ws = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
        ws.Name = "SISTEMA"
    marcar_pasta(wb, ws)
    ws.Calculate()
    if "SISTEMA_CDE" in nomes:
        nomes["SISTEMA_CDE"].Formula = m_consulta(subir, resto)
    else:
        wb.Queries.Add("SISTEMA_CDE", m_consulta(subir, resto),
                       "Lancamentos do CDE Web, um dia por linha")
    if ws.ListObjects.Count:
        lo = ws.ListObjects(1)
    else:
        lo = ws.ListObjects.Add(
            0, 'OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;'
               'Location=SISTEMA_CDE;Extended Properties=""', None, 1, ws.Range("A1"))
        lo.QueryTable.CommandType = 2
        lo.QueryTable.CommandText = "SELECT * FROM [SISTEMA_CDE]"
    lo.QueryTable.BackgroundQuery = False
    lo.QueryTable.RefreshOnFileOpen = abrir_atualiza
    lo.QueryTable.Refresh(False)
    lo.Name = "SISTEMA_CDE"
    ws.Visible = 0                            # oculta; as macros de navegacao a respeitam
    return lo.ListRows.Count


def ligar_aba(ws, anterior):
    """Celulas de digitacao da aba passam a ler o sistema pela data (L7)."""
    alvo = list(cc.celulas_da_planilha()) + list(cc.CELULAS_PROC)
    iniciais = {"%s%d" % (c, i) for i, cols in INICIOS for c in cols}
    with Desprotegida(ws):
        for cel in alvo:
            busca = "INDEX(SISTEMA_CDE[%s],MATCH($L$7,SISTEMA_CDE[data],0))" % cel
            if cel in iniciais:
                # o inicio gravado no sistema (que ja e o final da vespera, salvo
                # correcao feita na tela); sem o dia la, o final da aba anterior
                ontem = ("'%s'!%s%d" % (anterior.Name, cel[0], int(cel[1:]) + 1)
                         if anterior is not None else "0")
                f = "=IF(ISNUMBER(%s),%s,%s)" % (busca, busca, ontem)
            else:
                f = "=IFERROR(%s,0)" % busca
            r = ws.Range(cel)
            r.Formula = f
            r.Locked = True                   # o lancamento e no sistema, nao aqui


# --------------------------------------------------------------- comandos
def arquivo_do_mes(raiz, casa, ano_mes):
    m = int(ano_mes[5:7])
    pasta = raiz / casa / ("%02d - %s" % (m, MESES[m - 1]))
    return pasta / ("CDE - Controle Diário de Estoque - %s.%s.xlsm" % (casa, SIGLAS[m - 1]))


def caminho_base(casa, ano):
    return str((CONSOLIDADO / ("CDE %s - %s.xlsx" % (ano, casa))).resolve())


def backup(arquivos, raiz):
    if raiz.resolve() != ORIGEM.resolve():
        return None                           # ensaio numa copia: sem backup
    destino = BACKUPS / datetime.now().strftime("%Y-%m-%d_%H%M%S")
    for a in arquivos:
        alvo = destino / a.relative_to(raiz)
        alvo.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(a, alvo)
    return destino


def cmd_corrigir(raiz, casas, meses):
    arquivos = [a for c in casas for m in meses
                if (a := arquivo_do_mes(raiz, c, "2026-%02d" % m)).exists()]
    print("backup:", backup(arquivos, raiz))
    # Uma instancia do Excel por arquivo: reaproveitar a mesma fazia o segundo
    # Workbooks.Open falhar depois de um arquivo com consulta e vinculos.
    for arq in arquivos:
        with Excel() as xl:
            log = []
            wb = xl.abrir(arq)
            limpar_herancas(wb, log)
            abas = abas_diarias(wb)
            n = sum(padronizar_aba(ws, abas[i - 1] if i else None, log)
                    for i, ws in enumerate(abas))
            xl.salvar(wb)
            print("%s: %d celula(s)" % (arq.name, n))
            for linha in log:
                print("   " + linha)


def cmd_ligar(raiz, casas, ano_mes, de_dia):
    arquivos = [arquivo_do_mes(raiz, c, ano_mes) for c in casas]
    print("backup:", backup(arquivos, raiz))
    for casa, arq in zip(casas, arquivos):
        with Excel() as xl:
            wb = xl.abrir(arq)
            n = instalar_consulta(wb, arq, caminho_base(casa, ano_mes[:4]))
            abas = abas_diarias(wb)
            for i, ws in enumerate(abas):
                if int(ws.Name) >= de_dia:
                    ligar_aba(ws, abas[i - 1] if i else None)
            xl.salvar(wb)
            print("%s: consulta com %d dia(s); abas %02d a 31 ligadas" % (arq.name, n, de_dia))


def encadear_datas(wb):
    """Data de cada aba = aba anterior + 1, como nas planilhas das casas.

    A BASE antiga trazia as datas de junho DIGITADAS nas abas 02..31: o mes
    criado dela ficava com 01/11 na aba 01 e 02/06 na aba 02, e a consulta
    puxava o lancamento de junho. A data e a chave da busca no sistema.
    """
    abas = abas_diarias(wb)
    for anterior, ws in zip(abas, abas[1:]):
        with Desprotegida(ws):
            ws.Range("L7").Formula = "='%s'!L7+1" % anterior.Name


def neutralizar(wb):
    """A BASE e modelo: nada de casa, de mes nem de lancamento."""
    encadear_datas(wb)
    abas = abas_diarias(wb)
    wb.Worksheets("01").Range("E4").Value2 = "ESCOLHA A UNIDADE"
    wb.Worksheets("01").Range("L7").MergeArea.ClearContents()
    for i, ws in enumerate(abas):
        with Desprotegida(ws):
            ws.Range("L9").MergeArea.ClearContents()
            dia = int(ws.Name)
            ws.Range("B11").Formula = ("=IF('CONSUMO - SALMÃO'!I%d=\"\",\"\",'CONSUMO - SALMÃO'!I%d)"
                                       % (4 + dia, 4 + dia))
            for cel in ("E7", "E9", "E11"):
                ws.Range(cel).MergeArea.ClearContents()
            ws.Range("L34:L38").ClearContents()      # camarao P c/ rabo: fora do sistema


def cmd_base(raiz):
    arq = raiz / NOME_BASE
    print("backup:", backup([arq], raiz))
    with Excel() as xl:
        log = []
        wb = xl.abrir(arq)
        limpar_herancas(wb, log)
        abas = abas_diarias(wb)
        for i, ws in enumerate(abas):
            padronizar_aba(ws, abas[i - 1] if i else None, log)
        neutralizar(wb)
        instalar_consulta(wb, raiz / NOME_BASE, None, abrir_atualiza=False)
        for i, ws in enumerate(abas):
            ligar_aba(ws, abas[i - 1] if i else None)
        xl.salvar(wb)
        print("BASE neutra e ligada ao sistema")
        for linha in log:
            print("   " + linha)


def cmd_novo_mes(raiz, casas, ano_mes):
    ano, m = int(ano_mes[:4]), int(ano_mes[5:7])
    col_fat = 4 + 3 * (m - 1)                 # D = janeiro, AE = outubro, AH = novembro
    letra = ""
    n = col_fat
    while n:
        n, r = divmod(n - 1, 26)
        letra = chr(65 + r) + letra
    for casa in casas:
        arq = arquivo_do_mes(raiz, casa, ano_mes)
        if arq.exists():
            print("%s ja existe: nao foi tocado" % arq.name)
            continue
        arq.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(raiz / NOME_BASE, arq)
        with Excel() as xl:
            wb = xl.abrir(arq)
            um = wb.Worksheets("01")
            um.Range("E4").Value2 = UNIDADES[casa]
            um.Range("L7").Formula = "=DATE(%d,%d,1)" % (ano, m)
            encadear_datas(wb)
            fat = "'%s\\[%s]FATURAMENTO - %s'!$%s$%%d" % (FATURAMENTO.parent, FATURAMENTO.name,
                                                       casa, letra)
            for ws in abas_diarias(wb):
                with Desprotegida(ws):
                    ws.Range("L9").Formula = "=" + fat % (3 + int(ws.Name))
            n = instalar_consulta(wb, arq, caminho_base(casa, ano))
            xl.salvar(wb)
            print("%s criado: consulta com %d dia(s), faturamento da coluna %s"
                  % (arq.name, n, letra))


def cmd_religar(raiz, casas):
    """Reinstala a consulta (caminho automatico) nos meses ja ligados ao sistema."""
    arquivos = [a for c in casas for m in range(1, 13)
                if (a := arquivo_do_mes(raiz, c, "2026-%02d" % m)).exists()]
    ligados = []
    for arq in arquivos:
        with Excel() as xl:
            wb = xl.abrir(arq)
            if any(q.Name == "SISTEMA_CDE" for q in wb.Queries):
                ligados.append(arq)
    print("backup:", backup(ligados + [raiz / NOME_BASE], raiz))
    for arq in ligados:
        casa = arq.parent.parent.name
        with Excel() as xl:
            wb = xl.abrir(arq)
            n = instalar_consulta(wb, arq, caminho_base(casa, "2026"))
            xl.salvar(wb)
            print("%s: consulta com %d dia(s)" % (arq.name, n))
    with Excel() as xl:
        wb = xl.abrir(raiz / NOME_BASE)
        instalar_consulta(wb, raiz / NOME_BASE, None, abrir_atualiza=False)
        xl.salvar(wb)
        print("BASE: consulta reinstalada")


def main():
    args = sys.argv[1:]
    raiz = Path(args[args.index("--raiz") + 1]) if "--raiz" in args else ORIGEM
    casas = [args[args.index("--casa") + 1]] if "--casa" in args else CASAS
    if "--consolidado" in args:               # ensaio: base de outra pasta
        global CONSOLIDADO
        CONSOLIDADO = Path(args[args.index("--consolidado") + 1])
    if not args:
        raise SystemExit(__doc__)
    cmd = args[0]
    if cmd == "corrigir":
        cmd_corrigir(raiz, casas, range(1, 11))
    elif cmd == "base":
        cmd_base(raiz)
    elif cmd == "ligar":
        de = int(args[args.index("--de") + 1]) if "--de" in args else 1
        cmd_ligar(raiz, casas, args[1], de)
    elif cmd == "religar":
        cmd_religar(raiz, casas)
    elif cmd == "novo-mes":
        cmd_novo_mes(raiz, casas, args[1])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
