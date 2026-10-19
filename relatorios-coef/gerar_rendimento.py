# -*- coding: utf-8 -*-
"""Relatório de RENDIMENTO DO PROCESSAMENTO — lula, tentáculo e atum.

A casa compra in natura e vende processado. Cada ponto de rendimento perdido no
processamento é in natura comprado a mais para pôr a mesma quantidade no balcão
— um custo que não aparece em nenhuma nota fiscal e que o coeficiente esconde,
porque o consumo em in natura sobe junto.

O relatório responde três perguntas, cada uma com a sua decisão:

    quem processa abaixo da faixa?        -> treinar ou cobrar a casa
    a queda é de uma casa ou da rede?     -> casa = operação; rede = lote/fornecedor
    quanto isso custou em reais?          -> prioridade da cobrança

    custo do rendimento = (in natura − processado ÷ rendimento padrão) × preço do in natura

Positivo: a casa gastou mais in natura do que o padrão pedia. Negativo: rendeu
acima do padrão.

Uso:
    python gerar_rendimento.py --de 2026-01 --ate 2026-09
"""
import argparse, json, os, re, sys, datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
sys.path.insert(1, os.path.dirname(AQUI))
from organizacao import RAIZ_RELATORIOS, arquivo_rendimento   # noqa: E402
from gerar_relatorio_coef import (                              # noqa: E402
    CASAS, NOMES_CASA, MESES, MES_ABR, find_browser, render_pdf)
from gerar_financeiro import meses_entre, preco_de              # noqa: E402
import server                                                   # noqa: E402

# A faixa de rendimento mora no server.py (PROCESSAVEIS), que é de onde a tela
# de lançamento e a Projeção de Compras leem. Aqui só se importa.
ITENS = {p['chave']: p for p in server.PROCESSAVEIS}

# Política de leitura, escrita no relatório para poder ser discutida:
#  - fora da faixa: abaixo do mínimo ou acima do máximo da planilha. Entra na
#    média, porque aconteceu.
#  - implausível: acima de 100%, ou mais de 50% além da faixa. Não existe
#    processamento que renda mais peso do que entrou; é digitação. Fica FORA
#    das médias e do custo, e aparece listado com o valor lançado, que é por
#    onde se acha o erro na origem.
IMPLAUSIVEL_ACIMA = 1.5
IMPLAUSIVEL_ABAIXO = 0.5


def status(rend, p):
    if rend > 1 or rend > p['padrao_max'] * IMPLAUSIVEL_ACIMA or rend < p['padrao_min'] * IMPLAUSIVEL_ABAIXO:
        return 'implausivel'
    if rend < p['padrao_min']:
        return 'abaixo'
    if rend > p['padrao_max']:
        return 'acima'
    return 'dentro'


def coletar(lanc, mensais, lista):
    regs = []
    for iso in sorted(lanc):
        if iso[:7] not in lista:
            continue
        for ck, lan in lanc[iso].items():
            if ck not in CASAS or not isinstance(lan, dict):
                continue
            for k, pr in (lan.get('processamento') or {}).items():
                p = ITENS.get(k)
                ent, sai = pr.get('in_natura'), pr.get('processado')
                if not p or not ent or sai is None or float(ent) <= 0:
                    continue
                ent, sai = float(ent), float(sai)
                rend = sai / ent
                preco, do_mes = preco_de(mensais, p['in_natura'], ck, iso[:7])
                st = status(rend, p)
                # in natura que o padrão pediria para render o mesmo processado
                extra = ent - sai / p['rendimento_padrao']
                regs.append({
                    'data': iso, 'ym': iso[:7], 'casa': ck, 'item': k,
                    'inNatura': round(ent, 3), 'processado': round(sai, 3),
                    'rend': round(rend, 4), 'status': st,
                    'extraKg': round(extra, 3),
                    'preco': round(preco, 2) if preco else None, 'precoDoMes': do_mes,
                    'custo': round(extra * preco, 2) if preco and st != 'implausivel' else None,
                })
    return regs


def agregar(regs, chaves):
    """Rendimento PONDERADO (soma do processado ÷ soma do in natura): um
    processamento de 2 kg não pesa igual a um de 20 kg."""
    acc = {}
    for r in regs:
        if r['status'] == 'implausivel':
            continue
        k = tuple(r[c] for c in chaves)
        a = acc.setdefault(k, {'ent': 0.0, 'sai': 0.0, 'n': 0, 'custo': 0.0, 'semPreco': 0,
                               'abaixo': 0, 'acima': 0})
        a['ent'] += r['inNatura']; a['sai'] += r['processado']; a['n'] += 1
        if r['custo'] is None:
            a['semPreco'] += 1
        else:
            a['custo'] += r['custo']
        if r['status'] in ('abaixo', 'acima'):
            a[r['status']] += 1
    out = []
    for k, a in acc.items():
        d = dict(zip(chaves, k))
        d.update({'inNatura': round(a['ent'], 2), 'processado': round(a['sai'], 2),
                  'rend': round(a['sai'] / a['ent'], 4) if a['ent'] else None,
                  'n': a['n'], 'custo': round(a['custo'], 2), 'semPreco': a['semPreco'],
                  'abaixo': a['abaixo'], 'acima': a['acima']})
        out.append(d)
    return out


def main():
    ap = argparse.ArgumentParser(description='Relatório de rendimento do processamento (CDE Web).')
    hoje = datetime.date.today()
    ap.add_argument('--de', default='%d-01' % hoje.year)
    ap.add_argument('--ate', default=None, help='último mês, AAAA-MM (padrão: último mês com dado)')
    ap.add_argument('--dados', default=os.path.normpath(os.path.join(AQUI, '..', 'dados')))
    ap.add_argument('--saida', default=RAIZ_RELATORIOS)
    ap.add_argument('--modelo', default=os.path.join(AQUI, 'modelo_coef.html'))
    ap.add_argument('--no-pdf', action='store_true')
    args = ap.parse_args()

    lanc = json.load(open(os.path.join(args.dados, 'lancamentos.json'), encoding='utf-8'))
    xp = os.path.join(AQUI, 'custos_mensais.json')
    mensais = {k: v for k, v in (json.load(open(xp, encoding='utf-8')) if os.path.exists(xp) else {}).items()
               if not k.startswith('_')}
    ate = args.ate or max(lanc)[:7]
    lista = [m for m in meses_entre(args.de, ate) if any(d.startswith(m) for d in lanc)]
    if not lista:
        sys.exit('ERRO: nenhum lançamento no período pedido.')
    regs = coletar(lanc, mensais, lista)
    if not regs:
        sys.exit('ERRO: nenhum processamento lançado no período pedido.')

    # O rendimento que a Projeção de Compras usa HOJE é o do último
    # processamento lançado — um número só. Mostrar ao lado do ponderado do
    # período diz se o pedido de amanhã está saindo de um dia fora da curva.
    ultimo_dia = max(lanc)
    projecao = []
    for k in ITENS:
        for c in CASAS:
            rend, de = server.rendimento_atual(lanc, k, c, ultimo_dia)
            projecao.append({'item': k, 'casa': c, 'rend': rend, 'de': de})

    pacote = {
        'itens': {k: {'nome': p['nome'], 'padrao': p['rendimento_padrao'],
                      'min': p['padrao_min'], 'max': p['padrao_max'],
                      'chavePreco': p['in_natura']} for k, p in ITENS.items()},
        'meses': [{'ym': m, 'rotulo': MES_ABR[int(m[5:7])], 'nome': MESES[int(m[5:7])]} for m in lista],
        'registros': regs,
        'porItem': agregar(regs, ('item',)),
        'porCasa': agregar(regs, ('item', 'casa')),
        'porMes': agregar(regs, ('item', 'ym')),
        'porCasaMes': agregar(regs, ('item', 'casa', 'ym')),
        'projecao': projecao,
    }
    cfg = {'de': MESES[int(lista[0][5:7])], 'ate': MESES[int(lista[-1][5:7])], 'ano': lista[0][:4],
           'casas': CASAS, 'nomesCasa': NOMES_CASA, 'ultimoDia': ultimo_dia,
           'implAcima': IMPLAUSIVEL_ACIMA, 'implAbaixo': IMPLAUSIVEL_ABAIXO,
           'gerado': datetime.datetime.now().strftime('%d/%m/%Y %H:%M')}

    css = re.search(r'<style>(.*?)</style>', open(args.modelo, encoding='utf-8').read(), re.S).group(1)
    corpo = open(os.path.join(AQUI, 'corpo_rendimento.html'), encoding='utf-8').read()
    html = (corpo.replace('{{CSS}}', css)
                 .replace('{{TITULO}}', 'Rendimento do processamento — %s a %s / %s'
                          % (cfg['de'], cfg['ate'], cfg['ano']))
                 .replace('{{DADOS}}', json.dumps(pacote, ensure_ascii=False))
                 .replace('{{CFG}}', json.dumps(cfg, ensure_ascii=False)))

    base = arquivo_rendimento(args.saida, lista[0], lista[-1])
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

    for a in sorted(pacote['porItem'], key=lambda x: x['item']):
        print('%-6s rend %.1f%% (padrão %.0f%%) em %d processamentos, custo R$ %.2f'
              % (a['item'], a['rend'] * 100, ITENS[a['item']]['rendimento_padrao'] * 100,
                 a['n'], a['custo']))


if __name__ == '__main__':
    main()
