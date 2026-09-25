# -*- coding: utf-8 -*-
"""
Gera o Relatório Operacional de Coeficiente de Consumo (HTML + PDF)
para qualquer mês e qualquer insumo, a partir dos lançamentos diários do CDE Web.

Coeficiente = Consumo total ÷ Faturamento × 1.000  (unidades por R$ 1.000).
Menor = mais eficiente. Queda = ganho de eficiência.

Duas guardas herdadas do recalcular_metas.py, que precisam valer aqui também:

  PISO DE FATURAMENTO — dia cujo faturamento fica abaixo de 10% da mediana
  histórica da casa não entra em conta nenhuma. Existe por um dia real:
  16/08/2026 a Senador Lemos gravou R$ 20,80 de faturamento com consumo normal,
  e o coeficiente daquele dia deu 584 onde o normal é 0,63. Na conta do mês
  inteiro o estrago é pequeno, mas o mapa do mês, os alertas e a semana a semana
  são leituras no nível do DIA — ali um dia desses apaga a escala de todos os
  outros. O dia descartado nunca some em silêncio: sai listado no relatório.

  BASE DE CÁLCULO — este relatório usa a base agregada (consumo do mês ÷
  faturamento do mês), porque é ela que amarra com o dinheiro e com o % do
  faturamento. A meta de metas.json nasce de outra base (média dos coeficientes
  diários). Com o piso aplicado as duas praticamente coincidem; sem o piso, não.
  A seção "Como o relatório é gerado" diz isso em texto, no relatório.

Uso:
    python gerar_relatorio_coef.py --mes 2026-08 --insumo salmao_equivalente
    python gerar_relatorio_coef.py --mes 2026-08 --insumo camarao_m --comparativo 2026-06
    python gerar_relatorio_coef.py --mes 2026-09 --insumo salmao_equivalente --no-pdf

Padrões:
  - comparativo = mês anterior
  - fonte de dados = ./dados (ao lado do script) ou --dados <pasta>
  - saída = ./saida (ou --saida <pasta>)
  - PDF via Chrome/Edge headless (use --no-pdf para pular)
"""
import argparse, json, os, sys, glob, subprocess, calendar, datetime, statistics
from collections import defaultdict

# ----------------------------------------------------------------------------- config de insumos
CASAS = ['SL', 'DC', 'DLU', 'DLCN']
NOMES_CASA = {'SL': 'Senador Lemos', 'DC': 'Duque de Caxias', 'DLU': 'Umarizal', 'DLCN': 'Cidade Nova'}
DOW = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo']
MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
         'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
MES_ABR = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

# nome de exibição + (opcional) fator kg/unidade e notas por insumo
INSUMOS = {
    # KG POR PEIXE — o numero existe em quatro lugares deste projeto e eles NAO
    # batem: aqui, no relatorio de julho (4,0 redondo, que foi o usado para montar
    # o custos.json atual) e em compras.json (30 kg / 7 peixes = 4,2857, que e o
    # que alimenta file_em_peixes no server.py). Entre 4,0 e 4,2857 o custo do mes
    # anda 7%. O valor abaixo e o informado pela operacao em 24/09/2026.
    # Ao mudar aqui, conferir compras.json — nao vale so um dos dois.
    'salmao_equivalente': {'nome': 'Salmão (equivalente)', 'unidade': 'Pxs', 'kg': 4.089,
        'kg_nota': 'peixe 08/10 = 4,089 kg/un — equivalente-padrão',
        'consumo_sub': 'Salmão-equivalente no mês',
        'formula_extra': 'Consumo em salmão-equivalente (peixe inteiro), com o tamanho 08/10 como padrão de conversão (4,089 kg/un).'},
    'salmao_0810': {'nome': 'Salmão 08/10', 'unidade': 'Pxs', 'kg': 4.089, 'kg_nota': '4,089 kg/un'},
    'salmao_1012': {'nome': 'Salmão 10/12', 'unidade': 'Pxs'},
    'salmao_1214': {'nome': 'Salmão 12/14', 'unidade': 'Pxs'},
    'salmao_1416': {'nome': 'Salmão 14/16', 'unidade': 'Pxs'},
    'salmao_file': {'nome': 'Salmão (filé)', 'unidade': 'Kg'},
    'camarao_g': {'nome': 'Camarão G', 'unidade': 'Kg'},
    'camarao_m': {'nome': 'Camarão M', 'unidade': 'Kg'},
    'camarao_p': {'nome': 'Camarão P', 'unidade': 'Kg'},
    'atum': {'nome': 'Atum', 'unidade': 'Kg'},
    'file_tilapia': {'nome': 'Filé de Tilápia', 'unidade': 'Kg'},
    'lula': {'nome': 'Lula (anel)', 'unidade': 'Kg'},
    'lula_in_natura': {'nome': 'Lula in natura', 'unidade': 'Kg'},
    'kani': {'nome': 'Kani', 'unidade': 'Kg'},
    'nori': {'nome': 'Nori', 'unidade': 'Pct'},
    'polvo': {'nome': 'Polvo', 'unidade': 'Kg'},
    'polvo_in_natura': {'nome': 'Polvo in natura', 'unidade': 'Kg'},
    'anchova': {'nome': 'Anchova', 'unidade': 'Kg'},
    'cream_cheese': {'nome': 'Cream Cheese', 'unidade': 'Bng'},
    'arroz': {'nome': 'Arroz de Sushi', 'unidade': 'Pct'},
    'patinho': {'nome': 'Patinho', 'unidade': 'Kg'},
    'atum_in_natura': {'nome': 'Atum in natura', 'unidade': 'Kg'},
}

# ----------------------------------------------------------------------------- processados
# Lula, polvo e atum chegam IN NATURA e sao processados antes de ir ao balcao.
# O relatorio precisa medi-los na forma in natura, que e a forma comprada:
# 1 kg de anel de lula consumido saiu de 1/0,71 = 1,40 kg de lula in natura.
#
# A conversao e SUBSTITUICAO, nao soma. O "uso" da linha in natura nao e
# consumo: e o que foi mandado para o processamento (conferido em 365 dos 370
# processamentos do arquivo, onde os dois numeros sao identicos). Somar as duas
# linhas contaria a mesma materia-prima duas vezes.
#
# O rendimento sai do processamento REAL registrado, na ordem: o do proprio mes
# naquela casa, senao o historico da casa, senao o da rede, e so entao o padrao
# da planilha — que o server.py assume ser o meio de uma faixa, ou seja, palpite.
PROCESSAVEIS = {
    'lula':  {'in_natura': 'lula_in_natura',  'nome': 'Lula (in natura equivalente)',  'padrao': 0.70},
    'polvo': {'in_natura': 'polvo_in_natura', 'nome': 'Polvo (in natura equivalente)', 'padrao': 0.30},
    'atum':  {'in_natura': 'atum_in_natura',  'nome': 'Atum (in natura equivalente)',  'padrao': 0.85},
}
# chave do relatorio -> chave do processado de origem
EQUIVALENTES = {k + '_equivalente': k for k in PROCESSAVEIS}

for _k, _p in PROCESSAVEIS.items():
    INSUMOS[_k + '_equivalente'] = {
        'nome': _p['nome'], 'unidade': 'Kg',
        'consumo_sub': _p['nome'] + ' no mês',
        'formula_extra': ('Consumo medido na forma <b>in natura</b>: o processado que saiu do '
                          'balcão, dividido pelo rendimento real do processamento do mês. '
                          'É a forma em que o insumo é comprado.'),
    }


def rendimentos(lanc):
    """Rendimento ponderado do processamento, em tres niveis de precisao.

    Ponderado (soma do processado / soma do in natura) e nao media simples: um
    processamento de 1 kg nao pode pesar igual a um de 20 kg.
    """
    acc = {}
    for dt, dia in lanc.items():
        if not isinstance(dia, dict):
            continue
        for casa, lan in dia.items():
            if not isinstance(lan, dict):
                continue
            for k, pr in (lan.get('processamento') or {}).items():
                ent, sai = pr.get('in_natura'), pr.get('processado')
                if not ent or not sai:
                    continue
                # tres niveis: mes+casa, casa, rede
                for chave in ((k, casa, dt[:7]), (k, casa, None), (k, None, None)):
                    a = acc.setdefault(chave, [0.0, 0.0, 0])
                    a[0] += float(sai); a[1] += float(ent); a[2] += 1
    return acc


MIN_PROC_MES = 2      # abaixo disso um processamento isolado definiria o mes


def rendimento_de(acc, chave, casa, mes=None):
    """(rendimento, de onde veio).

    Preferencia pelo rendimento do PROPRIO MES naquela casa: ele varia de mes a
    mes de verdade (a lula na DLCN foi de 0,736 em fevereiro a 0,690 em agosto),
    e o relatorio e mensal. Mes com menos de MIN_PROC_MES processamentos nao
    manda — um processamento solto definiria o mes inteiro —, e a conta cai para
    o historico da casa, depois o da rede, e so entao o padrao da planilha.
    """
    tentativas = ((( chave, casa, mes), 'o próprio mês nesta casa', MIN_PROC_MES),
                  ((chave, casa, None), 'o histórico desta casa', 1),
                  ((chave, None, None), 'o histórico da rede', 1))
    for alvo, fonte, minimo in tentativas:
        if alvo[2] is None and mes is None and fonte.startswith('o próprio'):
            continue
        sai, ent, n = acc.get(alvo, [0.0, 0.0, 0])
        if ent > 0 and n >= minimo:
            return sai / ent, fonte
    return PROCESSAVEIS[chave]['padrao'], 'o padrão da planilha (sem processamento registrado)'


# ----------------------------------------------------------------------------- nomes e unidades
# Nomes como a operacao chama o produto (definidos em 24/09/2026) e a unidade em
# que o relatorio mede. O salmao e CONTADO em peixes no CDE mas LIDO em quilos
# aqui: o fator abaixo converte consumo e meta juntos, senao o relatorio
# compararia quilos com uma meta que nasceu em peixes.
NOMES_OPERACAO = {
    'salmao_equivalente': 'Salmão Inteiro Eviscerado',
    'salmao_0810': 'Salmão Inteiro Eviscerado 08/10',
    'salmao_1012': 'Salmão Inteiro Eviscerado 10/12',
    'salmao_1214': 'Salmão Inteiro Eviscerado 12/14',
    'salmao_1416': 'Salmão Inteiro Eviscerado 14/16',
    'polvo': 'Tentáculo de Polvo', 'polvo_in_natura': 'Tentáculo de Polvo — in natura',
    'polvo_equivalente': 'Tentáculo de Polvo',
    'lula': 'Lula em Anel', 'lula_in_natura': 'Lula em Anel — in natura',
    'lula_equivalente': 'Lula em Anel',
    'atum': 'Lombo de Atum Fresco', 'atum_in_natura': 'Lombo de Atum Fresco — in natura',
    'atum_equivalente': 'Lombo de Atum Fresco',
    'arroz': 'Arroz para Sushi', 'cream_cheese': 'Cream Cheese',
    'camarao_m': 'Camarão M', 'camarao_g': 'Camarão G', 'camarao_p': 'Camarão P',
    'nori': 'Nori', 'kani': 'Kani', 'patinho': 'Patinho', 'anchova': 'Anchova',
    'file_tilapia': 'Filé de Peixe Branco',
}
# quilos por unidade contada — so o salmao, que o CDE conta em peixes
KG_0810 = 4.089
FATOR_LIBRA = {'salmao_0810': 1.00, 'salmao_1012': 1.25, 'salmao_1214': 1.48, 'salmao_1416': 1.67}
EM_KG = {'salmao_equivalente': KG_0810}
EM_KG.update({k: round(KG_0810 * f, 4) for k, f in FATOR_LIBRA.items()})

for _k, _n in NOMES_OPERACAO.items():
    INSUMOS.setdefault(_k, {})['nome'] = _n
for _k, _kg in EM_KG.items():
    i = INSUMOS.setdefault(_k, {})
    i['unidade'] = 'kg'
    i['kg'] = None                      # o consumo ja sai em kg; nao ha o que converter
    i['fator_kg'] = _kg
    i['kg_nota'] = 'peixe inteiro eviscerado = %s kg' % ('%.3f' % _kg).replace('.', ',')
    i['consumo_sub'] = _n + ' no mês'
    i['formula_extra'] = ('Medido em <b>quilos de peixe inteiro eviscerado</b>. O CDE conta '
                          'peixes; o relatório converte pelo peso médio da unidade '
                          '(%s kg), e a meta acompanha a mesma conversão.'
                          % ('%.3f' % _kg).replace('.', ','))


def cfg_insumo(key):
    c = dict(INSUMOS.get(key, {}))
    c.setdefault('nome', key.replace('_', ' ').title())
    c.setdefault('unidade', 'un')
    return c

# ----------------------------------------------------------------------------- helpers de data
def prev_month(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return f'{y-1}-12' if m == 1 else f'{y}-{m-1:02d}'

def month_days(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    return [f'{ym}-{d:02d}' for d in range(1, calendar.monthrange(y, m)[1] + 1)]

def range_label(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    last = calendar.monthrange(y, m)[1]
    return f'01–{last:02d} {MES_ABR[m]} {y}'

# ----------------------------------------------------------------------------- guardas
def mediana(v):
    return statistics.median(v) if v else 0.0

def piso_faturamento(lanc, fator=0.10):
    """Piso por casa = 10% da mediana histórica dela. Relativo, e não um valor
    fixo, porque as casas têm escalas diferentes — a DLU fatura o dobro da DC.
    Mesma regra do recalcular_metas.py; se mudar lá, muda aqui."""
    fats = defaultdict(list)
    for dia in lanc.values():
        for ck, lan in dia.items():
            if isinstance(lan, dict) and float(lan.get('faturamento') or 0) > 0:
                fats[ck].append(float(lan['faturamento']))
    return {ck: mediana(v) * fator for ck, v in fats.items()}

# ----------------------------------------------------------------------------- extração
def rec(lanc, dt, casa, insumo, rend=None):
    r = (lanc.get(dt) or {}).get(casa)
    if not isinstance(r, dict):
        return None
    origem = EQUIVALENTES.get(insumo)
    if origem:                       # lula/polvo/atum medidos na forma in natura
        ins = (r.get('insumos') or {}).get(origem) or {}
        uso = ins.get('uso')
        if uso is None or not rend:
            return None
        uso = uso / rend
    else:
        ins = (r.get('insumos') or {}).get(insumo) or {}
        uso = ins.get('uso')
        if uso is None:
            return None
    fator = EM_KG.get(insumo)        # salmao: de peixes contados para quilos
    if fator:
        uso = uso * fator
    return uso, (r.get('faturamento') or 0)

def series(lanc, ym, casa, insumo, piso=None, descartados=None, inconsistentes=None, rend=None):
    """Série diária da casa no mês.

    Dia abaixo do piso de faturamento fica de fora e vai para `descartados` — é
    erro de digitação, não desempenho.

    Dia de consumo NEGATIVO continua na série, mas vai marcado em
    `inconsistentes`. Consumo negativo não existe: é divergência de contagem em
    dia de recebimento (entrou mercadoria e o fechamento sobrou para baixo).
    Fica na conta do mês porque o saldo físico depende dele — tirar faria o
    consumo do mês não bater com a contagem —, mas não pode ser lido como
    eficiência em nenhuma leitura do nível do dia."""
    lim = (piso or {}).get(casa, 0)
    out = []
    for dt in month_days(ym):
        rr = rec(lanc, dt, casa, insumo, rend)
        if rr is None:
            continue
        uso, fat = rr
        if fat <= 0:
            continue
        if fat < lim:
            if descartados is not None:
                descartados.append({'data': dt, 'casa': casa, 'fat': fat, 'cons': uso,
                                    'piso': lim, 'coef': uso / fat * 1000})
            continue
        d = datetime.date.fromisoformat(dt)
        if uso < 0 and inconsistentes is not None:
            inconsistentes.append({'data': dt, 'casa': casa, 'cons': uso, 'fat': fat})
        out.append({'dia': d.day, 'dow': DOW[d.weekday()], 'cons': uso, 'fat': fat,
                    'coef': uso / fat * 1000, 'neg': uso < 0})
    return out


def semanas(s):
    """Blocos de 7 dias contados do dia 1 (1–7, 8–14, 15–21, 22–28, 29+).

    Blocos de sete, e não semanas do calendário, porque cada bloco carrega
    exatamente um de cada dia da semana — comparar S1 com S2 compara períodos
    de mesma composição. Semana do calendário no começo e no fim do mês vem
    pela metade e faria a primeira e a última parecerem sempre as menores.
    O último bloco do mês é curto (3 dias em mês de 31) e vai marcado.
    """
    blocos = {}
    for x in s:
        b = min((x['dia'] - 1) // 7, 4)
        blocos.setdefault(b, []).append(x)
    out = []
    for b in sorted(blocos):
        g = blocos[b]
        u = sum(x['cons'] for x in g); f = sum(x['fat'] for x in g)
        de, ate = min(x['dia'] for x in g), max(x['dia'] for x in g)
        # 'parcial' é bloco curto por borda do mês (o S5 tem 3 dias em mês de 31);
        # 'faltam' é dia que existia na janela e não entrou — normalmente o dia
        # descartado pelo piso. São coisas diferentes e a leitura muda com isso.
        out.append({'i': b + 1, 'rotulo': 'S%d' % (b + 1),
                    'de': de, 'ate': ate, 'dias': len(g),
                    'parcial': (ate - de + 1) < 7,
                    'faltam': max(0, (ate - de + 1) - len(g)),
                    'cons': u, 'fat': f, 'coef': (u / f * 1000) if f else 0})
    return out

def totals(s):
    u = sum(x['cons'] for x in s); f = sum(x['fat'] for x in s)
    return u, f, (u / f * 1000 if f > 0 else 0)

def custo_casa(custos, insumo, casa, mensais=None, mes=None):
    """Custo unitário da casa, na unidade do CDE.

    Ordem: o preço DAQUELE MES (custos_mensais.json, que sai da planilha de
    preços) -> o mês mais próximo do mesmo insumo e casa -> o valor fixo de
    custos.json. Sem nada disso devolve None e o relatório omite tudo que é em
    reais: melhor não ter a seção do que tê-la com preço chutado.

    O preço do mês vale mais que a média porque o relatório é mensal e o preço
    mexeu de verdade no semestre — o salmão foi de R$ 164 a R$ 207 por peixe
    entre fevereiro e junho, 26% de diferenca.

    Os itens processados (lula, polvo, atum) sao medidos na forma in natura,
    entao o preco que vale para eles e o do in natura, que e o que se compra.
    """
    chave = insumo
    origem = EQUIVALENTES.get(insumo)
    if origem:
        chave = PROCESSAVEIS[origem]['in_natura']

    porcasa = ((mensais or {}).get(chave) or {}).get(casa) or {}
    if porcasa:
        if mes and mes in porcasa:
            return porcasa[mes], 'do mês'
        if mes:                       # sem o mês pedido, o mais próximo que existir
            perto = min(porcasa, key=lambda m: abs(
                (int(m[:4]) * 12 + int(m[5:7])) - (int(mes[:4]) * 12 + int(mes[5:7]))))
            return porcasa[perto], 'de ' + perto

    c = custos.get(chave)
    v = c.get(casa) if isinstance(c, dict) else c
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None, None
    return (v, 'fixo') if v > 0 else (None, None)


def build_data(lanc, metas, custos, insumo, cur, prev, piso, rends=None, mensais=None):
    mm = int(cur[5:7])
    suffix = f'/{mm:02d}'
    metas_ins = (metas.get(insumo) or {})
    descartados = []
    inconsistentes = []
    data = {'casas': [], 'daily': {}, 'weekday': {}, 'destaques': {}, 'semanas': {},
            'descartados': descartados, 'inconsistentes': inconsistentes}
    tuA = tfA = tuJ = tfJ = 0.0
    trsA = trsJ = 0.0          # reais consumidos, para o CMV da rede
    algum_custo = False
    origem = EQUIVALENTES.get(insumo)
    data['rendimentos'] = {}
    for c in CASAS:
        rend = None
        if origem:
            rend, fonte = rendimento_de(rends or {}, origem, c, cur)
            data['rendimentos'][c] = {'valor': round(rend, 4), 'fonte': fonte}
        sA = series(lanc, cur, c, insumo, piso, descartados, inconsistentes, rend)
        sJ = series(lanc, prev, c, insumo, piso, descartados, None, rend)
        uA, fA, coA = totals(sA); uJ, fJ, coJ = totals(sJ)
        tuA += uA; tfA += fA; tuJ += uJ; tfJ += fJ
        meta = metas_ins.get(c)
        if meta is not None and EM_KG.get(insumo):
            # a meta de metas.json nasceu em peixes por R$ 1.000; o relatorio le
            # em quilos, entao ela passa pelo mesmo fator. Sem isto o relatorio
            # mostraria "coef 2,44 contra meta 0,58" e toda casa estaria fora.
            meta = round(meta * EM_KG[insumo], 4)
        custo, fonte_custo = custo_casa(custos, insumo, c, mensais, cur)
        custo_ant, _ = custo_casa(custos, insumo, c, mensais, prev)
        if custo:
            algum_custo = True
            trsA += uA * custo; trsJ += uJ * (custo_ant or custo)
        data['casas'].append({
            'sigla': c, 'nome': NOMES_CASA[c],
            'cJul': uA, 'cJun': uJ, 'dun': uA - uJ, 'dpct': (uA / uJ - 1) if uJ else 0,
            'fJul': fA, 'fJun': fJ, 'dfpct': (fA / fJ - 1) if fJ else 0,
            'coefJul': coA, 'coefJun': coJ, 'dcoef': coA - coJ,
            'meta': meta,
            # em reais: quanto do faturamento da casa virou este insumo
            'custoUn': custo, 'custoFonte': fonte_custo, 'custoUnAnt': custo_ant,
            'rsJul': (uA * custo) if custo else None,
            'rsJun': (uJ * (custo_ant or custo)) if custo else None,
            'cmvJul': (uA * custo / fA * 100) if (custo and fA) else None,
            'cmvJun': (uJ * (custo_ant or custo) / fJ * 100) if (custo and fJ) else None,
            'dias': len(sA)})
        data['semanas'][c] = semanas(sA)
        data['daily'][c] = [{'dia': x['dia'], 'dow': x['dow'], 'cons': x['cons'],
                             'fat': x['fat'], 'coef': x['coef'], 'neg': x['neg']} for x in sA]
        wk = []
        for dow in DOW:
            aj = [x for x in sA if x['dow'] == dow]; pj = [x for x in sJ if x['dow'] == dow]
            mA = sum(x['cons'] for x in aj) / len(aj) if aj else 0
            mJ = sum(x['cons'] for x in pj) / len(pj) if pj else 0
            cf = sum(x['coef'] for x in aj) / len(aj) if aj else 0
            wk.append({'dow': dow, 'medJul': mA, 'medJun': mJ, 'dpct': (mA / mJ - 1) if mJ else 0, 'coef': cf})
        data['weekday'][c] = wk
        if len(sA) >= 2:
            diffs = [(sA[i]['cons'] - sA[i - 1]['cons'], sA[i]['dia']) for i in range(1, len(sA))]
            alta = max(diffs); queda = min(diffs)
        else:
            alta = queda = (0, sA[0]['dia'] if sA else 1)
        maior = max(sA, key=lambda x: x['cons']) if sA else {'cons': 0, 'dia': 1}
        cv = [x for x in sA if x['fat'] > 0 and x['cons'] > 0]
        menor = min(cv, key=lambda x: x['cons']) if cv else maior
        f = lambda dnum: f'{dnum:02d}{suffix}'
        data['destaques'][c] = [
            {'ind': 'Maior alta dia-a-dia (un)', 'data': f(alta[1]), 'val': alta[0]},
            {'ind': 'Maior queda dia-a-dia (un)', 'data': f(queda[1]), 'val': queda[0]},
            {'ind': 'Maior consumo do mês (un)', 'data': f(maior['dia']), 'val': maior['cons']},
            {'ind': 'Menor consumo em dia com venda (un)', 'data': f(menor['dia']), 'val': menor['cons']},
        ]
    data['total'] = {'cJul': tuA, 'cJun': tuJ, 'dun': tuA - tuJ, 'dpct': (tuA / tuJ - 1) if tuJ else 0,
                     'fJul': tfA, 'fJun': tfJ, 'dfpct': (tfA / tfJ - 1) if tfJ else 0,
                     'coefJul': tuA / tfA * 1000 if tfA else 0, 'coefJun': tuJ / tfJ * 1000 if tfJ else 0,
                     'dcoef': (tuA / tfA * 1000 if tfA else 0) - (tuJ / tfJ * 1000 if tfJ else 0),
                     'rsJul': trsA if algum_custo else None,
                     'rsJun': trsJ if algum_custo else None,
                     'cmvJul': (trsA / tfA * 100) if (algum_custo and tfA) else None,
                     'cmvJun': (trsJ / tfJ * 100) if (algum_custo and tfJ) else None}
    # semana a semana da rede: soma as casas bloco a bloco
    porbloco = {}
    for c in CASAS:
        for w in data['semanas'][c]:
            b = porbloco.setdefault(w['i'], {'i': w['i'], 'rotulo': w['rotulo'], 'de': w['de'],
                                             'ate': w['ate'], 'dias': 0, 'faltam': 0,
                                             'cons': 0.0, 'fat': 0.0})
            b['cons'] += w['cons']; b['fat'] += w['fat']
            b['dias'] += w['dias']; b['faltam'] += w['faltam']
            b['de'] = min(b['de'], w['de']); b['ate'] = max(b['ate'], w['ate'])
    for b in porbloco.values():
        b['coef'] = (b['cons'] / b['fat'] * 1000) if b['fat'] else 0
        b['parcial'] = (b['ate'] - b['de'] + 1) < 7
    data['semanasRede'] = [porbloco[k] for k in sorted(porbloco)]
    data['temCusto'] = algum_custo
    return data


def metas_propostas(raiz, insumo):
    """O que o recalcular_metas.py proporia hoje para este insumo.

    Importa a regra de lá em vez de reescrevê-la: meta é parametrização, e duas
    implementações da mesma regra viram duas metas diferentes na primeira vez
    que alguém mexer em uma só. Quem GRAVA metas.json continua sendo o script;
    aqui a proposta é só leitura, para a diretoria ver o alvo antes de valer."""
    try:
        if raiz not in sys.path:
            sys.path.insert(0, raiz)
        import recalcular_metas as rm
    except Exception as e:
        return None, 'recalcular_metas.py não pôde ser lido (%s)' % e
    try:
        coef, meses = rm.coeficientes_por_mes()
        mes_atual = datetime.datetime.now().strftime('%Y-%m')
        completos = [m for m in meses if m < mes_atual]
        if len(completos) < 2:
            return None, 'histórico curto demais para propor meta'
        out = {}
        for ck in CASAS:
            r = rm.meta_da_serie(coef.get((insumo, ck), {}), completos)
            out[ck] = {'meta': r[0], 'm1': r[1], 'm3': r[2], 'm6': r[3]} if r else None
        return {'metas': out, 'base_de': completos[-6:][0], 'base_ate': completos[-1]}, None
    except Exception as e:
        return None, 'não foi possível calcular a proposta (%s)' % e

# ----------------------------------------------------------------------------- PDF
def find_browser():
    for p in [r'C:/Program Files/Google/Chrome/Application/chrome.exe',
              r'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
              r'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
              r'C:/Program Files/Microsoft/Edge/Application/msedge.exe']:
        if os.path.exists(p):
            return p
    return None

def render_pdf(browser, html_path, pdf_path):
    url = 'file:///' + os.path.abspath(html_path).replace('\\', '/')
    subprocess.run([browser, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=12000',
                    f'--print-to-pdf={os.path.abspath(pdf_path)}', url],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return os.path.exists(pdf_path)

# ----------------------------------------------------------------------------- main
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='Relatório de coeficiente de consumo (CDE Web).')
    ap.add_argument('--mes', required=True, help='mês do relatório, AAAA-MM (ex.: 2026-08)')
    ap.add_argument('--insumo', default='salmao_equivalente', help='chave do insumo (ex.: salmao_equivalente, camarao_m)')
    ap.add_argument('--comparativo', help='mês comparativo AAAA-MM (padrão: mês anterior)')
    ap.add_argument('--dados', default=os.path.normpath(os.path.join(here, '..', 'dados')), help='pasta dos JSONs do CDE Web')
    ap.add_argument('--saida', default=os.path.join(here, 'saida'), help='pasta de saída')
    ap.add_argument('--template', default=os.path.join(here, 'modelo_coef.html'), help='template HTML')
    ap.add_argument('--custos-mensais', dest='custos_mensais',
                    help='JSON de custo por insumo/casa/mês (padrão: ./custos_mensais.json)')
    ap.add_argument('--piso', type=float, default=0.10,
                    help='piso de faturamento do dia, como fração da mediana da casa '
                         '(padrão 0.10 — mesma regra do recalcular_metas.py; 0 desliga)')
    ap.add_argument('--no-pdf', action='store_true', help='não gerar PDF')
    args = ap.parse_args()

    cur = args.mes
    prev = args.comparativo or prev_month(cur)
    ins = cfg_insumo(args.insumo)

    lanc = json.load(open(os.path.join(args.dados, 'lancamentos.json'), encoding='utf-8'))
    metas_path = os.path.join(args.dados, 'metas.json')
    metas = json.load(open(metas_path, encoding='utf-8')) if os.path.exists(metas_path) else {}
    metas = {k: v for k, v in metas.items() if k != '_nota'}
    custos_path = os.path.join(args.dados, 'custos.json')
    custos = json.load(open(custos_path, encoding='utf-8')) if os.path.exists(custos_path) else {}
    custos = {k: v for k, v in custos.items() if not k.startswith('_')}
    # preco por mes, que sai da planilha de precos. Fica FORA de dados/ de
    # proposito: o CDE Web le dados/custos.json e nao conhece este formato.
    mens_path = args.custos_mensais or os.path.join(here, 'custos_mensais.json')
    mensais = json.load(open(mens_path, encoding='utf-8')) if os.path.exists(mens_path) else {}
    mensais = {k: v for k, v in mensais.items() if not k.startswith('_')}

    if not any(cur in dt for dt in [d for d in lanc if d.startswith(cur)]):
        sys.exit(f'ERRO: sem lançamentos para {cur} em {args.dados}/lancamentos.json')

    piso = piso_faturamento(lanc, args.piso) if args.piso > 0 else {}
    rends = rendimentos(lanc)
    data = build_data(lanc, metas, custos, args.insumo, cur, prev, piso, rends, mensais)
    if data.get('rendimentos'):
        print('Rendimento do processamento usado para converter em in natura:')
        for c, r in data['rendimentos'].items():
            print(f'   {c:<5} {r["valor"]*100:.2f}%  (de {r["fonte"]})')
    for d in data['descartados']:
        print(f'AVISO: {d["data"]} {d["casa"]} fora do piso — faturamento R$ {d["fat"]:.2f} '
              f'(piso R$ {d["piso"]:.2f}); consumo {d["cons"]:.2f} não entrou na conta.')
    for d in data['inconsistentes']:
        print(f'AVISO: {d["data"]} {d["casa"]} com consumo NEGATIVO ({d["cons"]:.3f}) — '
              f'divergência de contagem; fica no total do mês, mas sai das leituras por dia.')
    raiz = os.path.normpath(os.path.join(here, '..'))
    prop, prop_erro = metas_propostas(raiz, args.insumo)
    data['propostas'] = prop
    data['propostasErro'] = prop_erro
    if data['total']['cJul'] == 0:
        sys.exit(f'ERRO: consumo zero para insumo "{args.insumo}" em {cur}. Verifique a chave do insumo.')

    mmc = int(cur[5:7]); yyc = cur[:4]
    mmp = int(prev[5:7])
    nxt = f'{int(yyc)+1}-01' if mmc == 12 else f'{yyc}-{mmc+1:02d}'
    mmn = int(nxt[5:7])
    title = f'Coeficiente de consumo — {ins["nome"]} — {MESES[mmc]} / {yyc}'
    formula_note = ('Lê-se como <b>unidades consumidas para cada R$ 1.000 de faturamento bruto</b>. '
                    'Quanto <b>menor</b> o coeficiente, maior a eficiência — mais receita por unidade. '
                    '<b>Queda = ganho de eficiência.</b> O faturamento usado em todo o relatório é o '
                    '<b>bruto</b>, como lançado no CDE: sem desconto de impostos, taxas de entrega ou '
                    'comissão de aplicativo. ' + ins.get('formula_extra', ''))
    tem_comp = data['total']['fJun'] > 0
    config = {
        'title': title,
        'insumoNome': ins['nome'],
        'curLabel': MESES[mmc], 'curShort': MES_ABR[mmc],
        'prevLabel': MESES[mmp], 'prevShort': MES_ABR[mmp],
        'mesSuffix': f'/{mmc:02d}',
        'unidade': ins['unidade'],
        'kgPorUn': ins.get('kg'),
        'kgNota': ins.get('kg_nota', ''),
        'consumoSub': ins.get('consumo_sub', ins['nome'] + ' no mês'),
        'proxLabel': MESES[mmn], 'proxShort': MES_ABR[mmn],
        # Janeiro/2026 e o primeiro mes do arquivo: nao existe mes anterior para
        # comparar. Sem esta bandeira o relatorio dividia por zero e imprimia
        # "o coeficiente piorou infinito%" e "R$ NaN" no lugar dos numeros.
        'temComparativo': tem_comp,
        'temCusto': data.get('temCusto', False),
        'pisoFator': args.piso,
        'footer': (f'Fonte: <b>CDE Web</b> · <code>dados/lancamentos.json</code> (consumo = uso diário de '
                   f'<b>{args.insumo}</b>; faturamento <b>bruto</b> por casa), <code>dados/metas.json</code> e '
                   f'<code>dados/custos.json</code> (custo unitário por casa). '
                   f'Coeficiente = Consumo ÷ Faturamento bruto × 1.000. Comparativo: {MESES[mmc]}/{yyc} × '
                   f'{MESES[mmp]}/{prev[:4]}. Gerado por gerar_relatorio_coef.py — uso interno da equipe de Suprimentos.'),
    }

    tpl = open(args.template, encoding='utf-8').read()
    html = (tpl.replace('{{TITLE}}', title)
               .replace('{{INSUMO_NOME}}', ins['nome'])
               .replace('{{SUBTITLE}}',
                        (f'Leitura consolidada das 4 casas com comparativo {MESES[mmp]} × {MESES[mmc]}, '
                         'série diária, padrão por dia da semana, destaques e acompanhamento de metas. '
                         'Preparado para apresentação à equipe.') if tem_comp else
                        (f'Leitura consolidada das 4 casas em {MESES[mmc]}, com série diária, padrão por '
                         'dia da semana, destaques e acompanhamento de metas. É o primeiro mês da base: '
                         'não há mês anterior para comparar, então o relatório traz o retrato do mês, '
                         'sem variações.'))
               .replace('{{CUR_RANGE}}', range_label(cur))
               .replace('{{PREV_RANGE}}', range_label(prev) if tem_comp else 'sem mês anterior na base')
               .replace('{{FONTE}}', 'CDE Web (lançamentos diários)')
               .replace('{{FORMULA_NOTE}}', formula_note)
               .replace('{{FOOTER}}', config['footer'])
               .replace('{{DATA}}', json.dumps(data, ensure_ascii=False, default=str))
               .replace('{{CONFIG}}', json.dumps(config, ensure_ascii=False)))

    from organizacao import pasta_mensal
    destino = pasta_mensal(args.saida, cur)      # saida/Relatório <Mês>/
    base = f'Relatorio_{args.insumo}_{cur}'
    html_path = os.path.join(destino, base + '.html')
    open(html_path, 'w', encoding='utf-8').write(html)
    print('HTML :', html_path)

    if not args.no_pdf:
        br = find_browser()
        if not br:
            print('AVISO: Chrome/Edge não encontrado — PDF não gerado (use --no-pdf para silenciar).')
        else:
            pdf_path = os.path.join(destino, base + '.pdf')
            ok = render_pdf(br, html_path, pdf_path)
            print('PDF  :', pdf_path if ok else '(falhou)')

    t = data['total']
    print(f'Resumo {args.insumo} {cur}: consumo {t["cJul"]:.1f} {ins["unidade"]} '
          f'({t["dpct"]*100:+.1f}%), coef {t["coefJul"]:.4f} (delta {t["dcoef"]:+.4f}).')

if __name__ == '__main__':
    main()
