# -*- coding: utf-8 -*-
"""Relatório de EVOLUÇÃO do grupo — vários meses lado a lado.

O relatório mensal responde "como foi este mês contra o anterior". Este responde
outra pergunta: "para onde a rede está andando". Mesma metodologia, mesma
identidade visual (o CSS é lido do modelo_coef.html, para não existirem dois
desenhos divergindo com o tempo), eixo diferente — meses no lugar de casas.

Os dois arquivos trazem filtro de CASA: o mesmo relatorio se refaz para uma
casa so, com as outras ao fundo para comparacao. Com --insumo todos sai o
PAINEL do periodo — todos os insumos num HTML so, com filtro de insumo e casa.

Uso:
    python gerar_evolucao.py --de 2026-01 --ate 2026-08 --insumo salmao_equivalente
    python gerar_evolucao.py --de 2026-01 --ate 2026-09 --insumo todos
"""
import argparse, json, os, re, sys, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from organizacao import RAIZ_RELATORIOS   # noqa: E402
from gerar_relatorio_coef import (        # noqa: E402
    INSUMOS, CASAS, NOMES_CASA, MESES, MES_ABR, EM_KG, EQUIVALENTES, PROCESSAVEIS,
    cfg_insumo, piso_faturamento, rendimentos, rendimento_de, series, totals,
    custo_casa, find_browser, render_pdf)


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


def montar(lanc, metas, custos, mensais, insumo, lista, piso, rends):
    metas_ins = (metas.get(insumo) or {})
    origem = EQUIVALENTES.get(insumo)
    fator_kg = EM_KG.get(insumo)
    dados = {'meses': [], 'casas': {c: [] for c in CASAS}, 'rend': {}}
    for ym in lista:
        linha = {'ym': ym, 'rotulo': MES_ABR[int(ym[5:7])], 'nome': MESES[int(ym[5:7])],
                 'cons': 0.0, 'fat': 0.0, 'rs': 0.0, 'temCusto': False, 'dias': 0,
                 'porcasa': {}}
        for c in CASAS:
            rend = None
            if origem:
                rend, fonte = rendimento_de(rends, origem, c, ym)
                dados['rend'].setdefault(ym, {})[c] = round(rend, 4)
            s = series(lanc, ym, c, insumo, piso, None, None, rend)
            u, f, co = totals(s)
            if not s:
                linha['porcasa'][c] = None
                dados['casas'][c].append(None)
                continue
            custo, fonte_custo = custo_casa(custos, insumo, c, mensais, ym)
            meta = metas_ins.get(c)
            if meta is not None and fator_kg:
                meta = round(meta * fator_kg, 4)
            reg = {'cons': round(u, 1), 'fat': round(f, 2), 'coef': round(co, 4),
                   'meta': meta, 'dias': len(s),
                   'custo': custo, 'custoFonte': fonte_custo,
                   'rs': round(u * custo, 2) if custo else None,
                   'cmv': round(u * custo / f * 100, 3) if (custo and f) else None}
            linha['porcasa'][c] = reg
            dados['casas'][c].append(reg)
            linha['cons'] += u; linha['fat'] += f
            linha['dias'] = max(linha['dias'], len(s))
            if custo:
                linha['rs'] += u * custo; linha['temCusto'] = True
                # preco que nao e do proprio mes nao pode aparecer como se fosse:
                # o salmao subiu 23% de junho a agosto, e herdar o preco de junho
                # subestimaria o gasto de agosto em quase um quinto
                if fonte_custo != 'do mês':
                    linha.setdefault('custoHerdado', set()).add(fonte_custo)
        linha['coef'] = round(linha['cons'] / linha['fat'] * 1000, 4) if linha['fat'] else 0
        linha['cons'] = round(linha['cons'], 1)
        linha['fat'] = round(linha['fat'], 2)
        linha['cmv'] = round(linha['rs'] / linha['fat'] * 100, 3) if (linha['temCusto'] and linha['fat']) else None
        linha['rs'] = round(linha['rs'], 2) if linha['temCusto'] else None
        herd = linha.pop('custoHerdado', None)
        linha['custoHerdado'] = sorted(herd) if herd else None
        dados['meses'].append(linha)
    return dados


def pacote(lanc, metas, custos, mensais, insumo, lista, piso, rends):
    """{'D': dados, 'C': cfg} de um insumo, ou None se nao houve consumo."""
    ins = cfg_insumo(insumo)
    dados = montar(lanc, metas, custos, mensais, insumo, lista, piso, rends)
    # Mes de consumo ZERO fica de fora da serie. Ele existe no arquivo (o dia e
    # lancado com uso 0), mas coeficiente zero nao e eficiencia — e o item fora
    # do cardapio. Mantido, o atum aparecia "melhorando 100%" ao parar de ser
    # usado, que e a leitura oposta da verdadeira.
    sem_consumo = [m['ym'] for m in dados['meses'] if m['fat'] > 0 and m['cons'] <= 0]
    fica = [i for i, m in enumerate(dados['meses']) if m['fat'] > 0 and m['cons'] > 0]
    dados['meses'] = [dados['meses'][i] for i in fica]
    # as series das casas andam junto com as do grupo: o grafico e o filtro de
    # casa leem a posicao i de uma como o mesmo mes da outra
    dados['casas'] = {c: [v[i] for i in fica] for c, v in dados['casas'].items()}
    if not dados['meses']:
        return None
    cfg = {
        'insumoNome': ins['nome'], 'unidade': ins['unidade'],
        'de': dados['meses'][0]['nome'], 'ate': dados['meses'][-1]['nome'],
        'ano': lista[0][:4], 'chave': insumo,
        'casas': CASAS, 'nomesCasa': NOMES_CASA,
        'semCusto': [m['ym'] for m in dados['meses'] if not m['temCusto']],
        'custoHerdado': [m['ym'] for m in dados['meses'] if m.get('custoHerdado')],
        'semConsumo': sem_consumo,
    }
    return {'D': dados, 'C': cfg}


def html_de(pacotes, titulo, modelo):
    corpo = open(os.path.join(AQUI, 'corpo_evolucao.html'), encoding='utf-8').read()
    return (corpo.replace('{{CSS}}', css_do_modelo(modelo))
                 .replace('{{TITULO}}', titulo)
                 .replace('{{PACOTE}}', json.dumps(pacotes, ensure_ascii=False)))


def css_do_modelo(caminho):
    """O desenho mora no modelo mensal; aqui só se lê. Dois arquivos de estilo
    divergiriam no primeiro ajuste que alguém fizesse em um só."""
    txt = open(caminho, encoding='utf-8').read()
    m = re.search(r'<style>(.*?)</style>', txt, re.S)
    return m.group(1) if m else ''


def main():
    ap = argparse.ArgumentParser(description='Relatório de evolução do grupo (CDE Web).')
    ap.add_argument('--de', required=True, help='primeiro mês, AAAA-MM')
    ap.add_argument('--ate', required=True, help='último mês, AAAA-MM')
    ap.add_argument('--insumo', default='salmao_equivalente',
                    help='chave do insumo, ou "todos" para o painel do periodo')
    ap.add_argument('--dados', default=os.path.normpath(os.path.join(AQUI, '..', 'dados')))
    ap.add_argument('--saida', default=RAIZ_RELATORIOS)
    ap.add_argument('--modelo', default=os.path.join(AQUI, 'modelo_coef.html'))
    ap.add_argument('--piso', type=float, default=0.10)
    ap.add_argument('--no-pdf', action='store_true')
    args = ap.parse_args()

    lanc = json.load(open(os.path.join(args.dados, 'lancamentos.json'), encoding='utf-8'))
    mp = os.path.join(args.dados, 'metas.json')
    metas = {k: v for k, v in (json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}).items()
             if not k.startswith('_')}
    cp = os.path.join(args.dados, 'custos.json')
    custos = {k: v for k, v in (json.load(open(cp, encoding='utf-8')) if os.path.exists(cp) else {}).items()
              if not k.startswith('_')}
    xp = os.path.join(AQUI, 'custos_mensais.json')
    mensais = {k: v for k, v in (json.load(open(xp, encoding='utf-8')) if os.path.exists(xp) else {}).items()
               if not k.startswith('_')}

    lista = meses_entre(args.de, args.ate)
    piso = piso_faturamento(lanc, args.piso) if args.piso > 0 else {}
    rends = rendimentos(lanc)
    from organizacao import arquivo_evolucao, NOME_INSUMO, arquivo_painel, MES_NOME
    if args.insumo == 'todos':
        # painel do periodo: um HTML com todos os insumos, filtro de insumo e
        # de casa. Sem PDF — papel nao tem filtro; o PDF de cada insumo sai
        # rodando este script com o insumo.
        pacotes = {}
        for chave in NOME_INSUMO:
            pk = pacote(lanc, metas, custos, mensais, chave, lista, piso, rends)
            if pk:
                pacotes[chave] = pk
            else:
                print('Sem consumo no período, fora do painel:', chave)
        if not pacotes:
            sys.exit('ERRO: nenhum insumo com consumo no período pedido.')
        titulo = 'Evolução por casa — %s a %s / %s' % (
            MES_NOME[int(lista[0][5:7])], MES_NOME[int(lista[-1][5:7])], args.de[:4])
        hp = arquivo_painel(args.saida, args.de, args.ate) + '.html'
        open(hp, 'w', encoding='utf-8').write(html_de(pacotes, titulo, args.modelo))
        print('HTML :', hp, '(%d insumos)' % len(pacotes))
        return

    pk = pacote(lanc, metas, custos, mensais, args.insumo, lista, piso, rends)
    if not pk:
        sys.exit('ERRO: nenhum mês com consumo no período pedido.')
    dados, cfg = pk['D'], pk['C']
    sem_consumo = cfg['semConsumo']
    html = html_de({args.insumo: pk}, 'Evolução do grupo — %s — %s a %s / %s'
                   % (cfg['insumoNome'], cfg['de'], cfg['ate'], cfg['ano']), args.modelo)

    base = arquivo_evolucao(args.saida, args.insumo, args.de, args.ate)
    hp = base + '.html'
    open(hp, 'w', encoding='utf-8').write(html)
    print('HTML :', hp)
    if not args.no_pdf:
        br = find_browser()
        if br:
            pp = base + '.pdf'
            print('PDF  :', pp if render_pdf(br, hp, pp) else '(falhou)')
        else:
            print('AVISO: Chrome/Edge não encontrado — PDF não gerado.')

    m0, m1 = dados['meses'][0], dados['meses'][-1]
    print('Resumo %s: coeficiente de %.4f (%s) para %.4f (%s), %+.1f%% no período.'
          % (args.insumo, m0['coef'], m0['rotulo'], m1['coef'], m1['rotulo'],
             (m1['coef'] / m0['coef'] - 1) * 100))
    if cfg['semCusto']:
        print('Sem custo cadastrado em:', ', '.join(cfg['semCusto']),
              '— a leitura em reais fica de fora nesses meses.')
    if sem_consumo:
        print('Meses sem consumo, fora da série:', ', '.join(sem_consumo),
              '— o insumo deixou de ser usado; coeficiente zero não é desempenho.')
    if cfg['custoHerdado']:
        print('AVISO: preço herdado de outro mês em:', ', '.join(cfg['custoHerdado']),
              '— o gasto desses meses é estimativa, não custo do mês.')


if __name__ == '__main__':
    main()
