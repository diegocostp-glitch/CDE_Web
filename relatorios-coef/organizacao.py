# -*- coding: utf-8 -*-
"""Onde cada relatório é gravado dentro de saida/.

A pasta é escolhida aqui, e não em cada gerador, para os três concordarem. Os
nomes das pastas de evolução são os que a operação escolheu — encurtados e em
português corrente, não a chave do insumo —, então moram numa tabela em vez de
sair de uma regra: "Peixe Branco" não se deduz de "file_tilapia".
"""
import os

MES_NOME = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
            7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro',
            12: 'Dezembro'}

PASTA_EVOLUCAO = {
    'salmao_equivalente': 'Evolução Salmão',
    'camarao_g': 'Evolução Camarão G',
    'camarao_m': 'Evolução Camarão M',
    'camarao_p': 'Evolução Camarão P',
    'cream_cheese': 'Evolução Cream Cheese',
    'arroz': 'Evolução Arroz para Sushi',
    'nori': 'Evolução Nori',
    'kani': 'Evolução Kani',
    'patinho': 'Evolução Patinho',
    'anchova': 'Evolução Anchova',
    'file_tilapia': 'Evolução Peixe Branco',
    'lula_equivalente': 'Evolução Lula em Anéis',
    'polvo_equivalente': 'Evolução Tentáculo de Polvo',
    'atum_equivalente': 'Evolução Atum',
}


def pasta_mensal(saida, ym):
    """saida/<n>. Relatório <Mês>/ — um mês por pasta, os insumos dentro.

    O numero na frente existe para a pasta ordenar por mes e nao por alfabeto:
    sem ele o explorador lista Abril, Agosto, Fevereiro, Janeiro, Julho...
    """
    m = int(ym[5:7])
    d = os.path.join(saida, '%d. Relatório %s' % (m, MES_NOME[m]))
    os.makedirs(d, exist_ok=True)
    return d


def pasta_evolucao(saida, insumo):
    """saida/0. Evolução/<nome da operação>/ — uma pasta por insumo.

    O zero na frente poe a evolucao acima dos meses numerados: ela cobre o
    periodo inteiro e e por onde a leitura comeca.
    """
    nome = PASTA_EVOLUCAO.get(insumo, 'Evolução %s' % insumo)
    d = os.path.join(saida, '0. Evolução', nome)
    os.makedirs(d, exist_ok=True)
    return d


def pasta_financeiro(saida):
    """saida/0. Evolução/Evolução Estoque - Compras/ — o consolidado de todos."""
    d = os.path.join(saida, '0. Evolução', 'Evolução Estoque - Compras')
    os.makedirs(d, exist_ok=True)
    return d
