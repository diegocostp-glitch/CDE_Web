# -*- coding: utf-8 -*-
"""Onde cada relatório é gravado, e com que nome.

Todos os relatórios prontos moram numa pasta só, `Relatórios/`, na raiz do
projeto — uma subpasta numerada por TIPO de relatório, para quem abre o
explorador saber o que é cada arquivo sem abri-lo:

    Relatórios/
      1. Consumo Mensal por Insumo/2026-08 Agosto/Consumo Agosto 2026 - Salmão.html
      2. Resumido Diretoria - Mensal/Resumido Diretoria - Consumo Agosto 2026.html
      3. Evolução por Insumo/Salmão/Evolução Salmão - Jan a Set 2026.html
      4. Painel de Evolução por Casa/Painel por Casa - Jan a Set 2026.html
      5. Financeiro - Compras e Estoque/Financeiro Compras e Estoque - Jan a Set 2026.html
      6. Estoque - Posição e Reposição/...
      7. Consumo e Reposição - Metas/...
      8. Rendimento do Processamento/Rendimento do Processamento - Jan a Set 2026.html
      9. Feriados e Eventos/Feriados e Eventos - Jan a Out 2026.html

A pasta e o nome são escolhidos aqui, e não em cada gerador, para os três
concordarem. O nome do insumo é o que a operação usa — "Peixe Branco", não
"file_tilapia" —, então mora numa tabela em vez de sair de uma regra.
"""
import os

RAIZ_RELATORIOS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                               '..', 'Relatórios'))

MES_NOME = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
            7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro',
            12: 'Dezembro'}
MES_CURTO = {1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun', 7: 'Jul',
             8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'}

# Uma pasta por tipo. O número na frente fixa a ordem no explorador.
TIPO = {
    'mensal':     '1. Consumo Mensal por Insumo',
    'diretoria':  '2. Resumido Diretoria - Mensal',
    'evolucao':   '3. Evolução por Insumo',
    'painel':     '4. Painel de Evolução por Casa',
    'financeiro': '5. Financeiro - Compras e Estoque',
    'estoque':    '6. Estoque - Posição e Reposição',
    'reposicao':  '7. Consumo e Reposição - Metas',
    'rendimento': '8. Rendimento do Processamento',
    'eventos':    '9. Feriados e Eventos',
}

NOME_INSUMO = {
    'salmao_equivalente': 'Salmão',
    'camarao_g': 'Camarão G',
    'camarao_m': 'Camarão M',
    'camarao_p': 'Camarão P',
    'cream_cheese': 'Cream Cheese',
    'arroz': 'Arroz para Sushi',
    'nori': 'Nori',
    'kani': 'Kani',
    'patinho': 'Patinho',
    'anchova': 'Anchova',
    'file_tilapia': 'Peixe Branco',
    'lula_equivalente': 'Lula em Anéis',
    'polvo_equivalente': 'Tentáculo de Polvo',
    'atum_equivalente': 'Atum',
}


def nome_insumo(insumo):
    return NOME_INSUMO.get(insumo, insumo.replace('_', ' ').title())


def periodo(de, ate):
    """'2026-01', '2026-09' -> 'Jan a Set 2026' (ou 'Dez 2025 a Fev 2026')."""
    a1, m1, a2, m2 = int(de[:4]), int(de[5:7]), int(ate[:4]), int(ate[5:7])
    if a1 == a2:
        return '%s a %s %d' % (MES_CURTO[m1], MES_CURTO[m2], a2)
    return '%s %d a %s %d' % (MES_CURTO[m1], a1, MES_CURTO[m2], a2)


def _pasta(*partes):
    d = os.path.join(*partes)
    os.makedirs(d, exist_ok=True)
    return d


def arquivo_mensal(saida, ym, insumo):
    """1. Consumo Mensal por Insumo/2026-08 Agosto/Consumo Agosto 2026 - Salmão

    A subpasta começa por AAAA-MM para ordenar por mês, não por alfabeto, e
    para janeiro de um ano não cair junto com janeiro do outro.
    """
    a, m = int(ym[:4]), int(ym[5:7])
    d = _pasta(saida, TIPO['mensal'], '%s %s' % (ym, MES_NOME[m]))
    return os.path.join(d, 'Consumo %s %d - %s' % (MES_NOME[m], a, nome_insumo(insumo)))


def arquivo_evolucao(saida, insumo, de, ate):
    """3. Evolução por Insumo/Salmão/Evolução Salmão - Jan a Set 2026"""
    nome = nome_insumo(insumo)
    d = _pasta(saida, TIPO['evolucao'], nome)
    return os.path.join(d, 'Evolução %s - %s' % (nome, periodo(de, ate)))


def arquivo_painel(saida, de, ate):
    """4. Painel de Evolução por Casa/Painel por Casa - Jan a Set 2026 —
    todos os insumos num arquivo só, com filtro de insumo e de casa."""
    d = _pasta(saida, TIPO['painel'])
    return os.path.join(d, 'Painel por Casa - %s' % periodo(de, ate))


def arquivo_financeiro(saida, de, ate):
    """5. Financeiro - Compras e Estoque/Financeiro Compras e Estoque - Jan a Set 2026"""
    d = _pasta(saida, TIPO['financeiro'])
    return os.path.join(d, 'Financeiro Compras e Estoque - %s' % periodo(de, ate))


def arquivo_rendimento(saida, de, ate):
    """8. Rendimento do Processamento/Rendimento do Processamento - Jan a Set 2026"""
    d = _pasta(saida, TIPO['rendimento'])
    return os.path.join(d, 'Rendimento do Processamento - %s' % periodo(de, ate))


def arquivo_eventos(saida, de, ate):
    """9. Feriados e Eventos/Feriados e Eventos - Jan a Out 2026"""
    d = _pasta(saida, TIPO['eventos'])
    return os.path.join(d, 'Feriados e Eventos - %s' % periodo(de, ate))
