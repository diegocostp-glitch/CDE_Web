# -*- coding: utf-8 -*-
"""Relatório de FERIADOS E EVENTOS — quanto o calendário mexe no consumo.

A Projeção de Compras pede pela média dos últimos 14 dias. Um feriado dentro da
janela puxa a média para baixo (ou para cima) e o pedido seguinte sai errado;
um feriado logo à frente pede compra maior do que a média sugere. Este
relatório mede, para cada dia de evento já vivido, quanto o faturamento e o
consumo de cada insumo se afastaram de um dia normal — e transforma isso nas
duas decisões que a Projeção aceita:

    tirar o dia da média      (Média/dia -> escolher os dias)
    aplicar um fator no item  (coluna Fator)

Dia normal = o mesmo dia da semana nas quatro semanas anteriores, sem evento e
acima do piso de faturamento. Domingo se compara com domingo: comparar o
feriado de segunda com a média da semana inteira misturaria o efeito do
feriado com o do dia da semana.

O calendário mora em dados/eventos.json, editável.

Uso:
    python gerar_eventos.py --de 2026-01 --ate 2026-10
"""
import argparse, json, os, re, sys, datetime, statistics

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from organizacao import RAIZ_RELATORIOS, arquivo_eventos            # noqa: E402
from gerar_relatorio_coef import (                                  # noqa: E402
    INSUMOS, CASAS, NOMES_CASA, MESES, piso_faturamento, find_browser, render_pdf)
from gerar_financeiro import meses_entre                            # noqa: E402

# Os insumos da Projeção de Compras mais o patinho. Lula e tentáculo entram na
# forma processada, que é a que a casa conta — para fator de consumo a forma
# não importa, a proporção é a mesma.
ITENS = ['salmao_equivalente', 'camarao_g', 'camarao_m', 'camarao_p', 'cream_cheese', 'arroz',
         'nori', 'kani', 'anchova', 'file_tilapia', 'lula', 'polvo', 'patinho']
NOME = {'lula': 'Anel de lula', 'polvo': 'Tentáculo de lula', 'salmao_equivalente': 'Salmão'}

SEMANAS_BASE = 4         # quantas semanas para trás formam o "dia normal"
MIN_BASE = 2             # com menos dias normais que isso, não há comparação
LIMIAR = 0.15            # política: ±15% é o que pede ajuste na compra
ATIPICO = 0.30           # dia sem evento fora ±30% do normal: pede cadastro
# Giro diário: item com consumo lançado em pelo menos 85% dos dias-casa. Os
# outros saem em lote (descongela ou processa a cada dois, três dias) e o
# consumo de UM dia mede o lote, não o evento — o camarão G deu fator 0,40 num
# dia e 3,20 no seguinte. O fator do evento sai só da cesta de giro diário.
REGULAR_MIN = 0.85
HORIZONTE = 75           # próximos eventos: quantos dias à frente do último lançamento
DOW = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']


def dia_de(iso):
    return datetime.date.fromisoformat(iso)


def main():
    ap = argparse.ArgumentParser(description='Relatório de feriados e eventos (CDE Web).')
    hoje = datetime.date.today()
    ap.add_argument('--de', default='%d-01' % hoje.year)
    ap.add_argument('--ate', default=None, help='último mês, AAAA-MM (padrão: último mês com dado)')
    ap.add_argument('--dados', default=os.path.normpath(os.path.join(AQUI, '..', 'dados')))
    ap.add_argument('--saida', default=RAIZ_RELATORIOS)
    ap.add_argument('--modelo', default=os.path.join(AQUI, 'modelo_coef.html'))
    ap.add_argument('--piso', type=float, default=0.10)
    ap.add_argument('--no-pdf', action='store_true')
    args = ap.parse_args()

    lanc = json.load(open(os.path.join(args.dados, 'lancamentos.json'), encoding='utf-8'))
    ep = os.path.join(args.dados, 'eventos.json')
    if not os.path.exists(ep):
        sys.exit('ERRO: dados/eventos.json não encontrado — sem calendário não há relatório.')
    calendario = json.load(open(ep, encoding='utf-8')).get('eventos') or []
    cp = os.path.join(args.dados, 'compras.json')
    janela = (json.load(open(cp, encoding='utf-8')) if os.path.exists(cp) else {}).get('janela_media_dias', 14)

    ate = args.ate or max(lanc)[:7]
    lista = [m for m in meses_entre(args.de, ate) if any(d.startswith(m) for d in lanc)]
    if not lista:
        sys.exit('ERRO: nenhum lançamento no período pedido.')
    ultimo = max(d for d in lanc if d[:7] <= lista[-1])
    piso = piso_faturamento(lanc, args.piso) if args.piso > 0 else {}

    # evento por (data, casa)
    ev_de = {}
    for e in calendario:
        for c in (e.get('casas') or CASAS):
            ev_de[(e['data'], c)] = e

    descartes = []          # guarda que descarta dado lista o que descartou

    def dia_valido(iso, c):
        """(faturamento, {insumo: uso}) do dia na casa, ou None."""
        lan = (lanc.get(iso) or {}).get(c)
        if not isinstance(lan, dict):
            return None
        fat = float(lan.get('faturamento') or 0)
        if fat <= 0:
            return None
        if fat < piso.get(c, 0):
            descartes.append({'data': iso, 'casa': c, 'motivo': 'faturamento abaixo do piso',
                              'valor': round(fat, 2)})
            return None
        usos = {}
        for k in ITENS:
            u = ((lan.get('insumos') or {}).get(k) or {}).get('uso')
            if u is None:
                continue
            u = float(u)
            if u < 0:
                descartes.append({'data': iso, 'casa': c, 'motivo': 'consumo negativo — %s' % nome(k),
                                  'valor': round(u, 3)})
                continue
            usos[k] = u
        return fat, usos

    cache = {}

    # regularidade de cada item no período: fração dos dias-casa com consumo
    conta = {k: [0, 0] for k in ITENS}
    for iso in lanc:
        if iso[:7] not in lista:
            continue
        for c in CASAS:
            lan = (lanc[iso] or {}).get(c)
            if not isinstance(lan, dict):
                continue
            for k in ITENS:
                u = ((lan.get('insumos') or {}).get(k) or {}).get('uso')
                if u is None or float(u) < 0:
                    continue
                conta[k][1] += 1
                conta[k][0] += 1 if float(u) > 0 else 0
    giro = {k: (a / b if b else 0.0) for k, (a, b) in conta.items()}
    regulares = [k for k in ITENS if giro[k] >= REGULAR_MIN]
    if not regulares:
        sys.exit('ERRO: nenhum insumo de giro diário no período — não há como medir o evento.')

    def valido(iso, c):
        if (iso, c) not in cache:
            cache[(iso, c)] = dia_valido(iso, c)
        return cache[(iso, c)]

    def base(iso, c):
        """Dias normais: mesmo dia da semana nas semanas anteriores, sem evento."""
        d = dia_de(iso)
        out = []
        for w in range(1, SEMANAS_BASE + 1):
            b = (d - datetime.timedelta(days=7 * w)).isoformat()
            if (b, c) in ev_de:
                continue
            v = valido(b, c)
            if v:
                out.append(v)
        return out if len(out) >= MIN_BASE else None

    def comparar(iso, casas):
        """Evento x normal, por casa e na rede (só casas com os dois lados)."""
        por_casa, rede = {}, {'fat': [0.0, 0.0], 'ins': {k: [0.0, 0.0] for k in ITENS}}
        for c in casas:
            v, b = valido(iso, c), base(iso, c)
            if not v or not b:
                continue
            fat_b = statistics.mean(x[0] for x in b)
            pc = {'fat': v[0], 'fatBase': round(fat_b, 2), 'varFat': v[0] / fat_b - 1, 'ins': {}}
            rede['fat'][0] += v[0]; rede['fat'][1] += fat_b
            for k in ITENS:
                bs = [x[1][k] for x in b if k in x[1]]
                if k not in v[1] or len(bs) < MIN_BASE:
                    continue
                ub = statistics.mean(bs)
                if ub <= 0:
                    continue
                pc['ins'][k] = round(v[1][k] / ub, 3)
                rede['ins'][k][0] += v[1][k]; rede['ins'][k][1] += ub
            por_casa[c] = pc
        if not por_casa:
            return None
        fatores = {k: round(a / b, 3) for k, (a, b) in rede['ins'].items() if b > 0}
        cesta = [f for k, f in fatores.items() if k in regulares]
        return {'casas': por_casa, 'nCasas': len(por_casa),
                'varFat': rede['fat'][0] / rede['fat'][1] - 1,
                'fatores': fatores,
                'consumo': statistics.median(cesta) if cesta else None}

    # ---------------------------------------------------------- eventos vividos
    eventos = []
    for e in sorted(calendario, key=lambda x: x['data']):
        if not (lista[0] <= e['data'][:7] <= lista[-1]) or e['data'] > ultimo:
            continue
        r = comparar(e['data'], e.get('casas') or CASAS)
        item = dict(e, dow=DOW[dia_de(e['data']).weekday()])
        if r:
            item.update(r)
        else:
            item['semDado'] = True
        eventos.append(item)

    # ---------------------------------------------------------- dias atípicos
    atipicos = []
    for iso in sorted(lanc):
        if iso[:7] not in lista or any((iso, c) in ev_de for c in CASAS):
            continue
        r = comparar(iso, CASAS)
        if r and r['nCasas'] >= 3 and abs(r['varFat']) >= ATIPICO:
            atipicos.append({'data': iso, 'dow': DOW[dia_de(iso).weekday()],
                             'varFat': r['varFat'], 'consumo': r['consumo'], 'nCasas': r['nCasas']})
    atipicos.sort(key=lambda x: -abs(x['varFat']))

    # ---------------------------------------------------------- próximos
    fim = (dia_de(ultimo) + datetime.timedelta(days=HORIZONTE)).isoformat()
    vividos = [e for e in eventos if not e.get('semDado')]
    por_tipo = {}
    for e in vividos:
        por_tipo.setdefault(e['tipo'], []).append(e)
    proximos = []
    for e in sorted(calendario, key=lambda x: x['data']):
        if not (ultimo < e['data'] <= fim):
            continue
        ref = por_tipo.get(e['tipo']) or []
        fat_ref = statistics.mean(x['varFat'] for x in ref) if ref else None
        cons_ref = statistics.mean(x['consumo'] for x in ref if x.get('consumo')) if ref else None
        proximos.append(dict(e, dow=DOW[dia_de(e['data']).weekday()],
                             diasAte=(dia_de(e['data']) - dia_de(ultimo)).days,
                             nRef=len(ref), varFatRef=fat_ref, consumoRef=cons_ref))

    # ---------------------------------------------------------- a janela de hoje
    # Os dias com evento que estão DENTRO da janela da média da Projeção agora,
    # e quanto a média de cada insumo muda sem eles.
    ini = (dia_de(ultimo) - datetime.timedelta(days=janela - 1)).isoformat()
    na_janela = sorted({e['data'] for e in calendario if ini <= e['data'] <= ultimo})
    janela_ins = []
    if na_janela:
        for k in ITENS:
            com, sem = [], []
            for iso in sorted(lanc):
                if not (ini <= iso <= ultimo):
                    continue
                tot = 0.0; ok = False
                for c in CASAS:
                    v = valido(iso, c)
                    if v and k in v[1]:
                        tot += v[1][k]; ok = True
                if not ok:
                    continue
                com.append(tot)
                if iso not in na_janela:
                    sem.append(tot)
            if com and sem:
                janela_ins.append({'item': k, 'com': statistics.mean(com), 'sem': statistics.mean(sem),
                                   'var': statistics.mean(com) / statistics.mean(sem) - 1})

    vistos, unicos = set(), []
    for d in descartes:
        chave = (d['data'], d['casa'], d['motivo'])
        if chave not in vistos and lista[0] <= d['data'][:7] <= lista[-1]:
            vistos.add(chave); unicos.append(d)

    pacote = {'eventos': eventos, 'atipicos': atipicos[:20], 'nAtipicos': len(atipicos),
              'proximos': proximos, 'janela': {'de': ini, 'ate': ultimo, 'dias': janela,
                                               'eventos': na_janela, 'itens': janela_ins},
              'descartes': sorted(unicos, key=lambda x: x['data']),
              'nomes': {k: nome(k) for k in ITENS},
              'regulares': regulares, 'giro': {k: round(v, 3) for k, v in giro.items()},
              'unidades': {k: INSUMOS.get(k, {}).get('unidade', '') for k in ITENS}}
    cfg = {'de': MESES[int(lista[0][5:7])], 'ate': MESES[int(lista[-1][5:7])], 'ano': lista[0][:4],
           'casas': CASAS, 'nomesCasa': NOMES_CASA, 'ultimoDia': ultimo,
           'semanas': SEMANAS_BASE, 'regularMin': REGULAR_MIN, 'minBase': MIN_BASE, 'limiar': LIMIAR, 'atipico': ATIPICO,
           'horizonte': HORIZONTE, 'gerado': datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}

    css = re.search(r'<style>(.*?)</style>', open(args.modelo, encoding='utf-8').read(), re.S).group(1)
    corpo = open(os.path.join(AQUI, 'corpo_eventos.html'), encoding='utf-8').read()
    html = (corpo.replace('{{CSS}}', css)
                 .replace('{{TITULO}}', 'Feriados e eventos — %s a %s / %s'
                          % (cfg['de'], cfg['ate'], cfg['ano']))
                 .replace('{{DADOS}}', json.dumps(pacote, ensure_ascii=False))
                 .replace('{{CFG}}', json.dumps(cfg, ensure_ascii=False)))
    base_arq = arquivo_eventos(args.saida, lista[0], lista[-1])
    hp = base_arq + '.html'
    open(hp, 'w', encoding='utf-8').write(html)
    print('HTML :', hp)
    if not args.no_pdf:
        br = find_browser()
        if br:
            pp = base_arq + '.pdf'
            print('PDF  :', pp if render_pdf(br, hp, pp) else '(falhou)')
        else:
            print('AVISO: Chrome/Edge não encontrado — PDF não gerado.')
    for e in eventos:
        if not e.get('semDado'):
            print('%s %-32s faturamento %+5.1f%%  consumo %s' % (
                e['data'], e['nome'], e['varFat'] * 100,
                '%+5.1f%%' % ((e['consumo'] - 1) * 100) if e.get('consumo') else '—'))
    print('dias atípicos sem evento:', len(atipicos), '· próximos:', len(proximos))


def nome(k):
    return NOME.get(k) or INSUMOS.get(k, {}).get('nome', k)


if __name__ == '__main__':
    main()
