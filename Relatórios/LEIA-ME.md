# Relatórios do CDE Web

Tudo de relatório mora nesta pasta: os relatórios prontos (pastas 1 a 9), as
planilhas de entrada (`_Entradas`) e o gerador (`_Gerador`, que até 28/10/2026
era a pasta `relatorios-coef/` na raiz do projeto).

Uma pasta por tipo de relatório. Pasta e nome dos arquivos gerados saem de
`_Gerador/organizacao.py`: relatório gerado de novo cai sempre no mesmo lugar,
com o mesmo padrão de nome.

| Pasta | O que relata | Decisão que apoia | Como sai |
|---|---|---|---|
| **1. Consumo Mensal por Insumo** | Um insumo em um mês, nas 4 casas: coeficiente (consumo ÷ faturamento × 1.000), custo, ranking contra a meta, dias em alerta, metas propostas | Cobrar a casa fora da meta; aprovar a meta do mês seguinte | `gerar_relatorio_coef.py --mes AAAA-MM --insumo <chave>` |
| **2. Resumido Diretoria - Mensal** | O mês em uma leitura curta, insumo por insumo, e o que confirmar com a operação | Leitura da diretoria | escrito à mão |
| **3. Evolução por Insumo** | Um insumo ao longo de vários meses (trimestre, semestre, ano) | Ver se a eficiência melhora ou piora com o tempo | `gerar_evolucao.py --de --ate --insumo <chave>` |
| **4. Painel de Evolução por Casa** | Todos os insumos num HTML só, com filtro de insumo e casa | Comparar casas no período | `gerar_evolucao.py --de --ate --insumo todos` |
| **5. Financeiro - Compras e Estoque** | Dinheiro: comprado, consumido, parado em estoque; variação separada em efeito preço e efeito volume | Negociar preço com fornecedor | `gerar_financeiro.py --de --ate` |
| **6. Estoque - Posição e Reposição** | Foto do estoque num dia: abastecimento, perdas, conciliação do valor. Versão completa e versão resumida para a diretoria | Repor, cortar compra, apurar perda | escrito à mão |
| **7. Consumo e Reposição - Metas** | Consumo do período, metas de coeficiente e ponto de reposição | Fixar meta e ponto de reposição | escrito à mão |
| **8. Rendimento do Processamento** | Anel de lula, tentáculo e lombo de atum: rendimento por casa e mês contra a faixa da planilha, custo em R$ do rendimento abaixo do padrão, queda da casa × queda da rede, lançamentos implausíveis | Treinar/cobrar a casa; cobrar especificação do fornecedor; corrigir lançamento | `gerar_rendimento.py --de --ate` |
| **9. Feriados e Eventos** | Faturamento e consumo de cada feriado/evento contra um dia normal; feriado dentro da média da Projeção de hoje; próximos eventos; dias atípicos sem evento | Tirar dia da média; fator na Projeção; cadastrar evento | `gerar_eventos.py --de --ate` (calendário em `dados/eventos.json`) |
| `_Entradas` | Planilhas de custo usadas como entrada (preços, custo unitário de julho e agosto, base de custo do 1º semestre) | — | — |
| `_Gerador` | Os scripts que geram os relatórios, os modelos HTML e `custos_mensais.json`. Uso e opções em `_Gerador/LEIA-ME.md` | — | rode de dentro de `_Gerador` |

Padrão de nome: `Consumo Agosto 2026 - Salmão`, `Evolução Kani - Jan a Set 2026`,
`Estoque 21 Set 2026 - Resumido Diretoria`. O PDF tem o mesmo nome do HTML.

O relatório de **Recebimento de Salmão (PCQS)** não mora aqui: ele sai por NF, no botão
"Baixar relatório em PDF" da tela Qualidade do Salmão. Os três desenhos em avaliação
estão em `Ideias/PCQS - Recebimento de Salmão/`, junto com as outras propostas de layout.

## Limpeza de 28/10/2026

Saíram, para a Lixeira do Windows: a versão de 14/08 do Consumo Julho 2026 -
Salmão (a de 25/09 continua), o `saida.rar` com a saída antiga e a pasta
`Relatórios de Coeficiente de Consumo` em `Documentos Diego` — os relatórios de
julho e as metas de agosto no formato anterior, substituídos pelas pastas 1 e 7.
