# Novo visual do CDE: 4 modelos

Proposta de 24/11/2026. Abra `index.html` (dois cliques, sem servidor; use Chrome ou Edge, por causa das transições).
**Nada disso entrou no sistema.** Os dados são os reais já extraídos nas pastas `Modelos de telas/Visao Geral` e
`Painel de Consumo - Resumo do dia` (18/11/2026); esta pasta só lê esses arquivos, não grava nada.

## O que foi pedido e onde está
| Pedido | Referência | Onde está nos modelos |
|---|---|---|
| Animações de troca de página e de menu | Scenra | Troca de tela com a transição do navegador (cada modelo tem a sua), pílula do menu que desliza, grupos que abrem e fecham, entrada das partes da tela uma de cada vez, troca de tema com círculo que nasce do botão |
| Menu lateral | Bastio | Grupos, busca no topo (Ctrl K), contadores, submenus, rodapé com a pessoa; recolhe para só ícones (botão ou tecla `[`) |
| Tela de visão geral e botão de pesquisa | Vídeo 14.06.59 | Visão Geral (blocos de número + cartão escuro) e o botão Pesquisar, que abre uma paleta com telas, insumos e casas |
| Menu do gráfico (Reports) no Painel de Consumo | Vídeo 14.14.46 | Painel de Consumo: Consumo / Faturamento / Insumo sobre fat., Rede ou casa, 5 ou 10 meses, curva com comparação pontilhada e total ao lado |
| Pesquisa nas telas com o botão | Vídeo 14.14.47 | Campo com lupa e limpar, lista de filtro e pílulas, filtrando enquanto digita, com "N de M". Está em Painel (insumos), Projeção de Compras e Ordens de Compras |

## Os 3 modelos
| Modelo | Arquivo | Menu | Troca de tela | Visão Geral |
|---|---|---|---|---|
| A | `modelo-a-menu-aberto.html` | Aberto, neutro com laranja do CDE | A tela antiga sai para cima, a nova sobe | Quatro blocos, casas de hoje, próxima ordem |
| B | `modelo-b-trilho.html` | Só ícones, nome ao passar o mouse | Desliza no sentido da ordem do menu | Quantos dias cada casa aguenta |
| C | `modelo-c-mono.html` | Aberto, pílula branca sobre preto | Cortina que varre da esquerda para a direita | Boletim: casa por casa em reais e decisões do dia |

Os três têm Claro, Escuro e Mono (botão no alto, passa pelos três). No Mono, a situação vai pela palavra
("18% abaixo", "Pedir"), nunca só pela cor.

## Rodada 2 (24/11/2026): o que mudou depois do retorno
- **Gráfico de linha mais fluido (vale para os 4 modelos).** O cursor desliza pela curva em vez de pular de mês em mês; o balão acompanha com um atraso curto e suave. Ao trocar métrica, casa ou período, a mesma linha se transforma até o novo valor (o eixo troca de número com um fade), as barras mudam de altura no lugar e o total corre até o novo número. Antes, o gráfico era apagado e redesenhado a cada clique.
- **Menu recolhido com painel ao passar o mouse (B e D).** Passar o mouse num grupo (Estoque, Compras) abre um painel ao lado com as telas de dentro, para navegar direto. Fica aberto ao mover o mouse para ele, fecha com atraso curto, e o clique fixa o painel (serve no celular). Esc fecha.
- **Modelo D, refinado.** Resposta a "ficou exagerado, muito bruto". Mantém os cantos arredondados, o menu e as transições, e tira o peso:
  - Título de 24 px (era 40) e números de 24 px (eram 36 a 44), peso 600 em vez de 700.
  - Nenhum bloco preto ou colorido: cartões brancos sobre cinza muito claro, com borda fina. Cantos de 16 px nos cartões e 10 px nos controles (antes 22 px e botões em pílula).
  - O laranja aparece só na ação principal e no item ativo; as contagens do menu ficam discretas.
  - A Visão Geral começa pelo que pede decisão hoje (aprovar ordens, repor itens, conferir desvios), e os números ficam de apoio.
  - Troca de tela curta (a tela some e a nova sobe 8 px), sem efeito de palco.

## Limites desta rodada
- Só Visão Geral, Painel de Consumo, Projeção de Compras e Ordens de Compras têm conteúdo. As outras telas do menu
  abrem uma tela de exemplo, só para ver o menu e a troca de tela.
- Os botões que gravam (aprovar ordem, exportar) são de mentira.
- O gráfico mostra só meses fechados. Novembro (até o dia 18) aparece no gráfico por casa, para a linha não parecer queda.
- **Dado a conferir antes de usar:** o preço do Camarão M na Umarizal (R$ 980/kg) está nos dados e infla o consumo da
  Umarizal (ver `Visao Geral/LEIA-ME.md`). Os números do Painel herdam isso.
- Para entrar no sistema, o menu e a busca viram componentes do `js/navegacao.js` e do `css/style.css`; as transições
  usam a API de transição de página do navegador, que cai para a entrada simples em navegador antigo.
