# -*- coding: utf-8 -*-
"""
Recalcula dados/metas.json a partir do historico inteiro de lancamentos.

Por que existe: a primeira rodada de metas saiu do relatorio de consumo de um
mes so (junho/2026). Um mes isolado carrega o acaso daquele mes — feriado,
promocao, um dia de contagem errada — e vira meta impossivel ou frouxa demais.
Com oito meses de historico da para separar patamar de ruido.

Como a meta e formada, por (insumo, casa), em coeficiente (consumo por R$ 1.000).
Tres estimadores do patamar, cada um com um vies conhecido:

    m1  coeficiente do mes anterior completo   -> o mais atual, o mais instavel
    m3  media dos 3 meses completos recentes   -> alisa o mes atipico
    m6  mediana dos 6 meses completos recentes -> ancora, ignora o mes extremo

    meta = menor entre m1 e mediana(m1, m3, m6)

A mediana dos tres descarta justamente o estimador que discordou dos outros:
se o mes passado disparou, m1 fica de fora; se o semestre inteiro mudou de
patamar, quem sai e o m6.

Sobre o --backtest, e uma armadilha: ele mede abs(real - meta) / META, ou seja,
divide pelo alvo. Isso pune por construcao todo criterio que escolhe o menor
estimador — quanto mais apertada a meta, maior o desvio relativo, mesmo que a
meta esteja perfeita para o que ela e. Nele o min(m1, mediana) aparece como o
pior dos seis e a mediana de 6 meses como a melhor. Serve para comparar
PREVISAO, nao meta.

Medido do jeito que importa para meta — quantas series ficaram DENTRO do alvo
no mes seguinte, sobre o historico corrigido de 2026 —, o erro mediano dos seis
criterios fica todo entre 10% e 13% e o que muda e a exigencia:

    mediana 6 meses (m6)      meta atingida em 77% / 65% / 46% (jul, ago, set)
    mediana(m1, m3, m6)       76% / 61% / 43%
    min(m1, mediana)          57% / 46% / 35%   <- o daqui
    menor dos tres            50% / 41% / 33%

Ou seja: a escolha do criterio nao e precisao, e politica. O min(m1, mediana)
entrega uma meta que a casa bate perto de metade das vezes. Se a diretoria
quiser alvo mais confortavel, o caminho e o m6; mais duro, o menor dos tres.

O "menor entre m1 e a mediana" existe porque isto e meta, nao previsao: se o
mes passado foi melhor que o patamar historico, o ganho vira o novo alvo em
vez de ser devolvido como folga; se foi pior, a mediana segura a meta no lugar
e o mes ruim nao vira desculpa. Custa cerca de dois pontos de precisao contra
a mediana pura — troca aceitavel para uma meta que nunca afrouxa sozinha.

O mes corrente fica fora do calculo — mes pela metade tem menos dias e
distorce — mas entra no relatorio como conferencia: e a primeira leitura de
quanto cada casa esta longe da meta nova.

Regras de guarda:
  - mes com consumo zero nao entra nos estimadores. Zero quase nunca e
    desempenho: e item que faltou, nao foi lancado ou saiu do cardapio, e
    puxaria a meta para um patamar que ninguem consegue repetir;
  - insumo sem consumo no ultimo mes completo fica SEM meta (dict vazio) — o
    caso do atum, que parou de ser lancado. Meta sobre consumo que nao existe
    mais so enche o painel de alarme sem acao possivel;
  - meta nunca abaixo do melhor mes ja realizado. Meta que nunca foi atingida
    um dia sequer nao e meta, e reclamacao.

Uso:  python recalcular_metas.py             mostra o relatorio e grava
      python recalcular_metas.py --simular   so mostra, nao grava
      python recalcular_metas.py --backtest  compara os criterios no historico
"""
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).parent
ARQ_LANC = RAIZ / "dados" / "lancamentos.json"
ARQ_METAS = RAIZ / "dados" / "metas.json"

CASAS = ["SL", "DC", "DLU", "DLCN"]

# ordem de exibicao e nome de tela; a mesma lista do servidor, so o que o
# painel acompanha (o que e "so_lancamento" nao vira serie).
INSUMOS = [
    ("salmao_equivalente", "Salmao (equiv. 08/10)"),
    ("camarao_g", "Camarao G"), ("camarao_m", "Camarao M"), ("camarao_p", "Camarao P"),
    ("atum", "Atum"), ("file_tilapia", "File de tilapia"), ("polvo", "Polvo"),
    ("lula", "Lula"), ("anchova", "Anchova"), ("kani", "Kani"), ("nori", "Nori"),
    ("cream_cheese", "Cream cheese"), ("arroz", "Arroz de sushi"), ("patinho", "Patinho"),
]


def mediana(v):
    s = sorted(v)
    n = len(s)
    if not n:
        return 0.0
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def coeficientes_por_mes():
    """{(insumo, casa): {mes: coeficiente}} — media dos coeficientes DIARIOS do mes.

    Media dos dias, e nao consumo do mes dividido por faturamento do mes, por um
    motivo pratico: e a media diaria que o Painel de Consumo compara com a meta.
    Meta calculada na outra base viraria alarme permanente nos itens contados de
    vez em quando — o patinho e contado uma vez por semana, entao o dia do
    lancamento carrega o consumo de sete dias contra o faturamento de um so, e
    o coeficiente daquele dia fica sete vezes maior que o do mes.

    Nos itens contados todo dia as duas bases praticamente coincidem (a razao
    mediana entre elas foi 1,007 em julho/2026); a diferenca so aparece — e so
    importa — justamente onde a comparacao do painel precisa dela.
    """
    with open(ARQ_LANC, encoding="utf-8") as f:
        dados = json.load(f)

    # Piso de faturamento por casa: 10% da mediana dela no historico.
    #
    # Existe por um dia real: 16/08/2026 a Senador Lemos ficou com R$ 20,80 de
    # faturamento gravado (a mediana da casa e R$ 16.551), e o consumo daquele
    # dia foi lancado normal. O coeficiente do dia deu 584 onde o normal e 0,6,
    # e a media dos 31 dias saiu 19,43 em vez de 0,57 — sozinho, aquele dia
    # multiplicaria por trinta a meta de catorze series da casa.
    #
    # O 'f_dia > 0' que existia antes nao pega esse caso: 20,80 e maior que
    # zero. Piso relativo, e nao um valor fixo, porque cada casa tem outra
    # escala (a DLU fatura o dobro da DC). Varrendo 2026 inteiro, 1.004 pares
    # dia-casa, este piso descarta exatamente um dia — o menor faturamento
    # legitimo do ano e R$ 4.330, ainda 32% da mediana da casa.
    fats = defaultdict(list)
    for dia in dados.values():
        for ck, lan in dia.items():
            if isinstance(lan, dict) and float(lan.get("faturamento") or 0) > 0:
                fats[ck].append(float(lan["faturamento"]))
    piso = {ck: mediana(v) * 0.10 for ck, v in fats.items()}

    coefs = defaultdict(list)
    meses = set()
    fora_do_piso = []
    for iso in sorted(dados):
        mes = iso[:7]
        for ck, lan in dados[iso].items():
            if not isinstance(lan, dict):
                continue
            f_dia = float(lan.get("faturamento") or 0)
            if f_dia <= 0:                    # sem faturamento nao ha coeficiente
                continue
            if f_dia < piso.get(ck, 0):
                fora_do_piso.append((iso, ck, f_dia))
                continue
            meses.add(mes)
            for ik, campos in (lan.get("insumos") or {}).items():
                # uso negativo e divergencia de contagem (estoque subiu sem
                # entrada): nao e eficiencia e nao pode baixar a meta
                if campos.get("uso") is None or float(campos["uso"]) < 0:
                    continue
                coefs[(ik, ck, mes)].append(float(campos["uso"]) / f_dia * 1000)
    # Nunca em silencio: dia descartado e dado que precisa de conserto na fonte.
    if fora_do_piso:
        print("dia(s) fora do piso de faturamento, nao entraram no calculo:")
        for iso, ck, f in fora_do_piso:
            print("   %s %-5s R$ %.2f  (piso da casa: R$ %.2f)" % (iso, ck, f, piso[ck]))
        print()

    fora = defaultdict(dict)
    for (ik, ck, mes), v in coefs.items():
        if v:
            fora[(ik, ck)][mes] = sum(v) / len(v)
    return fora, sorted(meses)


def estimadores(serie, completos):
    """m1, m3 e m6 de uma serie, ja sem os meses de consumo zero.

    Devolve None quando o ultimo mes completo nao teve consumo: o item saiu da
    operacao e nao deve ganhar meta.
    """
    if serie.get(completos[-1], 0) <= 0:
        return None
    validos = [serie[m] for m in completos if serie.get(m, 0) > 0]
    if not validos:
        return None
    m1 = validos[-1]
    m3 = sum(validos[-3:]) / len(validos[-3:])
    m6 = mediana(validos[-6:])
    return m1, m3, m6, min(validos)


def meta_da_serie(serie, completos):
    est = estimadores(serie, completos)
    if not est:
        return None
    m1, m3, m6, melhor = est
    # menor entre o mes anterior e a mediana dos tres: melhora vira alvo,
    # piora nao vira folga. O piso do melhor mes evita meta inatingivel.
    meta = max(min(m1, mediana([m1, m3, m6])), melhor)
    return None if meta <= 0 else (round(meta, 4), m1, m3, m6)


def calcular():
    coef, meses = coeficientes_por_mes()
    mes_atual = datetime.now().strftime("%Y-%m")
    completos = [m for m in meses if m < mes_atual]
    if len(completos) < 2:
        raise SystemExit("historico curto demais: preciso de pelo menos 2 meses completos")

    antigas = {}
    if ARQ_METAS.exists():
        with open(ARQ_METAS, encoding="utf-8") as f:
            antigas = {k: v for k, v in json.load(f).items() if not k.startswith("_")}

    novas, relatorio, sem_meta = {}, [], []
    for ik, nome in INSUMOS:
        novas[ik] = {}
        for ck in CASAS:
            serie = coef.get((ik, ck), {})
            if not serie:
                continue
            r = meta_da_serie(serie, completos)
            if not r:
                sem_meta.append((nome, ck))
                continue
            meta, m1, m3, m6 = r
            novas[ik][ck] = meta
            relatorio.append({
                "insumo": nome, "chave": ik, "casa": ck, "meta": meta,
                "antiga": (antigas.get(ik) or {}).get(ck),
                "m1": m1, "m3": m3, "m6": m6, "atual": serie.get(mes_atual),
            })
    return novas, relatorio, sem_meta, completos, mes_atual


def backtest():
    """Erro de cada criterio contra o que o mes seguinte realmente deu."""
    coef, meses = coeficientes_por_mes()
    criterios = {
        "mes anterior (m1)": lambda m1, m3, m6: m1,
        "media 3 meses (m3)": lambda m1, m3, m6: m3,
        "mediana 6 meses (m6)": lambda m1, m3, m6: m6,
        "mediana(m1,m3,m6)": lambda m1, m3, m6: mediana([m1, m3, m6]),
        "min(m1, mediana)": lambda m1, m3, m6: min(m1, mediana([m1, m3, m6])),
        "menor dos tres": lambda m1, m3, m6: min(m1, m3, m6),
    }
    for alvo in meses[-3:]:
        completos = [m for m in meses if m < alvo]
        if len(completos) < 3:
            continue
        erros = defaultdict(list)
        for serie in coef.values():
            est = estimadores(serie, completos)
            real = serie.get(alvo)
            if not est or not real:
                continue
            m1, m3, m6, _melhor = est
            for nome, f in criterios.items():
                meta = f(m1, m3, m6)
                if meta > 0:
                    erros[nome].append(abs(real - meta) / meta)
        print("prevendo %s a partir de %s (%d séries)"
              % (alvo, completos[-1], len(next(iter(erros.values())))))
        for nome, v in sorted(erros.items(), key=lambda kv: sum(kv[1]) / len(kv[1])):
            print("    %-22s erro médio %5.1f%%" % (nome, sum(v) / len(v) * 100))
        print()


def main():
    if "--backtest" in sys.argv:
        return backtest()
    simular = "--simular" in sys.argv
    novas, rel, sem_meta, completos, mes_atual = calcular()

    larg = "%-24s %-5s %9s %9s %9s %10s %9s %8s"
    print(larg % ("INSUMO", "CASA", "MES ANT", "MED 3M", "MEDN 6M", "META NOVA", "ANTIGA", "VS ANT"))
    print("-" * 92)
    for r in rel:
        var = "-"
        if r["antiga"]:
            var = "%+.1f%%" % ((r["meta"] - r["antiga"]) / r["antiga"] * 100)
        print(larg % (r["insumo"][:24], r["casa"], "%.4f" % r["m1"], "%.4f" % r["m3"],
                      "%.4f" % r["m6"], "%.4f" % r["meta"],
                      "%.4f" % r["antiga"] if r["antiga"] else "-", var))
    print("-" * 92)
    print("%d metas | %d mais apertadas | %d mais folgadas | base: %s a %s"
          % (len(rel),
             sum(1 for r in rel if r["antiga"] and r["meta"] < r["antiga"]),
             sum(1 for r in rel if r["antiga"] and r["meta"] > r["antiga"]),
             completos[-6:][0], completos[-1]))
    if sem_meta:
        print("sem meta (sem consumo no ultimo mes completo): "
              + ", ".join("%s/%s" % (n, c) for n, c in sem_meta))
    fora = [r for r in rel if r["atual"] and r["atual"] > r["meta"] * 1.10]
    print("%d serie(s) acima da meta nova no mes em curso (%s, parcial):" % (len(fora), mes_atual))
    for r in sorted(fora, key=lambda x: -(x["atual"] / x["meta"]))[:12]:
        print("   %-24s %-5s meta %.4f | %s %.4f (%+.0f%%)"
              % (r["insumo"][:24], r["casa"], r["meta"], mes_atual, r["atual"],
                 (r["atual"] - r["meta"]) / r["meta"] * 100))

    if simular:
        print("\n(--simular: dados/metas.json NAO foi alterado)")
        return

    saida = {"_nota": (
        "Metas de coeficiente (consumo por R$ 1.000) recalculadas em %s pelo "
        "recalcular_metas.py, sobre o historico agregado de %s a %s — nao sobre um "
        "mes isolado. Cada meta e o menor valor entre o mes anterior completo e a "
        "mediana de tres estimadores (mes anterior, media dos 3 meses recentes e "
        "mediana dos 6 meses recentes), com piso no melhor mes ja realizado; mes de consumo zero fica fora da conta e "
        "insumo sem consumo no ultimo mes completo fica sem meta. Rode o script no "
        "inicio de cada mes para reajustar."
        % (datetime.now().strftime("%d/%m/%Y"), completos[-6:][0], completos[-1]))}
    saida.update(novas)
    ARQ_METAS.parent.mkdir(exist_ok=True)
    tmp = ARQ_METAS.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    tmp.replace(ARQ_METAS)
    print("\ndados/metas.json atualizado.")


if __name__ == "__main__":
    main()
