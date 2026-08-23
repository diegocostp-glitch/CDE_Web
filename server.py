# -*- coding: utf-8 -*-
"""
CDE Web - servidor do Controle Diario de Estoque.
Mesmo padrao do Gerador de OCs: biblioteca padrao do Python, sem npm, sem build.

  http://localhost:8935          neste PC
  http://NOME-DO-PC:8935         nos outros PCs da rede

Guarda os lancamentos em dados/lancamentos.json e le o faturamento da
planilha Faturamento - 2026.xlsx (somente leitura, nunca escreve nela).
"""
import http.server, json, os, socket, shutil, threading, traceback
from datetime import datetime, timedelta
from pathlib import Path

PORT = 8935
RAIZ = Path(__file__).parent
DADOS = RAIZ / "dados"
ARQ = DADOS / "lancamentos.json"
BACKUPS = RAIZ / "backups"

# a planilha de faturamento fica fora da pasta do sistema
FATURAMENTO = (RAIZ / ".." / ".." / ".." / "Documentos 2026" /
               "Coeficiente de Consumo 2026" / "Faturamento - 2026.xlsx").resolve()

# fatores de conversao para peixe-equivalente 08/10 (confirmados pela area)
FATOR_LIBRA = {"salmao_0810": 1.00, "salmao_1012": 1.25, "salmao_1214": 1.48, "salmao_1416": 1.67}

CASAS = [
    {"chave": "SL",   "nome": "Senador Lemos"},
    {"chave": "DC",   "nome": "Duque de Caxias"},
    {"chave": "DLU",  "nome": "Delivery Umarizal"},
    {"chave": "DLCN", "nome": "Delivery Cidade Nova"},
]

# unidade: Pxs = peixes, Kg, Pct = pacote, Un = unidade
INSUMOS = [
    {"chave": "salmao_0810",  "nome": "Salmão 08/10",     "un": "Pxs", "grupo": "Salmão", "so_lancamento": True},
    {"chave": "salmao_1012",  "nome": "Salmão 10/12",     "un": "Pxs", "grupo": "Salmão", "so_lancamento": True},
    {"chave": "salmao_1214",  "nome": "Salmão 12/14",     "un": "Pxs", "grupo": "Salmão", "so_lancamento": True},
    {"chave": "salmao_1416",  "nome": "Salmão 14/16",     "un": "Pxs", "grupo": "Salmão", "so_lancamento": True},
    {"chave": "salmao_file",  "nome": "Salmão filé (produção)", "un": "Kg", "grupo": "Salmão", "so_lancamento": True},
    # linha derivada: soma das faixas convertidas para peixe-equivalente 08/10.
    # E ela que o painel usa e que o historico importado alimenta.
    {"chave": "salmao_equivalente", "nome": "Salmão — equivalente 08/10", "un": "Pxs",
     "grupo": "Salmão", "derivado": True},
    {"chave": "camarao_g",    "nome": "Camarão G",        "un": "Kg",  "grupo": "Camarão"},
    {"chave": "camarao_m",    "nome": "Camarão M",        "un": "Kg",  "grupo": "Camarão"},
    {"chave": "camarao_p",    "nome": "Camarão P (sem rabo)", "un": "Kg", "grupo": "Camarão"},
    {"chave": "atum",         "nome": "Atum",             "un": "Kg",  "grupo": "Pescados"},
    {"chave": "file_tilapia", "nome": "Filé de tilápia",  "un": "Kg",  "grupo": "Pescados"},
    {"chave": "polvo",        "nome": "Polvo",            "un": "Kg",  "grupo": "Pescados"},
    {"chave": "lula",         "nome": "Lula",             "un": "Kg",  "grupo": "Pescados"},
    {"chave": "anchova",      "nome": "Anchova",          "un": "Kg",  "grupo": "Pescados"},
    {"chave": "kani",         "nome": "Kani",             "un": "Pct", "grupo": "Outros"},
    {"chave": "nori",         "nome": "Nori",             "un": "Pct", "grupo": "Outros"},
    {"chave": "cream_cheese", "nome": "Cream cheese",     "un": "Kg",  "grupo": "Outros"},
    {"chave": "arroz",        "nome": "Arroz de sushi",   "un": "Kg",  "grupo": "Outros"},
    {"chave": "patinho",      "nome": "Patinho",          "un": "Kg",  "grupo": "Outros"},
]


# --------------------------------------------------------------- armazenamento
# O arquivo de lancamentos passou de 2 MB. A Visao Geral chama totais_do_mes
# quase trinta vezes numa unica resposta (mes, mes anterior e a serie dos doze
# meses, cheia e recortada) — reler e reinterpretar o JSON a cada chamada
# custava mais que todo o resto da conta. O cache vale enquanto o arquivo nao
# mudar; qualquer gravacao troca a data de modificacao e derruba o cache.
_cache_lanc = {"mtime": None, "dados": None}


def carregar():
    if not ARQ.exists():
        return {}
    mt = ARQ.stat().st_mtime
    if _cache_lanc["mtime"] == mt and _cache_lanc["dados"] is not None:
        return _cache_lanc["dados"]
    with open(ARQ, encoding="utf-8") as f:
        dados = json.load(f)
    _cache_lanc.update(mtime=mt, dados=dados)
    return dados


def salvar(dados):
    DADOS.mkdir(exist_ok=True)
    BACKUPS.mkdir(exist_ok=True)
    if ARQ.exists():
        carimbo = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        shutil.copy(ARQ, BACKUPS / ("lancamentos_%s.json" % carimbo))
        antigos = sorted(BACKUPS.glob("lancamentos_*.json"))
        for velho in antigos[:-40]:          # mantem os 40 mais recentes
            velho.unlink()
    tmp = ARQ.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ)                          # troca atomica: nunca deixa arquivo pela metade


# --------------------------------------------------------------- faturamento
_cache_fat = {"quando": None, "dados": {}}


def _abrir_faturamento():
    """Abre a planilha mesmo se o Excel estiver com ela aberta (le uma copia temporaria)."""
    import openpyxl
    try:
        # sem read_only: nesse modo o openpyxl nao faz acesso aleatorio por .cell()
        return openpyxl.load_workbook(FATURAMENTO, data_only=True)
    except PermissionError:
        import tempfile
        copia = Path(tempfile.gettempdir()) / "cde_faturamento_tmp.xlsx"
        shutil.copy(FATURAMENTO, copia)
        return openpyxl.load_workbook(copia, data_only=True)


def ler_faturamento():
    """Le a planilha de faturamento. 4 abas, 12 blocos de 3 colunas (data, dia, valor).

    Nunca deixa a tela cair: se a planilha estiver indisponivel, devolve o ultimo
    cache (ou vazio) e o campo de faturamento fica em branco para digitacao.
    """
    if not FATURAMENTO.exists():
        return _cache_fat["dados"]
    try:
        marca = FATURAMENTO.stat().st_mtime
    except OSError:
        return _cache_fat["dados"]
    if _cache_fat["quando"] == marca:
        return _cache_fat["dados"]
    try:
        wb = _abrir_faturamento()
    except Exception as e:
        print("  [aviso] nao consegui ler o faturamento agora: %s" % e)
        return _cache_fat["dados"]
    fora = {}
    for casa in CASAS:
        aba = "FATURAMENTO - %s" % casa["chave"]
        if aba not in wb.sheetnames:
            continue
        ws = wb[aba]
        for mes in range(12):
            col_data, col_valor = 2 + mes * 3, 4 + mes * 3
            for linha in range(4, 36):
                d = ws.cell(row=linha, column=col_data).value
                v = ws.cell(row=linha, column=col_valor).value
                if isinstance(d, datetime) and isinstance(v, (int, float)) and v > 0:
                    fora.setdefault(d.strftime("%Y-%m-%d"), {})[casa["chave"]] = round(float(v), 2)
    wb.close()
    _cache_fat.update(quando=marca, dados=fora)
    return fora


# --------------------------------------------------------------- calculo
def numero(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


# Marca gravada no insumo que veio da planilha. Quem tem esta marca so muda
# em outra sincronizacao: a tela mostra o campo travado.
MARCA_PLANILHA = "_fonte"


def da_planilha(campos):
    return isinstance(campos, dict) and campos.get(MARCA_PLANILHA) == "planilha"


def montar_dia(data_iso):
    """Devolve o dia pronto para a tela: inicial encadeado, uso e coeficiente calculados."""
    dados = carregar()
    fat = ler_faturamento().get(data_iso, {})
    anterior = (datetime.strptime(data_iso, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    ontem = dados.get(anterior, {})
    hoje = dados.get(data_iso, {})

    saida = {"data": data_iso, "casas": {}}
    for casa in CASAS:
        ck = casa["chave"]
        lan_hoje = hoje.get(ck, {})
        lan_ontem = ontem.get(ck, {})
        faturamento = lan_hoje.get("faturamento")
        if faturamento in (None, ""):
            faturamento = fat.get(ck, 0)
        linhas = []
        for ins in INSUMOS:
            ik = ins["chave"]
            atual = (lan_hoje.get("insumos") or {}).get(ik, {})
            passado = (lan_ontem.get("insumos") or {}).get(ik, {})
            # O inicial normalmente e o final de ontem, encadeado pelo sistema.
            # Quando a planilha da casa traz o inicio lancado (importacao das
            # abas diarias), o numero dela manda: e o que a equipe contou na
            # abertura, e divergir disso esconderia um ajuste feito no balcao.
            inicial = numero(atual["inicial"]) if atual.get("inicial") is not None                 else numero(passado.get("final"))
            final = atual.get("final")
            entrada = atual.get("entrada")
            transferencia = atual.get("transferencia")
            desperdicio = atual.get("desperdicio")
            # mesma conta da planilha: uso = inicio + chegada - transferencia - final
            # (a perda/desperdicio e registrada a parte e nao entra no uso)
            uso = inicial + numero(entrada) - numero(transferencia) - numero(final)
            # historico importado traz o uso pronto (lula, salmao, polvo e atum tem
            # rendimento de processamento embutido). Nesses casos o valor manda.
            importado = atual.get("uso")
            if importado is not None:
                uso, tem_uso = numero(importado), True
            elif ins.get("derivado"):
                # soma das faixas ja calculadas acima, convertidas para 08/10
                uso, tem_uso = 0.0, False
                for banda, fator in FATOR_LIBRA.items():
                    anterior = next((x for x in linhas if x["chave"] == banda), None)
                    if anterior and anterior["uso"] is not None:
                        uso += anterior["uso"] * fator
                        tem_uso = True
                uso = round(uso, 3)
            else:
                tem_uso = final not in (None, "")
            linhas.append({
                "chave": ik, "nome": ins["nome"], "un": ins["un"], "grupo": ins["grupo"],
                "derivado": bool(ins.get("derivado")),
                "inicial": round(inicial, 3),
                "final": final, "entrada": entrada,
                "transferencia": transferencia, "desperdicio": desperdicio,
                "uso": round(uso, 3) if tem_uso else None,
                "importado": importado is not None,
                "travado": da_planilha(atual),
                "alerta": "negativo" if (tem_uso and uso < 0) else None,
            })
        saida["casas"][ck] = {
            "nome": casa["nome"],
            "faturamento": faturamento,
            "faturamento_da_planilha": fat.get(ck) is not None,
            "insumos": linhas,
        }
    return saida


def gravar_dia(corpo):
    data_iso = corpo.get("data")
    if not data_iso:
        raise ValueError("data ausente")
    datetime.strptime(data_iso, "%Y-%m-%d")       # valida o formato
    dados = carregar()
    dia = dados.setdefault(data_iso, {})
    for ck, lan in (corpo.get("casas") or {}).items():
        antigo = (dia.get(ck) or {}).get("insumos") or {}
        limpo = {"faturamento": lan.get("faturamento"), "insumos": {}}
        for ik, campos in (lan.get("insumos") or {}).items():
            if da_planilha(antigo.get(ik)):
                limpo["insumos"][ik] = antigo[ik]      # travado: a tela nao altera
                continue
            vals = {c: campos.get(c) for c in ("final", "entrada", "transferencia",
                                               "desperdicio", "uso", "inicial")
                    if campos.get(c) not in (None, "")}
            if vals:
                limpo["insumos"][ik] = vals
        # insumo travado que a tela nem enviou nao pode desaparecer na gravacao
        for ik, campos in antigo.items():
            if da_planilha(campos):
                limpo["insumos"].setdefault(ik, campos)
        dia[ck] = limpo
    dia["_gravado_em"] = datetime.now().isoformat(timespec="seconds")
    salvar(dados)
    return {"ok": True, "data": data_iso}


def gravar_movimentacao(corpo):
    """Lanca UM movimento avulso, sem passar pela tela de lancamento do dia.

    Existe por causa do botao de acao: quem esta em qualquer tela ve a chegada
    do caminhao e precisa registrar na hora, sem abrir o dia inteiro.

    Diferente de /api/dia, que reescreve o dia da casa inteira com o que a tela
    mandou, aqui a gravacao e cirurgica: entrada, saida e desperdicio SOMAM ao
    que ja existe (sao eventos, e chegam varios no mesmo dia) e a contagem final
    SUBSTITUI (e uma medicao, nao um evento). Nenhum outro insumo e tocado.
    """
    data_iso = corpo.get("data") or datetime.now().strftime("%Y-%m-%d")
    datetime.strptime(data_iso, "%Y-%m-%d")
    casa = (corpo.get("casa") or "").strip()
    insumo = (corpo.get("insumo") or "").strip()
    tipo = (corpo.get("tipo") or "").strip()
    qtd = numero(corpo.get("qtd"))

    if casa not in [c["chave"] for c in CASAS]:
        raise ValueError("casa desconhecida: %s" % casa)
    if insumo not in [i["chave"] for i in INSUMOS]:
        raise ValueError("insumo desconhecido: %s" % insumo)
    if tipo not in ("entrada", "transferencia", "desperdicio", "final"):
        raise ValueError("tipo de movimento invalido: %s" % tipo)
    if tipo != "final" and qtd <= 0:
        raise ValueError("informe uma quantidade maior que zero")
    if qtd < 0:
        raise ValueError("quantidade nao pode ser negativa")

    dados = carregar()
    dia = dados.setdefault(data_iso, {})
    lan = dia.get(casa)
    if not isinstance(lan, dict):
        lan = dia[casa] = {"faturamento": None, "insumos": {}}
    insumos = lan.setdefault("insumos", {})
    campos = insumos.setdefault(insumo, {})
    if da_planilha(campos):
        raise ValueError("este insumo veio da planilha e esta travado no dia %s. "
                         "Corrija na planilha e sincronize." % data_iso)

    antes = numero(campos.get(tipo))
    if tipo == "final":
        campos["final"] = round(qtd, 4)
    else:
        campos[tipo] = round(antes + qtd, 4)
    dia["_gravado_em"] = datetime.now().isoformat(timespec="seconds")
    salvar(dados)

    nome = next(i["nome"] for i in INSUMOS if i["chave"] == insumo)
    return {"ok": True, "data": data_iso, "casa": casa, "insumo": insumo,
            "insumo_nome": nome, "tipo": tipo, "tipo_nome": TIPOS_MOV.get(tipo, "Contagem final"),
            "qtd": round(qtd, 4), "antes": round(antes, 4),
            "total_no_dia": round(numero(campos.get(tipo)), 4),
            "un": next(i["un"] for i in INSUMOS if i["chave"] == insumo)}


# --------------------------------------------------------------- painel
DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
               "sexta-feira", "sábado", "domingo"]
ARQ_METAS = DADOS / "metas.json"


def ler_metas():
    if not ARQ_METAS.exists():
        return {}
    with open(ARQ_METAS, encoding="utf-8") as f:
        return {k: v for k, v in json.load(f).items() if not k.startswith("_")}


def media(v):
    return sum(v) / len(v) if v else 0.0


def desvio(v):
    if len(v) < 2:
        return 0.0
    m = media(v)
    return (sum((x - m) ** 2 for x in v) / len(v)) ** 0.5


def series_do_periodo(inicio, fim):
    """Monta {(insumo, casa): [(data, diaSemana, coeficiente)]} no periodo pedido."""
    dados = carregar()
    serie = {}
    for iso in sorted(dados):
        if not (inicio <= iso <= fim):
            continue
        dia = dados[iso]
        semana = DIAS_SEMANA[datetime.strptime(iso, "%Y-%m-%d").weekday()]
        for ck, lan in dia.items():
            if not isinstance(lan, dict):
                continue
            fat = numero(lan.get("faturamento"))
            if fat <= 0:                       # mesma regra do CDE: sem faturamento, sem leitura
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                uso = campos.get("uso")
                if uso is None:
                    uso = (numero(campos.get("final")) * -1 + numero(campos.get("entrada"))
                           - numero(campos.get("transferencia")))
                    continue                   # sem o uso pronto nao da para comparar
                serie.setdefault((ik, ck), []).append((iso, semana, numero(uso) / fat * 1000))
    return serie


ARQ_CUSTOS = DADOS / "custos.json"


def ler_custos():
    """Custo unitario por insumo (e opcionalmente por casa). Sem ele o painel
    ordena por desvio percentual, que engana: 500% de um item barato pesa menos
    que 8% do salmao."""
    if not ARQ_CUSTOS.exists():
        return {}
    with open(ARQ_CUSTOS, encoding="utf-8") as f:
        return {k: v for k, v in json.load(f).items() if not k.startswith("_")}


def faturamento_por_serie(inicio, fim):
    """Soma do faturamento dos dias em que a serie teve leitura."""
    dados = carregar()
    fora = {}
    for iso in sorted(dados):
        if not (inicio <= iso <= fim):
            continue
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            f = numero(lan.get("faturamento"))
            if f <= 0:
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if campos.get("uso") is not None:
                    fora.setdefault((ik, ck), []).append(f)
    return fora


def analisar(inicio, fim):
    metas = ler_metas()
    custos = ler_custos()
    serie = series_do_periodo(inicio, fim)
    fat_por_serie = faturamento_por_serie(inicio, fim)
    nomes = {i["chave"]: i for i in INSUMOS}
    casas = {c["chave"]: c["nome"] for c in CASAS}
    linhas = []

    for ik in [i["chave"] for i in INSUMOS if not i.get("so_lancamento")]:
        for ck in [c["chave"] for c in CASAS]:
            pontos = sorted(serie.get((ik, ck), []))
            coefs = [p[2] for p in pontos]
            n = len(coefs)
            m, dp = media(coefs), desvio(coefs)
            ultimo = coefs[-1] if n else 0.0
            data_ultimo = pontos[-1][0] if n else ""
            meta = (metas.get(ik) or {}).get(ck, 0) or 0

            # quanto o ultimo dia fugiu da media do periodo, em desvios
            z30 = (ultimo - m) / dp if dp else 0.0
            # e comparado com os outros dias da mesma semana
            semana_ultimo = pontos[-1][1] if n else ""
            mesmo_dia = [p[2] for p in pontos if p[1] == semana_ultimo]
            dp_dia = desvio(mesmo_dia)
            zdia = (ultimo - media(mesmo_dia)) / dp_dia if dp_dia else 0.0
            # tendencia: os 5 dias mais recentes contra os 5 anteriores
            tend = media(coefs[-5:]) - media(coefs[-10:-5]) if n >= 10 else None
            # O veredito passa a olhar a MEDIA do periodo, nao o ultimo dia: um dia
            # isolado oscila demais e enchia o painel de "Critico" sem acao possivel.
            # O ultimo dia continua visivel como sinal de "olha esse dia".
            vs_meta = (m - meta) / meta if meta else None
            vs_meta_ultimo = (ultimo - meta) / meta if meta else None

            if n == 0:
                situacao = "Sem dados"
            elif ultimo == 0 and m > 0:
                situacao = "Consumo zerado"
            elif abs(z30) >= 2 or (meta and abs(vs_meta or 0) >= 0.25):
                situacao = "Crítico"
            elif abs(z30) >= 1 or abs(zdia) >= 2 or (meta and abs(vs_meta or 0) >= 0.10):
                situacao = "Atenção"
            else:
                situacao = "Normal"

            bruto = custos.get(ik)
            custo = bruto if isinstance(bruto, (int, float)) else (bruto or {}).get(ck, 0) or 0
            faturamento = sum(fat_por_serie.get((ik, ck), []))
            excesso_un = (m - meta) / 1000 * faturamento if meta else 0
            impacto = excesso_un * custo if custo else None

            linhas.append({
                "impacto_reais": round(impacto, 2) if impacto is not None else None,
                "excesso_un": round(excesso_un, 2) if meta else None,
                "custo_un": custo or None,
                "vs_meta_ultimo": round(vs_meta_ultimo, 4) if vs_meta_ultimo is not None else None,
                "serie": [round(c, 4) for c in coefs],
                "insumo": nomes[ik]["nome"], "insumo_chave": ik,
                "casa": ck, "casa_nome": casas[ck], "un": nomes[ik]["un"],
                "dias": n, "media": round(m, 3), "oscilacao": round(dp / m, 3) if m else None,
                "ultimo": round(ultimo, 3), "data_ultimo": data_ultimo,
                "z30": round(z30, 2), "zdia": round(zdia, 2),
                "tendencia": round(tend, 3) if tend is not None else None,
                "meta": round(meta, 4) if meta else None,
                "vs_meta": round(vs_meta, 4) if vs_meta is not None else None,
                "situacao": situacao,
            })

    ordem = {"Crítico": 0, "Atenção": 1, "Consumo zerado": 2, "Normal": 3, "Sem dados": 4}
    # com custo cadastrado, o dinheiro manda na fila; sem ele, o desvio
    linhas.sort(key=lambda l: (ordem[l["situacao"]],
                               -(l["impacto_reais"] or 0), -abs(l["z30"])))
    resumo = {s: sum(1 for l in linhas if l["situacao"] == s) for s in ordem}
    return {"inicio": inicio, "fim": fim, "resumo": resumo, "linhas": linhas}


def ocorrencias_do_dia(insumo, casa, n=7, semana=None):
    """As ultimas N ocorrencias de um dia da semana.

    Olha o historico inteiro, nao so a janela do painel: comparar 7 quartas exige
    voltar sete semanas, o que passa de qualquer janela de 30 dias.

    Sem `semana`, usa o dia do ultimo lancamento — mas quem esta analisando
    costuma querer escolher: se o ultimo dia foi um sabado, comparar as segundas
    exige poder trocar o dia.
    """
    dados = carregar()
    pontos = []
    for iso in sorted(dados):
        lan = dados[iso].get(casa)
        if not isinstance(lan, dict):
            continue
        fat = numero(lan.get("faturamento"))
        campos = (lan.get("insumos") or {}).get(insumo)
        if fat <= 0 or not campos or campos.get("uso") is None:
            continue
        # nome proprio: usar "semana" aqui sobrescreveria o parametro da funcao
        dia_da_semana = DIAS_SEMANA[datetime.strptime(iso, "%Y-%m-%d").weekday()]
        pontos.append({"data": iso, "semana": dia_da_semana,
                       "coef": round(numero(campos["uso"]) / fat * 1000, 4)})
    if not pontos:
        return {"semana": "", "pontos": [], "disponiveis": []}
    # so oferece os dias que realmente tem historico para esta serie
    disponiveis = [d for d in DIAS_SEMANA if any(p["semana"] == d for p in pontos)]
    alvo = semana if semana in disponiveis else pontos[-1]["semana"]
    iguais = [p for p in pontos if p["semana"] == alvo][-n:]
    return {"semana": alvo, "pontos": iguais, "disponiveis": disponiveis}


def sincronizar():
    """Reimporta as planilhas de estoque e diz o que mudou.

    Enquanto o sistema roda em paralelo com o Excel, quem digita na planilha
    precisa de um jeito de trazer isso para ca sem digitar de novo.
    """
    import importlib
    antes = carregar()
    imp = importlib.import_module("importar_historico")
    importlib.reload(imp)

    # So as planilhas abertas no Excel. Reprocessar os 32 arquivos a cada
    # clique demora e reescreve meses que ninguem esta mexendo.
    abertas = imp.abertas_no_excel()
    if not abertas:
        return {"ok": True, "nenhuma_aberta": True, "planilhas": [],
                "dias_novos": [], "dias_alterados": [], "campos_travados": 0,
                "total_dias": len(antes), "ultimo_dia": max(antes) if antes else None}
    novos, _relato, _div, _faixa = imp.importar(abertas)
    dias_novos = sorted(set(novos) - set(antes))
    alterados = []
    for iso in sorted(set(novos) & set(antes)):
        for ck, lan in novos[iso].items():
            if not isinstance(lan, dict):
                continue
            velho = (antes.get(iso) or {}).get(ck) or {}
            if (lan.get("insumos") or {}) != (velho.get("insumos") or {}):
                alterados.append("%s %s" % (iso, ck))
    # Quem manda em cada valor:
    #   - digitado no sistema  -> a sincronizacao NAO toca;
    #   - vindo da planilha    -> a planilha reescreve, e o campo segue travado;
    #   - inexistente          -> entra da planilha, ja travado.
    travados = 0
    for iso, dia in novos.items():
        alvo = antes.setdefault(iso, {})
        for ck, lan in dia.items():
            if not isinstance(lan, dict):
                continue
            destino = alvo.get(ck)
            if not isinstance(destino, dict):
                destino = alvo[ck] = {}
            insumos = destino.setdefault("insumos", {})
            for ik, campos in (lan.get("insumos") or {}).items():
                if ik in insumos and not da_planilha(insumos[ik]):
                    continue                       # digitado na tela: preservado
                marcado = dict(campos)
                marcado[MARCA_PLANILHA] = "planilha"
                insumos[ik] = marcado
                travados += 1
            if not destino.get("faturamento"):
                destino["faturamento"] = lan.get("faturamento")
    salvar(antes)
    return {"ok": True, "dias_novos": dias_novos, "dias_alterados": alterados[:40],
            "campos_travados": travados,
            "planilhas": ["%s / %s" % (a.parts[-3], a.parts[-2]) for a in abertas],
            "total_dias": len(antes), "ultimo_dia": max(antes) if antes else None}


def periodo_padrao():
    """Ultimos 30 dias terminando no ultimo dia que tem lancamento."""
    dados = carregar()
    fim = max(dados) if dados else datetime.now().strftime("%Y-%m-%d")
    inicio = (datetime.strptime(fim, "%Y-%m-%d") - timedelta(days=29)).strftime("%Y-%m-%d")
    return inicio, fim



# --------------------------------------------------------------- compras
ARQ_COMPRAS = DADOS / "compras.json"
ARQ_PEDIDOS = DADOS / "pedidos.json"


def ler_compras():
    if not ARQ_COMPRAS.exists():
        return {"insumos": [], "fornecedores": [], "responsaveis": [],
                "dias_a_cobrir_padrao": 7, "janela_media_dias": 14}
    with open(ARQ_COMPRAS, encoding="utf-8") as f:
        return json.load(f)


def estoque_e_media(data_iso, janela):
    """Ultimo estoque conhecido e media diaria de consumo por (insumo, casa).

    No PCPOE isto vinha de um vinculo externo para o CDE de cada casa mais uma
    aba de historico proprio. Aqui os dois ja existem no sistema.
    """
    dados = carregar()
    limite = datetime.strptime(data_iso, "%Y-%m-%d")
    inicio = (limite - timedelta(days=janela)).strftime("%Y-%m-%d")
    ontem = (limite - timedelta(days=1)).strftime("%Y-%m-%d")

    estoque, usos = {}, {}
    for iso in sorted(dados):
        if iso > ontem:
            break
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if campos.get("final") is not None:
                    estoque[(ik, ck)] = (numero(campos["final"]), iso)
                if inicio <= iso <= ontem and campos.get("uso") is not None:
                    usos.setdefault((ik, ck), []).append(numero(campos["uso"]))
    return estoque, usos


def projetar(data_iso, dias_cobrir):
    cfg = ler_compras()
    janela = cfg.get("janela_media_dias", 14)
    vinculos = ler_vinculos()
    estoque, usos = estoque_e_media(data_iso, janela)
    salvos = ler_pedidos().get(data_iso, {})
    casas = [c["chave"] for c in CASAS]
    fora = {"data": data_iso, "dias_cobrir": dias_cobrir,
            "janela_media_dias": janela, "casas": {}, "config": cfg}

    for ck in casas:
        linhas = []
        guardado = (salvos.get(ck) or {}).get("insumos") or {}
        for ins in cfg["insumos"]:
            ik = ins["chave"]
            est, quando = estoque.get((ik, ck), (0.0, ""))
            lista = usos.get((ik, ck), [])
            # Mesma semantica do AVERAGEIFS do PCPOE: divide pelos dias que tem
            # registro na janela, nao pelos 14 corridos. Dividir por 14 fixo
            # rebaixaria a media sempre que faltasse lancamento, e o pedido sairia menor.
            media = sum(lista) / len(lista) if lista else 0.0
            g = guardado.get(ik, {})
            linhas.append({
                "chave": ik, "nome": ins["nome"], "un": ins["un"],
                "conversao": ins.get("conversao"),
                "estoque": round(est, 3), "estoque_de": quando,
                "media_diaria": round(media, 4), "dias_com_uso": len(lista),
                "transito": g.get("transito"), "fator": g.get("fator", 1),
                "dias_cobrir": g.get("dias_cobrir", dias_cobrir),
                "fornecedor": g.get("fornecedor"),
                "qtd_manual": g.get("qtd_manual"),
                # conciliacao com o catalogo de compras: qual produto este item
                # vira na OC e, no salmao, como a quantidade se reparte entre
                # peixe inteiro, file com pele e file sem pele.
                "produto_oc": g.get("produto_oc"),
                "split": g.get("split"),
                "vinculos": vinculos.get(ik, []),
            })
        fora["casas"][ck] = {"nome": next(c["nome"] for c in CASAS if c["chave"] == ck),
                             "responsavel": (salvos.get(ck) or {}).get("responsavel"),
                             "insumos": linhas}

    # A tela precisa mostrar em que produto do catalogo cada item vira e por
    # que preco. Vai junto da projecao para nao obrigar a tela a cruzar a base
    # de cadastros por conta propria — e para o de-para ser o mesmo dos dois
    # lados, evitando a OC sair com um produto na tela e outro no PDF.
    fora["catalogo"] = {ins["chave"]: [
        {"fornecedor": p["fornecedor"], "produto": p["produto"],
         "un": p.get("un") or "", "preco": numero(p.get("preco"))}
        for p in produtos_vinculados(ins["chave"])] for ins in cfg["insumos"]}
    # nome curto usado na Projecao -> apelido do cadastro ("Nippobraz" -> "NIPPOBRAZ")
    fora["fornecedor_cadastro"] = {}
    for nome in cfg.get("fornecedores", []):
        cad = casar_fornecedor(nome)
        fora["fornecedor_cadastro"][nome] = cad["chave"] if cad else None
    return fora


# --------------------------------------------------------------- conciliacao
# O CDE conta "camarao M"; o fornecedor vende "CAMARAO ROSA 31/50 DESC - SC 1KG".
# Sem este de-para a OC saia com o nome do CDE — que o fornecedor nao reconhece
# e que o financeiro nao consegue bater com a nota. O vinculo mora em
# dados/vinculos.json e e editavel pela tela de Cadastros.
ARQ_VINCULOS = DADOS / "vinculos.json"


def ler_vinculos():
    if not ARQ_VINCULOS.exists():
        return {}
    with open(ARQ_VINCULOS, encoding="utf-8") as f:
        return {k: v for k, v in json.load(f).items() if not k.startswith("_")}


def gravar_vinculos(entrada):
    """Regrava o de-para inteiro — a tela e a fonte, nao um diff.

    Nome que nao existe no catalogo e recusado: vinculo apontando para produto
    inexistente vira OC com item fantasma, que so aparece na hora da entrega.
    """
    # Corpo sem o campo "vinculos" apagaria o de-para inteiro em silencio —
    # um POST malformado nao pode custar o cadastro de conciliacao.
    if not isinstance(entrada, dict) or not entrada:
        raise ValueError("corpo sem o campo 'vinculos'")
    catalogo = {_norm(p["produto"]): p["produto"] for p in ler_base()["produtos"]}
    limpo, perdidos = {}, []
    for ik, nomes in (entrada or {}).items():
        if ik.startswith("_"):
            continue
        fora = []
        for n in (nomes or []):
            real = catalogo.get(_norm(n))
            if real:
                if real not in fora:
                    fora.append(real)
            elif str(n).strip():
                perdidos.append(str(n).strip())
        limpo[ik] = fora
    antigo = {}
    if ARQ_VINCULOS.exists():
        with open(ARQ_VINCULOS, encoding="utf-8") as f:
            antigo = json.load(f)
    saida = {"_nota": antigo.get("_nota", "De-para entre insumo do CDE e produto do catalogo.")}
    saida.update(limpo)
    ARQ_VINCULOS.parent.mkdir(exist_ok=True)
    tmp = ARQ_VINCULOS.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ_VINCULOS)
    return {"ok": True, "vinculos": limpo, "ignorados": perdidos}


def produtos_vinculados(insumo, fornecedor=None):
    """Produtos do catalogo ligados ao insumo. Com fornecedor, so os dele.

    Devolve o registro inteiro do catalogo (nome, unidade e preco) porque a OC
    precisa dos tres: o nome que o fornecedor reconhece, a unidade em que ele
    vende e o preco que ja esta negociado.
    """
    alvos = {_norm(n) for n in ler_vinculos().get(insumo, [])}
    if not alvos:
        return []
    cad = casar_fornecedor(fornecedor) if fornecedor else None
    chave_forn = _norm(cad["chave"]) if cad else (_norm(fornecedor) if fornecedor else None)
    fora = []
    for p in ler_base()["produtos"]:
        if _norm(p["produto"]) not in alvos:
            continue
        if chave_forn and _norm(p["fornecedor"]) != chave_forn:
            continue
        fora.append(p)
    return fora


def ler_pedidos():
    if not ARQ_PEDIDOS.exists():
        return {}
    with open(ARQ_PEDIDOS, encoding="utf-8") as f:
        return json.load(f)


def gravar_pedido(corpo):
    data_iso = corpo.get("data")
    if not data_iso:
        raise ValueError("data ausente")
    datetime.strptime(data_iso, "%Y-%m-%d")
    todos = ler_pedidos()
    todos[data_iso] = corpo.get("casas") or {}
    todos[data_iso]["_gravado_em"] = datetime.now().isoformat(timespec="seconds")
    ARQ_PEDIDOS.parent.mkdir(exist_ok=True)
    tmp = ARQ_PEDIDOS.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(todos, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ_PEDIDOS)
    fora = {"ok": True, "data": data_iso}
    fora.update(sincronizar_ordens(data_iso))
    return fora



# --------------------------------------------------------------- ordens de compra
ARQ_ORDENS = DADOS / "ordens.json"

# Cadastro unico com o Gerador de OCs. Mesma decisao ja tomada para a numeracao:
# base separada por sistema significaria dois cadastros do mesmo fornecedor
# divergindo com o tempo, e OC saindo com CNPJ velho. A copia local continua
# valendo como reserva para quando a pasta do Gerador nao estiver acessivel.
BASE_COMPARTILHADA = (RAIZ / ".." / "Gerador de OCs" / "Base_SushiBoulevard.xlsx").resolve()
BASE_LOCAL = RAIZ / "Base_SushiBoulevard.xlsx"
BASE_OC = BASE_COMPARTILHADA if BASE_COMPARTILHADA.exists() else BASE_LOCAL
BACKUP_BASE = RAIZ / "backups" / "Base_SushiBoulevard.antes-do-cde-web.xlsx"
_lock_base = threading.Lock()

# A casa do CDE e a unidade do Gerador de OCs sao a mesma loja com nomes
# diferentes. O de-para vive aqui para a ordem sair com o CNPJ certo.
UNIDADE_OC = {"SL": "SENADOR LEMOS", "DC": "DUQUE DE CAXIAS",
              "DLU": "DELIVERY UMARIZAL", "DLCN": "CIDADE NOVA"}

_base_cache = {"mtime": None, "dados": None}


def _norm(v):
    import unicodedata
    t = unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode()
    return " ".join(t.upper().split())


def ler_base():
    """Fornecedores, produtos e unidades da copia da base do Gerador de OCs.

    Cache pela data de modificacao: a planilha e lida uma vez e so reabre se
    alguem editar o arquivo.
    """
    if not BASE_OC.exists():
        return {"fornecedores": [], "produtos": [], "unidades": [], "erro": "Base_SushiBoulevard.xlsx nao encontrada"}
    mt = BASE_OC.stat().st_mtime
    if _base_cache["mtime"] == mt and _base_cache["dados"]:
        return _base_cache["dados"]
    try:
        import openpyxl
    except ImportError:
        return {"fornecedores": [], "produtos": [], "unidades": [], "erro": "openpyxl nao instalado"}

    wb = openpyxl.load_workbook(BASE_OC, read_only=True, data_only=True)

    def aba(nome, campos):
        if nome not in wb.sheetnames:
            return []
        linhas = list(wb[nome].iter_rows(values_only=True))
        if not linhas:
            return []
        cab = [_norm(c) for c in linhas[0]]
        fora = []
        for ln in linhas[1:]:
            reg, vazio = {}, True
            for destino, titulo in campos.items():
                i = cab.index(_norm(titulo)) if _norm(titulo) in cab else -1
                v = ln[i] if 0 <= i < len(ln) else None
                reg[destino] = "" if v is None else str(v).strip()
                if reg[destino]:
                    vazio = False
            if not vazio:
                fora.append(reg)
        return fora

    dados = {
        "fornecedores": aba("Fornecedores", {
            "chave": "Chave", "razao": "Razão Social", "contato": "Contato", "tel": "Telefone",
            "email": "E-mail", "cnpj": "CNPJ", "ie": "I.E.", "end": "Endereço", "cidade": "Cidade",
            "prazoFat": "Prazo Faturado", "prazoEntrega": "Prazo Entrega"}),
        "produtos": aba("Produtos", {
            "fornecedor": "Fornecedor", "produto": "Produto", "un": "Unidade", "preco": "Preço"}),
        "unidades": aba("Unidades", {
            "chave": "Chave", "nome": "Nome", "contato": "Contato", "email": "E-mail",
            "cnpj": "CNPJ", "ie": "I.E.", "tel": "Telefone", "end": "Endereço"}),
        # Observacao fixa por fornecedor: entra em toda OC dele, sem ninguem
        # precisar redigitar ("agendar entrega com 24h", "so horario comercial").
        "observacoes": aba("Observações", {
            "fornecedor": "Fornecedor", "texto": "Observação"}),
    }
    wb.close()
    for pr in dados["produtos"]:
        pr["preco"] = numero(pr.get("preco"))
    dados["arquivo"] = str(BASE_OC)
    dados["compartilhada"] = (BASE_OC == BASE_COMPARTILHADA)
    _base_cache.update(mtime=mt, dados=dados)
    return dados


def gravar_base(entrada):
    """Regrava a planilha de cadastros — mesmo layout que o Gerador de OCs le.

    E uma reescrita completa das quatro abas, nao um append: a tela sempre manda
    a base inteira. Por isso a copia de seguranca na primeira gravacao, e por
    isso o lock — dois PCs salvando ao mesmo tempo truncariam o arquivo.

    Os textos vao em CAIXA ALTA e o preco fica numerico, exatamente como o
    Gerador grava. Fugir disso faria a mesma planilha ter dois estilos conforme
    o sistema que salvou por ultimo.
    """
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    except ImportError:
        raise ValueError("openpyxl nao instalado — nao consigo gravar a base")

    hdr_fill = PatternFill("solid", fgColor="1A1A1A")
    hdr_font = Font(name="Arial", bold=True, color="FFFFFF", size=11)
    data_font = Font(name="Arial", size=10)
    alt_fill = PatternFill("solid", fgColor="F5F5F5")
    brd = Border(left=Side("thin", color="DDDDDD"), right=Side("thin", color="DDDDDD"),
                 top=Side("thin", color="DDDDDD"), bottom=Side("thin", color="DDDDDD"))

    def montar(ws, titulo, cabecalho, linhas):
        ws.title = titulo
        for ci, h in enumerate(cabecalho, 1):
            c = ws.cell(row=1, column=ci, value=h)
            c.font, c.fill, c.border = hdr_font, hdr_fill, brd
            c.alignment = Alignment(horizontal="center", vertical="center")
        for ri, linha in enumerate(linhas, 2):
            fundo = alt_fill if ri % 2 == 0 else None
            for ci, h in enumerate(cabecalho, 1):
                v = linha.get(h, "")
                if h in ("Preço", "Preco"):
                    try:
                        v = float(str(v).replace(",", "."))
                    except (TypeError, ValueError):
                        v = 0
                elif v is not None and not isinstance(v, (int, float)):
                    v = str(v).upper()
                c = ws.cell(row=ri, column=ci, value=v)
                c.font, c.border = data_font, brd
                c.alignment = Alignment(vertical="center")
                if h in ("Preço", "Preco"):
                    c.number_format = "#,##0.00"
                if fundo:
                    c.fill = fundo
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = "A1:%s%d" % (chr(64 + len(cabecalho)), max(len(linhas) + 1, 2))
        for col in ws.columns:
            mx = max((len(str(c.value or "")) for c in col), default=8)
            ws.column_dimensions[col[0].column_letter].width = min(mx + 4, 45)

    with _lock_base:
        if not BACKUP_BASE.exists() and BASE_OC.exists():
            BACKUP_BASE.parent.mkdir(exist_ok=True)
            shutil.copy2(BASE_OC, BACKUP_BASE)

        wb = Workbook()
        montar(wb.active, "Fornecedores",
               ["Chave", "Razão Social", "Contato", "Telefone", "E-mail", "CNPJ", "I.E.",
                "Endereço", "Cidade", "Prazo Faturado", "Prazo Entrega"],
               entrada.get("fornecedores", []))
        montar(wb.create_sheet(), "Produtos",
               ["Fornecedor", "Produto", "Unidade", "Preço"], entrada.get("produtos", []))
        montar(wb.create_sheet(), "Unidades",
               ["Chave", "Nome", "Contato", "E-mail", "CNPJ", "I.E.", "Telefone", "Endereço"],
               entrada.get("unidades", []))
        ws_o = wb.create_sheet()
        montar(ws_o, "Observações", ["Fornecedor", "Observação"], entrada.get("observacoes", []))
        ws_o.column_dimensions["B"].width = 80

        # Gravacao atomica: o Excel aberto por outra pessoa nao pega arquivo pela metade
        tmp = BASE_OC.with_suffix(".cde.tmp.xlsx")
        wb.save(tmp)
        wb.close()
        tmp.replace(BASE_OC)
        _base_cache.update(mtime=None, dados=None)

    return {"ok": True, "arquivo": str(BASE_OC),
            "fornecedores": len(entrada.get("fornecedores", [])),
            "produtos": len(entrada.get("produtos", [])),
            "unidades": len(entrada.get("unidades", [])),
            "observacoes": len(entrada.get("observacoes", []))}


def casar_fornecedor(nome):
    """Liga o nome curto usado na Projecao ao cadastro da base.

    Sete dos quinze fornecedores da Projecao nao existem na base com o mesmo
    nome. Quando nao casa devolvemos None de proposito: a tela mostra o aviso
    e deixa escolher o cadastro certo, em vez de emitir uma ordem sem CNPJ.
    """
    alvo = _norm(nome)
    if not alvo:
        return None
    for f in ler_base()["fornecedores"]:
        if _norm(f["chave"]) == alvo or _norm(f["razao"]) == alvo:
            return f
    for f in ler_base()["fornecedores"]:
        c, r = _norm(f["chave"]), _norm(f["razao"])
        if (c and (alvo in c or c in alvo)) or (r and (alvo in r or r in alvo)):
            return f
    return None


def ler_ordens():
    if not ARQ_ORDENS.exists():
        return {"ordens": {}}
    with open(ARQ_ORDENS, encoding="utf-8") as f:
        return json.load(f)


def salvar_ordens(todas):
    ARQ_ORDENS.parent.mkdir(exist_ok=True)
    tmp = ARQ_ORDENS.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(todas, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ_ORDENS)


def calcular_linha(ins, campos):
    """Mesma conta da tela de Projecao — mantida em paralelo de proposito.

    A tela precisa recalcular a cada tecla, sem ida ao servidor; o servidor
    precisa recalcular sem confiar no que o navegador mandou. Se um dia
    divergirem, o numero que vale e este.
    """
    fator = numero(campos.get("fator")) or 1
    disponivel = ins["estoque"] + numero(campos.get("transito"))
    consumo_dia = ins["media_diaria"] * fator
    if consumo_dia > 0:
        duracao = disponivel / consumo_dia
    else:
        duracao = float("inf") if disponivel > 0 else 0.0
    cobrir = max(0.0, numero(campos.get("dias_cobrir")) - (duracao if duracao != float("inf") else 0.0))
    qtd = cobrir * consumo_dia
    c = ins.get("conversao")
    conv = (c["kg_por_caixa"] / c["peixes_por_caixa"]) if c and c.get("peixes_por_caixa") else 1.0
    un = c["un_pedido"] if c else ins["un"]
    # Quantidade ajustada a mao no resumo vence o calculo — quem digitou viu o
    # numero projetado e decidiu outro. O calculado continua sendo devolvido
    # para a tela poder mostrar de quanto foi o desvio.
    manual = campos.get("qtd_manual")
    if manual not in (None, ""):
        return {"qtd": qtd, "pedido": numero(manual), "calculado": qtd * conv,
                "manual": True, "un": un}
    return {"qtd": qtd, "pedido": qtd * conv, "calculado": qtd * conv,
            "manual": False, "un": un}


def itens_para_oc(ins, campos, resultado, fornecedor, partes):
    """Traduz uma linha do pedido consolidado nos itens que entram na OC.

    Duas traducoes acontecem aqui:

      1. conciliacao — o item do CDE vira o produto do catalogo do fornecedor
         (nome, unidade e preco negociado). Sem vinculo, segue com o nome do
         CDE e preco zero, e a tela de Ordens acusa a falta de preco;

      2. salmao — a projecao calcula a necessidade em peixe INTEIRO. Quando a
         compra vai ser feita em file, informar quilos de file direto daria
         menos peixe do que o necessario: 1 kg de inteiro vira 0,67 kg de file
         com pele. Por isso cada parte pedida e dividida pelo seu rendimento
         para saber quanto do inteiro ela consome, e o que sobrar da necessidade
         continua sendo pedido como peixe inteiro.
    """
    def catalogo(nome_escolhido):
        """(nome, unidade, preco) do produto do catalogo — ou o item cru do CDE."""
        opcoes = produtos_vinculados(ins["chave"], fornecedor)
        alvo = _norm(nome_escolhido) if nome_escolhido else None
        escolhido = next((p for p in opcoes if _norm(p["produto"]) == alvo), None)
        if not escolhido and opcoes:
            escolhido = opcoes[0]          # vinculo unico: nao precisa escolher
        if not escolhido:
            return ins["nome"], resultado["un"], 0.0
        return escolhido["produto"], (escolhido.get("un") or resultado["un"]), numero(escolhido.get("preco"))

    total = round(resultado["pedido"], 3)
    split = campos.get("split") or {}
    partes_pedidas = []
    for parte in partes:
        qtd = numero(split.get(parte["chave"], {}).get("qtd") if isinstance(split.get(parte["chave"]), dict)
                     else split.get(parte["chave"]))
        if qtd > 0.0005:
            partes_pedidas.append((parte, qtd, (split.get(parte["chave"]) or {}).get("produto")
                                   if isinstance(split.get(parte["chave"]), dict) else None))

    if not partes_pedidas:
        nome, un, preco = catalogo(campos.get("produto_oc"))
        return [{"chave": ins["chave"], "nome": nome, "un": un, "qtd": total,
                 "preco": preco, "origem": "projecao", "ajustado": resultado.get("manual", False)}]

    itens, consumido = [], 0.0
    for parte, qtd, produto in partes_pedidas:
        rend = parte.get("rendimento") or 1.0
        consumido += qtd / rend if rend else 0.0
        nome, un, preco = catalogo(produto or parte.get("produto"))
        itens.append({"chave": "%s:%s" % (ins["chave"], parte["chave"]), "nome": nome,
                      "un": un, "qtd": round(qtd, 3), "preco": preco,
                      "origem": "projecao", "ajustado": True,
                      "parte": parte["chave"]})
    # o que a divisao em partes ainda nao cobriu continua indo como inteiro
    resto = round(total - consumido, 3)
    if resto > 0.0005:
        nome, un, preco = catalogo(campos.get("produto_oc"))
        itens.append({"chave": ins["chave"], "nome": nome, "un": un, "qtd": resto,
                      "preco": preco, "origem": "projecao",
                      "ajustado": resultado.get("manual", False)})
    return itens


def sincronizar_ordens(data_iso):
    """Cria/atualiza as ordens pendentes a partir do pedido salvo naquela data.

    Regras que importam:
      - a ordem e identificada por (data, casa, fornecedor): salvar de novo
        atualiza a mesma ordem em vez de duplicar;
      - itens incluidos a mao (origem "manual") sobrevivem a atualizacao;
      - ordem ja gerada nao e mexida — vira aviso, nao sobrescrita silenciosa.
    """
    cfg = ler_compras()
    partes = cfg.get("salmao_partes") or []
    pedido = ler_pedidos().get(data_iso) or {}
    proj = projetar(data_iso, cfg.get("dias_a_cobrir_padrao", 7))
    todas = ler_ordens()
    ordens = todas.setdefault("ordens", {})
    tocadas, travadas = [], []

    for ck, casa in proj["casas"].items():
        guardado = (pedido.get(ck) or {}).get("insumos") or {}
        por_forn = {}
        for ins in casa["insumos"]:
            g = guardado.get(ins["chave"])
            if not g:
                continue
            forn = (g.get("fornecedor") or "").strip()
            if not forn:
                continue
            r = calcular_linha(ins, g)
            if r["pedido"] <= 0.0005:
                continue
            por_forn.setdefault(forn, []).extend(
                itens_para_oc(ins, g, r, forn, partes))

        for forn, itens in por_forn.items():
            oid = "%s|%s|%s" % (data_iso, ck, _norm(forn))
            atual = ordens.get(oid)
            if atual and atual.get("situacao") == "gerada":
                travadas.append(oid)
                continue
            manuais = [i for i in (atual or {}).get("itens", []) if i.get("origem") == "manual"]
            # preco ja digitado nao se perde quando a quantidade muda
            precos = {i["chave"]: numero(i.get("preco")) for i in (atual or {}).get("itens", [])}
            for i in itens:
                # preco digitado na ordem manda; sem ele, vale o preco do catalogo
                digitado = precos.get(i["chave"], 0.0)
                if digitado > 0:
                    i["preco"] = digitado
            cad = casar_fornecedor(forn)
            ordens[oid] = {
                "id": oid, "data": data_iso, "casa": ck, "casa_nome": casa["nome"],
                "unidade_oc": UNIDADE_OC.get(ck, ""), "fornecedor": forn,
                "fornecedor_base": (atual or {}).get("fornecedor_base") or (cad["chave"] if cad else None),
                "situacao": "pendente", "obs": (atual or {}).get("obs", ""),
                "criada_em": (atual or {}).get("criada_em") or datetime.now().isoformat(timespec="seconds"),
                "itens": itens + manuais,
            }
            tocadas.append(oid)

    salvar_ordens(todas)
    return {"ordens_criadas": tocadas, "ordens_travadas": travadas}


def gravar_ordem(corpo):
    """Grava uma ordem editada a mao (itens, fornecedor do cadastro, situacao)."""
    oid = corpo.get("id")
    if not oid:
        raise ValueError("id da ordem ausente")
    todas = ler_ordens()
    o = todas.get("ordens", {}).get(oid)
    if not o:
        raise ValueError("ordem nao encontrada: " + oid)
    if corpo.get("excluir"):
        del todas["ordens"][oid]
        salvar_ordens(todas)
        return {"ok": True, "excluida": oid}
    for campo in ("fornecedor_base", "obs", "situacao", "oc", "numero_oc"):
        if campo in corpo:
            o[campo] = corpo[campo]
    if "itens" in corpo:
        limpos = []
        for i in corpo["itens"]:
            nome = (i.get("nome") or "").strip()
            if not nome:
                continue
            limpos.append({"chave": i.get("chave") or ("manual_%d" % len(limpos)),
                           "nome": nome, "un": i.get("un") or "Un",
                           "qtd": numero(i.get("qtd")), "preco": numero(i.get("preco")),
                           "origem": i.get("origem") or "manual"})
        o["itens"] = limpos
    o["alterada_em"] = datetime.now().isoformat(timespec="seconds")
    salvar_ordens(todas)
    return {"ok": True, "ordem": o}


def listar_ordens(situacao=None):
    todas = ler_ordens().get("ordens", {})
    fora = [o for o in todas.values() if not situacao or o.get("situacao") == situacao]
    fora.sort(key=lambda o: (o.get("data", ""), o.get("casa", ""), o.get("fornecedor", "")), reverse=True)
    for o in fora:
        o["total"] = round(sum(numero(i.get("qtd")) * numero(i.get("preco")) for i in o.get("itens", [])), 2)
        o["sem_cadastro"] = not o.get("fornecedor_base")
        # Ordens gravadas antes do modulo completo nao tem o campo: todas
        # vinham da Projecao, que era a unica porta de entrada.
        o.setdefault("origem", "projecao")
    return {"ordens": fora, "pendentes": sum(1 for o in fora if o.get("situacao") == "pendente")}


# --------------------------------------------------------------- ordens sem projecao
# A Projecao calcula QUANTO comprar dos 14 insumos que o CDE controla. Ela nunca
# soube de embalagem, gas, material de limpeza, manutencao — e nem deveria: nao ha
# estoque diario desses itens para projetar. Por isso a ordem avulsa nao e um
# atalho, e a porta principal: qualquer compra de qualquer fornecedor entra por
# aqui, e a Projecao passa a ser so uma das fontes que abastece a mesma fila.

def unidade_por_chave(chave):
    alvo = _norm(chave)
    for u in ler_base()["unidades"]:
        if _norm(u.get("chave")) == alvo:
            return u
    return None


def _casa_da_unidade(unidade):
    """Casa do CDE correspondente a unidade, quando existir.

    Unidade administrativa (Sushi Boulevard Servicos) nao tem casa de estoque:
    devolve vazio de proposito, e a ordem fica sem vinculo com o lancamento
    diario em vez de ser forcada para uma casa qualquer.
    """
    for ck, nome in UNIDADE_OC.items():
        if _norm(nome) == _norm(unidade):
            return ck
    return ""


def _proximo_sufixo(ordens, base):
    """Evita colisao quando a mesma unidade pede duas vezes do mesmo fornecedor
    no mesmo dia — acontece toda semana (pedido da manha e complemento da tarde)."""
    if base not in ordens:
        return base
    n = 2
    while "%s#%d" % (base, n) in ordens:
        n += 1
    return "%s#%d" % (base, n)


def criar_ordem(corpo):
    """Cria uma ordem pendente que nao veio da Projecao.

    Usada tanto pela tela de Nova ordem quanto pela importacao (planilha/PDF).
    Todos os itens nascem com origem "manual": a Projecao nunca vai recalcular
    nem apagar nada aqui.
    """
    unidade = (corpo.get("unidade_oc") or "").strip()
    if not unidade:
        raise ValueError("escolha a unidade compradora")
    uni = unidade_por_chave(unidade)
    if not uni:
        raise ValueError("unidade nao encontrada no cadastro: " + unidade)

    fornecedor_base = (corpo.get("fornecedor_base") or "").strip() or None
    cad = None
    if fornecedor_base:
        for f in ler_base()["fornecedores"]:
            if _norm(f["chave"]) == _norm(fornecedor_base):
                cad = f
                break
    fornecedor = (corpo.get("fornecedor") or (cad["chave"] if cad else "")).strip()
    if not fornecedor:
        raise ValueError("escolha o fornecedor")

    itens = []
    for i in corpo.get("itens", []):
        nome = (i.get("nome") or "").strip()
        if not nome:
            continue
        itens.append({"chave": "manual_%d" % len(itens), "nome": nome,
                      "un": i.get("un") or "Un", "qtd": numero(i.get("qtd")),
                      "preco": numero(i.get("preco")), "origem": "manual"})
    if not itens:
        raise ValueError("a ordem precisa de pelo menos um item")

    data_iso = (corpo.get("data") or "").strip() or datetime.now().strftime("%Y-%m-%d")
    origem = corpo.get("origem") or "avulsa"
    casa = _casa_da_unidade(unidade)

    todas = ler_ordens()
    ordens = todas.setdefault("ordens", {})
    oid = _proximo_sufixo(ordens, "%s|%s|%s|%s" % (origem, data_iso, _norm(unidade), _norm(fornecedor)))
    ordens[oid] = {
        "id": oid, "data": data_iso, "casa": casa,
        "casa_nome": uni.get("nome") or unidade,
        "unidade_oc": uni.get("chave") or unidade,
        "fornecedor": fornecedor,
        "fornecedor_base": (cad["chave"] if cad else fornecedor_base),
        # A importacao em lote pode entregar a OC ja emitida (PDF baixado no zip
        # com numero reservado). Nesse caso a ordem nasce "gerada": marcar como
        # pendente convidaria alguem a emitir a mesma compra duas vezes.
        "situacao": "gerada" if corpo.get("situacao_inicial") == "gerada" else "pendente",
        "origem": origem,
        "obs": corpo.get("obs", ""), "oc": corpo.get("oc") or {},
        "criada_em": datetime.now().isoformat(timespec="seconds"),
        "itens": itens,
    }
    if corpo.get("numero_oc"):
        ordens[oid]["numero_oc"] = str(corpo["numero_oc"])
    salvar_ordens(todas)
    return {"ok": True, "id": oid, "ordem": ordens[oid]}


def criar_ordens_lote(corpo):
    """Varias ordens de uma vez — uma por fornecedor lido da planilha ou do PDF.

    Cada ordem e criada isolada: uma que falhe (fornecedor em branco, nenhum
    item com quantidade) nao derruba o resto da importacao, so aparece na lista
    de recusadas para a tela mostrar o motivo.
    """
    feitas, recusadas = [], []
    for item in corpo.get("ordens", []):
        try:
            r = criar_ordem(item)
            feitas.append({"id": r["id"], "fornecedor": r["ordem"]["fornecedor"]})
        except ValueError as e:
            recusadas.append({"fornecedor": item.get("fornecedor") or "(sem nome)", "motivo": str(e)})
    return {"ok": True, "criadas": feitas, "recusadas": recusadas}



# --------------------------------------------------------------- numeracao das OCs
# Um contador so para os dois sistemas. Ver o cabecalho do patch: contador
# separado significaria duas OCs com o mesmo numero.
REGISTRO_OC = (RAIZ / ".." / "Gerador de OCs" / "Registro_OCs.json").resolve()
BACKUP_OC = RAIZ / "backups" / "Registro_OCs.antes-do-cde-web.json"
_lock_oc = threading.Lock()


def ler_registro_oc():
    if not REGISTRO_OC.exists():
        return {"counters": {}, "history": [], "seq": 0, "erro": "Registro_OCs.json nao encontrado"}
    with open(REGISTRO_OC, encoding="utf-8-sig") as f:
        reg = json.load(f)
    reg.setdefault("counters", {})
    reg.setdefault("history", [])
    reg.setdefault("seq", 0)
    return reg


def gravar_registro_oc(reg):
    """Gravacao atomica, com copia de seguranca na primeira vez."""
    if not BACKUP_OC.exists() and REGISTRO_OC.exists():
        BACKUP_OC.parent.mkdir(exist_ok=True)
        shutil.copy2(REGISTRO_OC, BACKUP_OC)
    tmp = REGISTRO_OC.with_suffix(".cde.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)
    tmp.replace(REGISTRO_OC)


def proximo_numero_oc(unidade):
    try:
        return int(ler_registro_oc()["counters"].get(unidade) or 0) + 1
    except (TypeError, ValueError):
        return 1


def reservar_oc(unidade, quantidade=1, comeco=None, entradas=None):
    """Reserva numeros e registra as OCs no historico compartilhado.

    Mesma regra do Gerador: `comeco` forca o ponto de partida quando alguem
    digita o numero a mao, mas o contador nunca anda para tras.
    """
    if not unidade:
        raise ValueError("unidade e obrigatoria")
    quantidade = max(1, min(int(quantidade or 1), 200))

    with _lock_oc:
        reg = ler_registro_oc()
        try:
            atual = int(reg["counters"].get(unidade) or 0)
        except (TypeError, ValueError):
            atual = 0
        primeiro = int(comeco) if comeco else atual + 1
        numeros = list(range(primeiro, primeiro + quantidade))
        reg["counters"][unidade] = max(atual, numeros[-1])

        agora = datetime.now()
        seq = int(reg.get("seq") or 0)
        entradas = entradas or []
        for i, num in enumerate(numeros):
            e = entradas[i] if i < len(entradas) and isinstance(entradas[i], dict) else {}
            seq += 1
            reg["history"].append({
                "num": str(num).zfill(3),
                "supplier": str(e.get("fornecedor", "")).upper(),
                "unit": unidade, "unitKey": unidade,
                "date": e.get("data") or agora.strftime("%d.%m.%Y"),
                "ts": agora.isoformat(timespec="seconds"),
                "seq": seq,
                "pc": socket.gethostname(),
                "origem": "CDE Web",          # separa do que saiu pelo Gerador
            })
        reg["seq"] = seq
        gravar_registro_oc(reg)
        return {"ok": True, "numeros": numeros, "counters": reg["counters"]}


# --------------------------------------------------------------- visao geral
# A tela inicial responde, numa olhada: quanto cada casa pesa no faturamento do
# grupo, o que esta parado em estoque, quais itens carregam o custo, o que esta
# perto de faltar, o que mudou de um mes para o outro e por quanto se comprou.
# Tudo sai do que ja existe — lancamento diario, catalogo e ordens emitidas —
# porque relatorio que depende de alguem alimentar uma planilha a parte para de
# ser atualizado na terceira semana.

TIPOS_MOV = {
    "entrada": "Entrada (chegada)",
    "transferencia": "Saída (transferência)",
    "desperdicio": "Desperdício",
    "consumo": "Consumo do dia",
}


def _mes_de(iso):
    return iso[:7]


def mes_anterior(mes):
    ano, m = int(mes[:4]), int(mes[5:7])
    return "%04d-%02d" % (ano - 1, 12) if m == 1 else "%04d-%02d" % (ano, m - 1)


def meses_com_lancamento():
    return sorted({_mes_de(iso) for iso in carregar()})


def totais_do_mes(mes, ate_dia=None):
    """Faturamento por casa e movimento por (insumo, casa) no mes pedido.

    `ate_dia` corta o mes no mesmo dia do mes em curso. Sem esse corte, o mes
    pela metade sempre pareceria uma queda de 50% contra o mes cheio anterior —
    e a tela viraria um alarme falso todo comeco de mes.
    """
    dados = carregar()
    fat = {}
    mov = {}
    for iso in sorted(dados):
        if _mes_de(iso) != mes:
            continue
        if ate_dia and int(iso[8:10]) > ate_dia:
            continue
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            fat[ck] = fat.get(ck, 0.0) + numero(lan.get("faturamento"))
            for ik, campos in (lan.get("insumos") or {}).items():
                alvo = mov.setdefault((ik, ck), {"consumo": 0.0, "entrada": 0.0,
                                                 "transferencia": 0.0, "desperdicio": 0.0,
                                                 "dias": 0})
                if campos.get("uso") is not None:
                    alvo["consumo"] += numero(campos.get("uso"))
                    alvo["dias"] += 1
                for c in ("entrada", "transferencia", "desperdicio"):
                    alvo[c] += numero(campos.get(c))
    return fat, mov


def estoque_atual():
    """Ultima contagem de cada (insumo, casa) e o dia em que ela foi feita."""
    dados = carregar()
    fora = {}
    for iso in sorted(dados):
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if campos.get("final") is not None:
                    fora[(ik, ck)] = (numero(campos["final"]), iso)
    return fora


def precos_do_catalogo():
    """Preco por unidade de cada insumo, quando o catalogo permite deduzir.

    So aproveita produto vendido em KG: "ARROZ YANAGI" custa R$ 300 o fardo de
    30 kg, e usar 300 como custo do quilo inflaria o relatorio dez vezes. Onde
    a unidade nao bate, o custo continua vindo de dados/custos.json.
    """
    fora = {}
    for ins in INSUMOS:
        precos = [numero(p.get("preco")) for p in produtos_vinculados(ins["chave"])
                  if _norm(p.get("un")) in ("KG", "QUILO", "KG.") and numero(p.get("preco")) > 0]
        if precos and _norm(ins.get("un")) == "KG":
            precos.sort()
            fora[ins["chave"]] = precos[len(precos) // 2]      # mediana: ignora o preco fora da curva
    return fora


def custo_unitario(ik, ck, custos, catalogo):
    """Custo de uma unidade do insumo naquela casa, e de onde ele veio."""
    bruto = custos.get(ik)
    if isinstance(bruto, (int, float)) and bruto > 0:
        return float(bruto), "custos.json"
    if isinstance(bruto, dict) and numero(bruto.get(ck)) > 0:
        return numero(bruto.get(ck)), "custos.json"
    if catalogo.get(ik):
        return catalogo[ik], "catalogo"
    return 0.0, ""


def overview(mes=None):
    meses = meses_com_lancamento()
    if not meses:
        return {"mes": None, "meses": [], "vazio": True}
    mes = mes if mes in meses else meses[-1]
    ant = mes_anterior(mes)
    custos, catalogo = ler_custos(), precos_do_catalogo()
    cfg = ler_compras()
    dias_seg = cfg.get("dias_seguranca", 3)
    nomes = {i["chave"]: i for i in INSUMOS}
    casas = {c["chave"]: c["nome"] for c in CASAS}

    dias_do_mes = [iso for iso in carregar() if _mes_de(iso) == mes]
    dia_limite = max(int(d[8:10]) for d in dias_do_mes) if dias_do_mes else 31
    parcial = dia_limite < int(mes_fim(mes)[8:10])

    fat, mov = totais_do_mes(mes)
    # mes em curso e comparado com o mesmo trecho do mes anterior
    fat_ant, mov_ant = totais_do_mes(ant, dia_limite if parcial else None)
    total_fat = sum(fat.values())

    # --- 1. participacao de cada casa no faturamento do grupo
    participacao = []
    for c in CASAS:
        v = fat.get(c["chave"], 0.0)
        va = fat_ant.get(c["chave"], 0.0)
        participacao.append({
            "casa": c["chave"], "nome": c["nome"], "valor": round(v, 2),
            "parte": round(v / total_fat, 4) if total_fat else 0,
            "anterior": round(va, 2),
            "variacao": round((v - va) / va, 4) if va else None,
        })

    # --- 2. posicao de estoque, valorizada
    estoque = estoque_atual()
    linhas_estoque, sem_custo = [], []
    for ins in INSUMOS:
        if ins.get("derivado"):
            continue
        for c in CASAS:
            ik, ck = ins["chave"], c["chave"]
            qtd, quando = estoque.get((ik, ck), (0.0, ""))
            if not quando:
                continue
            custo, fonte = custo_unitario(ik, ck, custos, catalogo)
            if not custo and ik not in sem_custo:
                sem_custo.append(ik)
            # media diaria dos ultimos 14 dias, para saber quanto tempo isso dura
            usos = mov.get((ik, ck), {})
            dias = usos.get("dias") or 0
            media_dia = (usos.get("consumo", 0.0) / dias) if dias else 0.0
            minimo = media_dia * dias_seg
            linhas_estoque.append({
                "insumo": ins["nome"], "chave": ik, "un": ins["un"],
                "casa": ck, "casa_nome": c["nome"],
                "qtd": round(qtd, 3), "contado_em": quando,
                "custo_un": round(custo, 2) if custo else None,
                "fonte_custo": fonte,
                "valor": round(qtd * custo, 2) if custo else None,
                "media_dia": round(media_dia, 3),
                "minimo": round(minimo, 3),
                "dias_cobertura": round(qtd / media_dia, 1) if media_dia > 0 else None,
                "situacao": ("sem consumo" if media_dia <= 0 else
                             "abaixo" if qtd < minimo else
                             "no limite" if qtd < minimo * 1.3 else "ok"),
            })
    valor_estoque = sum(l["valor"] or 0 for l in linhas_estoque)

    # --- 3. curva ABC do consumo do mes, valorizado
    abc = {}
    for (ik, ck), m in mov.items():
        if ik not in nomes or nomes[ik].get("so_lancamento"):
            continue
        custo, _f = custo_unitario(ik, ck, custos, catalogo)
        if m["consumo"] <= 0:
            continue
        alvo = abc.setdefault(ik, {"insumo": nomes[ik]["nome"], "chave": ik,
                                   "un": nomes[ik]["un"], "qtd": 0.0, "valor": 0.0,
                                   "com_custo": bool(custo), "por_casa": {}})
        alvo["qtd"] += m["consumo"]
        alvo["valor"] += m["consumo"] * custo
        alvo["por_casa"][ck] = round(alvo["por_casa"].get(ck, 0.0) + m["consumo"] * custo, 2)
    lista_abc = sorted(abc.values(), key=lambda x: -x["valor"])
    total_abc = sum(x["valor"] for x in lista_abc) or 1
    acumulado = 0.0
    for x in lista_abc:
        x["qtd"] = round(x["qtd"], 2)
        x["valor"] = round(x["valor"], 2)
        x["parte"] = round(x["valor"] / total_abc, 4)
        x["sobre_faturamento"] = round(x["valor"] / total_fat, 4) if total_fat else None
        acumulado += x["parte"]
        x["acumulado"] = round(acumulado, 4)
        x["classe"] = "A" if acumulado <= 0.8 else ("B" if acumulado <= 0.95 else "C")

    # --- 4. estoque no limite ou abaixo do minimo de seguranca
    criticos = sorted([l for l in linhas_estoque if l["situacao"] in ("abaixo", "no limite")],
                      key=lambda l: (l["dias_cobertura"] if l["dias_cobertura"] is not None else 999))

    # --- 5. variacao de quantidade mes contra mes
    variacao = []
    for ins in INSUMOS:
        if ins.get("so_lancamento"):
            continue
        ik = ins["chave"]
        atual = sum(m["consumo"] for (i, _c), m in mov.items() if i == ik)
        antes = sum(m["consumo"] for (i, _c), m in mov_ant.items() if i == ik)
        if atual <= 0 and antes <= 0:
            continue
        custo, _f = custo_unitario(ik, "", custos, catalogo)
        por_casa = {}
        for c in CASAS:
            a = mov.get((ik, c["chave"]), {}).get("consumo", 0.0)
            b = mov_ant.get((ik, c["chave"]), {}).get("consumo", 0.0)
            por_casa[c["chave"]] = {"atual": round(a, 2), "anterior": round(b, 2),
                                   "variacao": round((a - b) / b, 4) if b else None}
        variacao.append({
            "insumo": ins["nome"], "chave": ik, "un": ins["un"],
            "atual": round(atual, 2), "anterior": round(antes, 2),
            "diferenca": round(atual - antes, 2),
            "variacao": round((atual - antes) / antes, 4) if antes else None,
            "impacto_reais": round((atual - antes) * custo, 2) if custo else None,
            "por_casa": por_casa,
        })
    variacao.sort(key=lambda v: -abs(v["impacto_reais"] or 0) if v["impacto_reais"] is not None
                  else -abs(v["variacao"] or 0))

    # --- 6. desperdicio do mes (o que virou perda, em quantidade e em dinheiro)
    perdas = []
    for (ik, ck), m in mov.items():
        if m["desperdicio"] <= 0 or ik not in nomes:
            continue
        custo, _f = custo_unitario(ik, ck, custos, catalogo)
        perdas.append({"insumo": nomes[ik]["nome"], "chave": ik, "un": nomes[ik]["un"],
                       "casa": ck, "casa_nome": casas[ck], "qtd": round(m["desperdicio"], 3),
                       "valor": round(m["desperdicio"] * custo, 2) if custo else None})
    perdas.sort(key=lambda x: -(x["valor"] or 0))

    # evolucao dos ultimos 12 meses: faturamento do grupo e consumo valorizado.
    # E o que responde "estamos gastando mais insumo do que vendendo?" — a linha
    # de consumo subindo mais rapido que a de faturamento e o sinal de alerta.
    # Duas séries por mês, e a diferença entre elas importa:
    #
    #   cheia    — o mês inteiro. É o que os gráficos grandes mostram, onde o
    #              número absoluto é a informação;
    #   recortada— todos os meses cortados no mesmo dia do mês em curso (dia 1
    #              ao 17 de cada mês, por exemplo). É o que os blocos de
    #              destaque usam.
    #
    # Sem o recorte, a curva do bloco desmentia a própria variação ao lado: o
    # camarão M subia 3% contra o mesmo trecho de julho, mas o último ponto da
    # curva era agosto com 17 dias contra julho com 31 — e o desenho descia.
    serie = []
    consumo_mes, consumo_mes_p = {}, {}
    for m in meses[-12:]:
        f_m, mv_m = totais_do_mes(m)
        f_p, mv_p = totais_do_mes(m, dia_limite) if parcial else (f_m, mv_m)
        valor = valor_p = 0.0
        for (ik, ck), mm in mv_m.items():
            custo, _f = custo_unitario(ik, ck, custos, catalogo)
            if custo and not nomes.get(ik, {}).get("so_lancamento"):
                valor += mm["consumo"] * custo
            consumo_mes.setdefault(ik, {})[m] = consumo_mes.setdefault(ik, {}).get(m, 0.0) + mm["consumo"]
        for (ik, ck), mm in mv_p.items():
            custo, _f = custo_unitario(ik, ck, custos, catalogo)
            if custo and not nomes.get(ik, {}).get("so_lancamento"):
                valor_p += mm["consumo"] * custo
            consumo_mes_p.setdefault(ik, {})[m] = consumo_mes_p.setdefault(ik, {}).get(m, 0.0) + mm["consumo"]
        total_m, total_p = sum(f_m.values()), sum(f_p.values())
        serie.append({"mes": m, "faturamento": round(total_m, 2),
                      "consumo_valor": round(valor, 2),
                      "faturamento_trecho": round(total_p, 2),
                      "consumo_valor_trecho": round(valor_p, 2),
                      "peso": round(valor / total_m, 4) if total_m else None,
                      "por_casa": {ck: round(v, 2) for ck, v in f_m.items()}})

    # a série curta de cada insumo alimenta o mini gráfico dos blocos de
    # destaque, e vai recortada no mesmo trecho para poder ser comparada
    meses_serie = [x["mes"] for x in serie][-6:]
    for v in variacao:
        historico = consumo_mes_p.get(v["chave"], {})
        v["serie"] = [round(historico.get(m, 0.0), 2) for m in meses_serie]

    # Consumo valorizado do mes e do mesmo trecho do mes anterior. Sem o
    # segundo numero o cartao mostraria um total sem referencia — e total sem
    # referencia nao diz se esta bom ou ruim.
    consumo_valor = consumo_valor_ant = 0.0
    for (ik, ck), m in mov.items():
        custo, _f = custo_unitario(ik, ck, custos, catalogo)
        if custo and not nomes.get(ik, {}).get("so_lancamento"):
            consumo_valor += m["consumo"] * custo
    for (ik, ck), m in mov_ant.items():
        custo, _f = custo_unitario(ik, ck, custos, catalogo)
        if custo and not nomes.get(ik, {}).get("so_lancamento"):
            consumo_valor_ant += m["consumo"] * custo

    return {
        "mes": mes, "mes_anterior": ant, "meses": meses,
        "parcial": parcial, "dia_limite": dia_limite,
        "serie_meses": serie,
        "consumo_valor": round(consumo_valor, 2),
        "consumo_valor_anterior": round(consumo_valor_ant, 2),
        "faturamento_total": round(total_fat, 2),
        "faturamento_anterior": round(sum(fat_ant.values()), 2),
        "participacao": participacao,
        "estoque": sorted(linhas_estoque, key=lambda l: -(l["valor"] or 0)),
        "valor_estoque": round(valor_estoque, 2),
        "abc": lista_abc,
        "criticos": criticos,
        "variacao": variacao,
        "perdas": perdas[:12],
        "compras": custos_de_compra(mes),
        "movimentos": movimentacoes(mes_inicio(mes), mes_fim(mes), limite=12)["movimentos"],
        "sem_custo": [nomes[i]["nome"] for i in sem_custo if i in nomes],
        "dias_seguranca": dias_seg,
    }


def mes_inicio(mes):
    return mes + "-01"


def mes_fim(mes):
    ano, m = int(mes[:4]), int(mes[5:7])
    fim = datetime(ano + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1) - timedelta(days=1)
    return fim.strftime("%Y-%m-%d")


def custos_de_compra(mes):
    """Custo unitario pago por produto, por unidade compradora, no mes.

    Sai das ordens ja emitidas: e o preco que realmente foi para a OC, nao o
    de tabela. Media ponderada pela quantidade — comprar 100 kg a 90 e 1 kg a
    200 nao e "custo medio 145".
    """
    ordens = ler_ordens().get("ordens", {})
    ant = mes_anterior(mes)
    acum = {}
    for o in ordens.values():
        quando = (o.get("data") or "")[:7]
        if quando not in (mes, ant):
            continue
        uni = o.get("unidade_oc") or "—"
        for i in o.get("itens", []):
            q, pr = numero(i.get("qtd")), numero(i.get("preco"))
            if q <= 0 or pr <= 0:
                continue
            alvo = acum.setdefault((uni, _norm(i.get("nome"))), {
                "unidade": uni, "produto": i.get("nome"), "un": i.get("un") or "",
                "qtd": 0.0, "gasto": 0.0, "qtd_ant": 0.0, "gasto_ant": 0.0})
            if quando == mes:
                alvo["qtd"] += q
                alvo["gasto"] += q * pr
            else:
                alvo["qtd_ant"] += q
                alvo["gasto_ant"] += q * pr
    fora = []
    for a in acum.values():
        atual = a["gasto"] / a["qtd"] if a["qtd"] else None
        antes = a["gasto_ant"] / a["qtd_ant"] if a["qtd_ant"] else None
        fora.append({
            "unidade": a["unidade"], "produto": a["produto"], "un": a["un"],
            "qtd": round(a["qtd"], 3), "gasto": round(a["gasto"], 2),
            "custo_un": round(atual, 4) if atual else None,
            "custo_un_anterior": round(antes, 4) if antes else None,
            "variacao": round((atual - antes) / antes, 4) if atual and antes else None,
        })
    fora.sort(key=lambda x: -(x["gasto"] or 0))
    return fora


def movimentacoes(inicio, fim, casa=None, insumo=None, tipo=None, limite=400):
    """Historico detalhado: cada entrada, saida, perda e consumo, dia a dia.

    O lancamento diario guarda o dia inteiro num registro so; aqui ele e aberto
    em uma linha por movimento, que e como se procura ("quando chegou camarao
    na Duque?", "quanto se perdeu de salmao semana passada?").
    """
    dados = carregar()
    nomes = {i["chave"]: i for i in INSUMOS}
    casas = {c["chave"]: c["nome"] for c in CASAS}
    fora, resumo = [], {t: {"qtd": 0.0, "n": 0} for t in TIPOS_MOV}
    for iso in sorted(dados, reverse=True):
        if not (inicio <= iso <= fim):
            continue
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict) or (casa and ck != casa):
                continue
            for ik, campos in (lan.get("insumos") or {}).items():
                if insumo and ik != insumo:
                    continue
                ins = nomes.get(ik)
                if not ins:
                    continue
                for t in TIPOS_MOV:
                    valor = numero(campos.get("uso") if t == "consumo" else campos.get(t))
                    if t == "consumo" and campos.get("uso") is None:
                        continue
                    if abs(valor) <= 0.0005:
                        continue
                    resumo[t]["qtd"] += valor
                    resumo[t]["n"] += 1
                    if tipo and t != tipo:
                        continue
                    fora.append({
                        "data": iso, "casa": ck, "casa_nome": casas.get(ck, ck),
                        "insumo": ins["nome"], "insumo_chave": ik, "un": ins["un"],
                        "tipo": t, "tipo_nome": TIPOS_MOV[t], "qtd": round(valor, 3),
                        "origem": "Planilha" if da_planilha(campos) else "Digitado",
                    })
    fora.sort(key=lambda m: (m["data"], m["casa"], m["insumo"]), reverse=True)
    for t in resumo:
        resumo[t]["qtd"] = round(resumo[t]["qtd"], 3)
    return {"inicio": inicio, "fim": fim, "total": len(fora),
            "movimentos": fora[:limite], "resumo": resumo,
            "tipos": TIPOS_MOV}


# --------------------------------------------------------------- servidor
class Servidor(http.server.ThreadingHTTPServer):
    """Atende varios PCs ao mesmo tempo.

    Com o HTTPServer comum (uma requisicao por vez) basta um navegador segurar
    a conexao aberta para todos os outros ficarem na fila — a tela de outro PC
    simplesmente nao carrega. O Gerador de OCs ja roda assim.
    """
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RAIZ), **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        # Servindo do proprio disco, cache nao economiza nada e custa caro: a
        # tela continua velha depois de um ajuste ate alguem lembrar do Ctrl+F5.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _json(self, code, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()          # o no-store sai de end_headers, para todos
        self.wfile.write(corpo)

    def _erro(self, code, msg):
        self._json(code, {"ok": False, "erro": msg})

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        rota = self.path.split("?")[0]
        # A porta de entrada do sistema e a Visao Geral: quem abre o endereco
        # quer o retrato do dia, nao a tela de digitacao. O lancamento diario
        # continua em index.html, no menu.
        if rota in ("/", "/index"):
            self.path = "/overview.html"
            return super().do_GET()
        try:
            if rota == "/api/config":
                return self._json(200, {"casas": CASAS, "insumos": INSUMOS,
                                        "faturamento_ok": FATURAMENTO.exists()})
            q = dict(p.split("=", 1) for p in self.path.split("?")[1].split("&")) \
                if "?" in self.path else {}
            if rota == "/api/dia":
                data = q.get("data") or datetime.now().strftime("%Y-%m-%d")
                return self._json(200, montar_dia(data))
            if rota == "/api/painel":
                pad_i, pad_f = periodo_padrao()
                return self._json(200, analisar(q.get("inicio") or pad_i, q.get("fim") or pad_f))
            if rota == "/api/projecao":
                return self._json(200, projetar(
                    q.get("data") or (periodo_padrao()[1]),
                    float(q.get("dias") or ler_compras().get("dias_a_cobrir_padrao", 7))))
            if rota == "/api/base":
                return self._json(200, ler_base())
            if rota == "/api/vinculos":
                return self._json(200, {"vinculos": ler_vinculos(),
                                        "insumos": ler_compras().get("insumos", [])})
            if rota == "/api/ocs":
                reg = ler_registro_oc()
                return self._json(200, {"counters": reg["counters"],
                                        "history": reg["history"][-120:],
                                        "arquivo": str(REGISTRO_OC)})
            if rota == "/api/ordens":
                return self._json(200, listar_ordens(q.get("situacao")))
            if rota == "/api/ocs/proximo":
                from urllib.parse import unquote
                uni = unquote(q.get("unidade") or "")
                return self._json(200, {"unidade": uni, "proximo": proximo_numero_oc(uni)})
            if rota == "/api/overview":
                return self._json(200, overview(q.get("mes")))
            if rota == "/api/movimentacoes":
                from urllib.parse import unquote
                pad_i, pad_f = periodo_padrao()
                return self._json(200, movimentacoes(
                    q.get("inicio") or pad_i, q.get("fim") or pad_f,
                    unquote(q.get("casa") or "") or None,
                    unquote(q.get("insumo") or "") or None,
                    unquote(q.get("tipo") or "") or None,
                    int(q.get("limite") or 400)))
            if rota == "/api/sincronizar":
                return self._json(200, sincronizar())
            if rota == "/api/ocorrencias":
                from urllib.parse import unquote
                return self._json(200, ocorrencias_do_dia(
                    q.get("insumo"), q.get("casa"), int(q.get("n") or 7),
                    unquote(q.get("semana") or "") or None))
            if rota == "/api/serie":
                pad_i, pad_f = periodo_padrao()
                s = series_do_periodo(q.get("inicio") or pad_i, q.get("fim") or pad_f)
                chave = (q.get("insumo"), q.get("casa"))
                return self._json(200, {"pontos": [
                    {"data": d, "coef": round(c, 4)} for d, _sem, c in sorted(s.get(chave, []))]})
            return super().do_GET()
        except Exception:
            return self._erro(500, traceback.format_exc())

    def do_POST(self):
        try:
            if self.path == "/api/dia":
                return self._json(200, gravar_dia(self._corpo()))
            if self.path == "/api/movimentacao":
                return self._json(200, gravar_movimentacao(self._corpo()))
            if self.path == "/api/pedido":
                return self._json(200, gravar_pedido(self._corpo()))
            if self.path == "/api/ordem":
                return self._json(200, gravar_ordem(self._corpo()))
            if self.path == "/api/ordem/nova":
                return self._json(200, criar_ordem(self._corpo()))
            if self.path == "/api/ordens/lote":
                return self._json(200, criar_ordens_lote(self._corpo()))
            if self.path == "/api/base":
                return self._json(200, gravar_base(self._corpo()))
            if self.path == "/api/vinculos":
                return self._json(200, gravar_vinculos(self._corpo().get("vinculos")))
            if self.path == "/api/ocs/reservar":
                c = self._corpo()
                return self._json(200, reservar_oc(c.get("unidade"), c.get("quantidade", 1),
                                                   c.get("comeco"), c.get("entradas")))
            return self._erro(404, "rota desconhecida")
        except ValueError as e:
            return self._erro(400, str(e))
        except Exception:
            return self._erro(500, traceback.format_exc())


def ja_rodando():
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=1):
            return True
    except OSError:
        return False


if __name__ == "__main__":
    if ja_rodando():
        print("O servidor ja esta rodando nesta maquina (porta %d)." % PORT)
        print("Abra http://localhost:%d no navegador." % PORT)
        raise SystemExit(0)
    DADOS.mkdir(exist_ok=True)
    BACKUPS.mkdir(exist_ok=True)
    print("=" * 58)
    print("  CDE Web - Controle Diario de Estoque")
    print("  http://localhost:%d" % PORT)
    print("  http://%s:%d   <- use este nos outros PCs" % (socket.gethostname(), PORT))
    print("  Faturamento: %s" % ("encontrado" if FATURAMENTO.exists() else "NAO ENCONTRADO"))
    print("=" * 58)
    print("  NAO FECHE ESTA JANELA enquanto estiver usando o sistema.")
    try:
        Servidor(("", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
