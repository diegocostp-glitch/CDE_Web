# -*- coding: utf-8 -*-
"""Relatório FINANCEIRO consolidado — todos os insumos, mês a mês.

Os outros dois relatórios medem eficiência (coeficiente). Este mede DINHEIRO:
quanto saiu, quanto entrou, quanto ficou parado, e — o que interessa para
negociar — quanto do que mudou foi preço e quanto foi volume.

A separação preço/volume é o centro do relatório. Um gasto que sobe pode ser
a casa vendendo mais (bom) ou o fornecedor cobrando mais (a negociar), e a
soma dos dois esconde qual é qual:

    efeito preço  = consumo do mês x (preço do mês - preço da base)
    efeito volume = preço da base  x (consumo do mês - consumo da base)

Uso:
    python gerar_financeiro.py --de 2026-01 --ate 2026-08
"""
import argparse, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from gerar_relatorio_coef import (        # noqa: E402
    INSUMOS, CASAS, NOMES_CASA, MESES, MES_ABR, EM_KG, PROCESSAVEIS,
    piso_faturamento, rendimentos, rendimento_de, find_browser, render_pdf)

# insumos simples: a quantidade lancada ja esta na unidade do preco
SIMPLES = ['salmao_equivalente', 'camarao_g', 'camarao_m', 'camarao_p', 'cream_cheese',
           'arroz', 'nori', 'kani', 'patinho', 'anchova', 'file_tilapia']


def meses_entre(de, ate):
    y, m = int(de[:4]), int(de[5:7])
    fim = (int(ate[:4]), int(ate[5:7]))
    out = []
    while (y, m) <= fim:
        out.append('%04d-%02d' % (y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def preco_de(mensais, chave, casa, mes):
    """(preço, se é do próprio mês). Cai para o mês mais próximo — mês sem
    compra não tem preço para registrar, e o consumo saiu de estoque anterior."""
    p = (mensais.get(chave, {}).get(casa) or {})
    if not p:
        return None, False
    if mes in p:
        return p[mes], True
    alvo = int(mes[:4]) * 12 + int(mes[5:7])
    perto = min(p, key=lambda x: abs(int(x[:4]) * 12 + int(x[5:7]) - alvo))
    return p[perto], False


def coletar(lanc, mensais, lista, piso, rends):
    """Por insumo e por mês: quantidade e valor de consumo, entrada e estoque.

    A quantidade e o preço precisam estar na MESMA unidade, e é aqui que mora
    a parte chata: o salmão é contado em peixes e cotado por quilo, e lula,
    polvo e atum existem em duas formas físicas (in natura na geladeira e
    processado no balcão) que se valoram pelo mesmo preço de compra.
    """
    dados = {}
    for k in SIMPLES + list(PROCESSAVEIS):
        chave_preco = PROCESSAVEIS[k]['in_natura'] if k in PROCESSAVEIS else k
        nome = INSUMOS.get(k, {}).get('nome', k)
        un = INSUMOS.get(k, {}).get('unidade', 'un')
        if k in PROCESSAVEIS:
            un = 'Kg'
        dados[k] = {'chave': k, 'chavePreco': chave_preco, 'nome': nome, 'un': un,
                    'processado': k in PROCESSAVEIS, 'meses': {}}

    for ym in lista:
        dias = sorted(d for d in lanc if d.startswith(ym))
        if not dias:
            continue
        ultimo = dias[-1]
        for k in dados:
            reg = {'cons': 0.0, 'ent': 0.0, 'est': 0.0, 'perda': 0.0,
                   'consRs': 0.0, 'entRs': 0.0, 'estRs': 0.0,
                   'preco': None, 'precoDoMes': True, 'casas': 0}
            precos = []
            for c in CASAS:
                pr, doMes = preco_de(mensais, dados[k]['chavePreco'], c, ym)
                if pr is None:
                    continue
                precos.append(pr)
                reg['casas'] += 1
                if not doMes:
                    reg['precoDoMes'] = False
                fator = EM_KG.get(k, 1.0)          # peixes -> quilos
                rend = rendimento_de(rends, k, c, ym)[0] if k in PROCESSAVEIS else None

                qc = qe = 0.0
                for d in dias:
                    lan = lanc[d].get(c)
                    if not isinstance(lan, dict):
                        continue
                    if lan.get('faturamento', 0) < piso.get(c, 0):
                        continue
                    ins = lan.get('insumos') or {}
                    if k in PROCESSAVEIS:
                        proc = ins.get(k) or {}
                        raw = ins.get(dados[k]['chavePreco']) or {}
                        if proc.get('uso'):
                            qc += proc['uso'] / rend        # consumo em in natura
                        if raw.get('entrada'):
                            qe += raw['entrada']            # compra-se o in natura
                        if proc.get('desperdicio'):
                            reg['perda'] += proc['desperdicio'] / rend * pr
                    else:
                        v = ins.get(k) or {}
                        if v.get('uso'):
                            qc += v['uso'] * fator
                        if v.get('entrada'):
                            qe += v['entrada'] * fator
                        if v.get('desperdicio'):
                            reg['perda'] += v['desperdicio'] * fator * pr

                fins = (lanc[ultimo].get(c) or {}).get('insumos') or {}
                if k in PROCESSAVEIS:
                    # as duas formas somam: materia-prima na geladeira mais
                    # o processado no balcao, tudo medido em in natura
                    qf = ((fins.get(k) or {}).get('final') or 0) / rend \
                         + ((fins.get(dados[k]['chavePreco']) or {}).get('final') or 0)
                else:
                    qf = ((fins.get(k) or {}).get('final') or 0) * fator

                reg['cons'] += qc; reg['ent'] += qe; reg['est'] += qf
                reg['consRs'] += qc * pr; reg['entRs'] += qe * pr; reg['estRs'] += qf * pr
            if precos:
                # preco medio ponderado pelo consumo de cada casa, nao media simples
                reg['preco'] = (reg['consRs'] / reg['cons']) if reg['cons'] > 0 \
                    else sum(precos) / len(precos)
            for campo in ('cons', 'ent', 'est', 'consRs', 'entRs', 'estRs', 'perda'):
                reg[campo] = round(reg[campo], 2)
            reg['preco'] = round(reg['preco'], 4) if reg['preco'] else None
            dados[k]['meses'][ym] = reg
    return dados


def analisar(dados, lista):
    """Decomposicao preco x volume, entre o primeiro e o ultimo mes da serie."""
    base, fim = lista[0], lista[-1]
    out = []
    for k, d in dados.items():
        a, b = d['meses'].get(base), d['meses'].get(fim)
        if not a or not b or not a['preco'] or not b['preco'] or a['cons'] <= 0:
            continue
        dPreco = b['preco'] - a['preco']
        dVol = b['cons'] - a['cons']
        efPreco = b['cons'] * dPreco          # o que o preco novo custou no volume novo
        efVol = a['preco'] * dVol             # o que o volume novo custou ao preco velho
        out.append({
            'chave': k, 'nome': d['nome'], 'un': d['un'],
            'precoDe': a['preco'], 'precoAte': b['preco'],
            'varPreco': dPreco / a['preco'],
            'consDe': a['cons'], 'consAte': b['cons'],
            'varCons': (dVol / a['cons']) if a['cons'] else 0,
            'gastoDe': a['consRs'], 'gastoAte': b['consRs'],
            'efPreco': round(efPreco, 2), 'efVol': round(efVol, 2),
            'ganhouNoPreco': dPreco < 0,
            'ganhoApesarDoVolume': dPreco < 0 and dVol > 0,
        })
    return sorted(out, key=lambda x: x['efPreco'])


def saltos(dados, lista, limite=0.10):
    """Altas de preco de um mes para o outro, acima do limite, em R$ de impacto."""
    out = []
    for k, d in dados.items():
        for i in range(1, len(lista)):
            a, b = d['meses'].get(lista[i - 1]), d['meses'].get(lista[i])
            if not a or not b or not a['preco'] or not b['preco'] or a['preco'] <= 0:
                continue
            v = b['preco'] / a['preco'] - 1
            if v >= limite:
                out.append({'chave': k, 'nome': d['nome'], 'un': d['un'],
                            'de': lista[i - 1], 'ate': lista[i],
                            'precoDe': a['preco'], 'precoAte': b['preco'], 'var': v,
                            'impacto': round(b['cons'] * (b['preco'] - a['preco']), 2)})
    return sorted(out, key=lambda x: -x['impacto'])


def main():
    ap = argparse.ArgumentParser(description='Relatório financeiro consolidado (CDE Web).')
    ap.add_argument('--de', default='2026-01')
    ap.add_argument('--ate', default='2026-08')
    ap.add_argument('--dados', default=os.path.normpath(os.path.join(AQUI, '..', 'dados')))
    ap.add_argument('--saida', default=os.path.join(AQUI, 'saida'))
    ap.add_argument('--modelo', default=os.path.join(AQUI, 'modelo_coef.html'))
    ap.add_argument('--piso', type=float, default=0.10)
    ap.add_argument('--no-pdf', action='store_true')
    args = ap.parse_args()

    lanc = json.load(open(os.path.join(args.dados, 'lancamentos.json'), encoding='utf-8'))
    xp = os.path.join(AQUI, 'custos_mensais.json')
    mensais = {k: v for k, v in (json.load(open(xp, encoding='utf-8')) if os.path.exists(xp) else {}).items()
               if not k.startswith('_')}
    if not mensais:
        sys.exit('ERRO: custos_mensais.json não encontrado — sem preço não há relatório financeiro.')

    lista = [m for m in meses_entre(args.de, args.ate) if any(d.startswith(m) for d in lanc)]
    piso = piso_faturamento(lanc, args.piso) if args.piso > 0 else {}
    rends = rendimentos(lanc)
    dados = coletar(lanc, mensais, lista, piso, rends)

    # faturamento da rede por mes, para o gasto virar % do faturamento
    fat = {}
    for ym in lista:
        s = 0.0
        for d in (x for x in lanc if x.startswith(ym)):
            for c in CASAS:
                lan = lanc[d].get(c)
                if isinstance(lan, dict) and lan.get('faturamento', 0) >= piso.get(c, 0):
                    s += lan.get('faturamento') or 0
        fat[ym] = round(s, 2)

    pacote = {
        'meses': [{'ym': m, 'rotulo': MES_ABR[int(m[5:7])], 'nome': MESES[int(m[5:7])],
                   'fat': fat[m],
                   'dias': len([d for d in lanc if d.startswith(m)])} for m in lista],
        'insumos': [dados[k] for k in dados],
        'analise': analisar(dados, lista),
        'saltos': saltos(dados, lista),
    }
    # Faixa de cobertura da propria Projecao de Compras, para o relatorio julgar
    # o estoque pelo parametro que a operacao usa, e nao por um numero inventado
    # aqui. dias_seguranca e o piso do estoque minimo; dias_a_cobrir_padrao e o
    # alvo do pedido.
    cp2 = os.path.join(args.dados, 'compras.json')
    comp = json.load(open(cp2, encoding='utf-8')) if os.path.exists(cp2) else {}
    cfg = {'de': MESES[int(lista[0][5:7])], 'ate': MESES[int(lista[-1][5:7])],
           'ano': lista[0][:4], 'casas': CASAS, 'nomesCasa': NOMES_CASA,
           'lista': lista,
           'diasAlvo': comp.get('dias_a_cobrir_padrao', 7),
           'diasPiso': comp.get('dias_seguranca', 3)}

    txt = open(args.modelo, encoding='utf-8').read()
    css = re.search(r'<style>(.*?)</style>', txt, re.S).group(1)
    corpo = open(os.path.join(AQUI, 'corpo_financeiro.html'), encoding='utf-8').read()
    html = (corpo.replace('{{CSS}}', css)
                 .replace('{{TITULO}}', 'Consolidado financeiro — %s a %s / %s'
                          % (cfg['de'], cfg['ate'], cfg['ano']))
                 .replace('{{DADOS}}', json.dumps(pacote, ensure_ascii=False))
                 .replace('{{CFG}}', json.dumps(cfg, ensure_ascii=False)))

    os.makedirs(args.saida, exist_ok=True)
    base = 'Consolidado_financeiro_%s_a_%s' % (lista[0], lista[-1])
    hp = os.path.join(args.saida, base + '.html')
    open(hp, 'w', encoding='utf-8').write(html)
    print('HTML :', hp)
    if not args.no_pdf:
        br = find_browser()
        if br:
            pp = os.path.join(args.saida, base + '.pdf')
            print('PDF  :', pp if render_pdf(br, hp, pp) else '(falhou)')

    tc = sum(sum(d['meses'][m]['consRs'] for m in d['meses']) for d in dados.values())
    te = sum(sum(d['meses'][m]['entRs'] for m in d['meses']) for d in dados.values())
    ganho = sum(a['efPreco'] for a in pacote['analise'] if a['efPreco'] < 0)
    perda = sum(a['efPreco'] for a in pacote['analise'] if a['efPreco'] > 0)
    print('Consumo no periodo : R$ %.2f' % tc)
    print('Compras no periodo : R$ %.2f' % te)
    print('Efeito preco       : ganho R$ %.2f | alta R$ %.2f | liquido R$ %+.2f'
          % (-ganho, perda, ganho + perda))


if __name__ == '__main__':
    main()
