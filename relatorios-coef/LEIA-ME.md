# Relatório de Coeficiente de Consumo — gerador

Gera o relatório operacional de **coeficiente de consumo** (HTML + PDF) para
**qualquer mês e qualquer insumo**, a partir dos lançamentos diários do CDE Web.

**Coeficiente = Consumo total ÷ Faturamento bruto × 1.000** (unidades por R$ 1.000).
O faturamento usado é sempre o **bruto**, como lançado no CDE — sem desconto de
impostos, taxas de entrega ou comissão de aplicativo.
Menor = mais eficiente. Queda = ganho de eficiência.

## Uso

```bash
cd relatorios-coef
python gerar_relatorio_coef.py --mes 2026-08 --insumo salmao_equivalente
```

- Lê os dados de `../dados/lancamentos.json`, as metas de `../dados/metas.json` e o
  custo unitário por casa de `../dados/custos.json`.
- Gera `saida/Relatorio_<insumo>_<mes>.html` e `.pdf`.
- PDF renderizado via Chrome/Edge headless (use `--no-pdf` para pular).

### Opções

| Flag | Padrão | O quê |
|---|---|---|
| `--mes` | (obrigatório) | mês do relatório, `AAAA-MM` |
| `--insumo` | `salmao_equivalente` | chave do insumo |
| `--comparativo` | mês anterior | mês de comparação `AAAA-MM` |
| `--dados` | `../dados` | pasta dos JSONs |
| `--saida` | `./saida` | pasta de saída |
| `--template` | `./modelo_coef.html` | template HTML |
| `--piso` | `0.10` | piso de faturamento do dia, como fração da mediana da casa (`0` desliga) |
| `--no-pdf` | — | não gerar PDF |

### Insumos disponíveis (chaves)

Vale **qualquer chave que exista em `lancamentos.json`**. As que têm consumo hoje:

| Chave | Nome no relatório | Meta | Custo |
|---|---|:--:|:--:|
| `salmao_equivalente` | Salmão (equivalente) | sim | sim |
| `salmao_0810` `salmao_1012` `salmao_1214` `salmao_1416` | Salmão por faixa | — | — |
| `camarao_g` `camarao_m` `camarao_p` | Camarão G / M / P | sim | — |
| `cream_cheese` | Cream Cheese | sim | — |
| `arroz` | Arroz de Sushi | sim | — |
| `nori` | Nori | sim | — |
| `kani` | Kani | sim | — |
| `patinho` | Patinho | sim | — |
| `lula` · `lula_in_natura` | Lula (anel) · in natura | sim · — | — |
| `polvo` · `polvo_in_natura` | Polvo · in natura | sim · — | — |
| `anchova` | Anchova | sim | — |
| `file_tilapia` | Filé de Tilápia | sim | — |
| `atum` · `atum_in_natura` | Atum | — | — |

**Meta** vem de `metas.json` — sem ela, o relatório troca a comparação contra o
alvo pela comparação contra a média da rede, e o placar usa o coeficiente da
própria casa como referência.

**Custo** vem de `custos.json` — sem ele, a seção "O consumo em reais" **sai do
relatório** e as seções seguintes são renumeradas. Hoje só o salmão-equivalente
tem custo cadastrado; para outro insumo, basta acrescentar a chave lá:

```json
"camarao_m": {"SL": 89.90, "DC": 88.50, "DLU": 88.50, "DLCN": 88.50}
```

ou um número só, quando o preço vale para as quatro casas: `"nori": 42.30`.

Insumo sem consumo no mês pedido (`atum`, hoje) para com mensagem explícita, em
vez de gerar um relatório vazio.

## Parâmetro do salmão-equivalente

O `salmao_equivalente` usa o tamanho **08/10** como padrão de conversão,
com peso médio **4,082 kg/un**. Por isso o relatório do salmão mostra o
consumo também em **kg** (KPI, leitura e coluna na tabela). O fator está em
`INSUMOS['salmao_equivalente']['kg']` no script — para adicionar kg a outro
insumo, basta preencher `kg` na mesma tabela.

## Estrutura do relatório (13 seções)

| # | Seção | Responde |
|---|---|---|
| 01 | Panorama da rede | o que aconteceu no mês |
| 02 | O consumo em reais | quanto custou, e que fatia do faturamento foi |
| 03 | Consolidado por casa | quem consumiu o quê |
| 04 | Ranking de eficiência × meta | quem está dentro do alvo |
| 05 | Semana a semana | o mês andou parelho ou concentrou |
| 06 | Mapa do mês | em que dia saiu do lugar |
| 07 | Dias em alerta | quais dias, de que tamanho, e por qual causa |
| 08 | Placar das casas | quem está conduzindo melhor |
| 09 | Leitura por casa | o detalhe de cada uma |
| 10 | Padrão por dia da semana | onde concentrar compra e pré-preparo |
| 11 | Metas propostas | que alvo vale para o mês seguinte |
| 12 | Indicativos e ações | o que fazer com isso |
| 13 | Como o relatório é gerado | metodologia e dados descartados |

Toda a narrativa é **gerada a partir dos dados** — não precisa editar texto a cada mês.
A numeração se ajusta sozinha: a seção 02 sai quando o insumo não tem custo em
`custos.json`, e as demais são renumeradas.

## Guardas de qualidade do dado

Duas regras impedem que um lançamento errado contamine a leitura. As duas
aparecem no relatório, no fim da seção 13 — dado descartado em silêncio some
da vista e nunca é corrigido na origem.

**Piso de faturamento.** Dia cujo faturamento não chega a 10% da mediana
histórica da casa fica fora de todas as contas. É a mesma regra do
`recalcular_metas.py`, e existe por um dia real: em 16/08/2026 a Senador Lemos
gravou R$ 20,80 de faturamento com consumo normal, e o coeficiente daquele dia
deu 584 contra 0,63 do normal da casa. Ajustável em `--piso` (`0` desliga).

**Consumo negativo.** Consumo negativo não existe: é divergência de contagem em
dia de recebimento. O dia continua no total do mês — o saldo físico depende dele
— mas sai das leituras do nível do dia (mapa, alertas e placar), onde seria lido
como eficiência.

## Duas bases de cálculo, e por que elas não brigam

O relatório usa a **base agregada**: consumo do mês ÷ faturamento do mês. É ela
que amarra com o dinheiro e com o percentual do faturamento.

A meta de `metas.json` nasce de **outra base**: a média dos coeficientes diários,
porque é essa que o Painel de Consumo compara com a meta. Com o piso de
faturamento aplicado as duas praticamente coincidem; sem o piso, não — um único
dia de faturamento errado separa as duas em vários pontos percentuais.

## Metas propostas

A seção 11 **não grava nada**. Ela importa `recalcular_metas.py` e mostra o alvo
que aquele script proporia, para a diretoria ver antes de valer. Quem grava
`metas.json` continua sendo o script, rodado na raiz do projeto:

```bash
python recalcular_metas.py --simular   # só mostra
python recalcular_metas.py             # mostra e grava
```

A regra da meta mora lá, e só lá — duas implementações da mesma regra viram duas
metas diferentes na primeira vez que alguém mexer em uma só.
