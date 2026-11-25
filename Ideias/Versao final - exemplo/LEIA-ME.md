# CDE Web, versão final de exemplo (para aprovar)

Proposta de 25/11/2026. **O sistema original não foi alterado.** Esta pasta é uma cópia das telas, do CSS e do JS de hoje,
com uma camada de tema por cima (`tema-novo/tema.css` e `tema-novo/tema.js`). As cores, os cartões e as telas são os
mesmos do CDE de hoje (Projeção de Compras, Ordens, Painel e todas as outras), nos três temas: Claro, Escuro e Mono.

## Como abrir
Com o servidor do CDE ligado (o de sempre, `Abrir.bat`) e você logado, abra:

`http://localhost:8935/Ideias/Versao%20final%20-%20exemplo/overview.html`

(em outro PC: troque `localhost` por `DESKTOP-LC0FQC1`). Use Chrome ou Edge.

**Atenção: esta cópia usa os dados reais.** Ela fala com o mesmo servidor, então o que for lançado, salvo ou aprovado
aqui vale no sistema de verdade. Para só olhar, não clique em Salvar nem em Aprovar.

## O que mudou
| Pedido | Como ficou |
|---|---|
| Saudação na tela inicial | A Visão Geral abre com "Bom dia, Diego", "Boa tarde, Diego" ou "Boa noite, Diego": a hora vem do relógio e o nome, do usuário logado. Sem login ligado, mostra só "Bom dia". |
| Menu como no modelo D | Trilho de ícones. Passar o mouse num grupo (Início, Estoque, Compras, Utilitários) abre um painel com as telas de dentro, e você clica direto na que quer. O clique no ícone fixa o painel; Esc fecha. O botão ao lado da marca (ou a tecla `[`) fixa o menu aberto, com os nomes, e a preferência fica guardada. A tela atual é marcada por uma pílula que desliza entre as telas. Botão Pesquisar (Ctrl K) para ir a qualquer tela. As cores do menu são as de hoje. |
| Animações de troca de tela | O navegador cruza a tela antiga com a nova em instantes, e as partes da nova (título, cartões, tabelas) entram uma depois da outra, subindo 10 px. |
| Animações dos gráficos | A linha se desenha, a área aparece, a rosca gira ao entrar e as barrinhas de proporção crescem. Nos gráficos de linha da Visão Geral, o destaque (faixa, ponto e leitura) segue o mouse pela curva, com um atraso suave, em vez de pular de mês em mês. |
| Botões de navegação | Botões e abas sobem 1 px ao passar o mouse e afundam ao clicar; os seletores de três posições (`.segmentado`) ganham um realce que desliza de uma opção para a outra. |

## O que não mudou, de propósito
Layout das telas, cores, cálculos, tabelas, formulários, permissões e tudo que grava. Nenhum arquivo fora desta pasta foi tocado.

## Limites
- A saudação vale para a Visão Geral. Se a tela inicial depois do login for outra, é uma linha de ajuste.
- A transição entre páginas usa um recurso do Chrome e do Edge (versão 126 em diante). Em outro navegador a troca é direta, e só a entrada das partes da tela aparece.
- Foi testado com respostas simuladas do servidor (a Visão Geral e o menu em todas as telas), não com o sistema ao vivo: confirme olhando as telas com os seus dados.

## Para valer no sistema (depois de aprovar)
Copiar `tema-novo/` para a raiz e acrescentar duas linhas em cada página (`tema.css` depois do `style.css`, `tema.js` depois
do `navegacao.js`). Nenhuma outra tela ou cálculo precisa mudar.

## Rodada 3 (25/11/2026): modelo do Bastio e dos vídeos
- **Fonte:** Urbanist em todo o sistema (arquivos em `css/fonts`, licença aberta, sem depender de internet). Título de página de 28 a 37 px, texto de 14 px, botões de 13,5 px, como no Bastio.
- **Menu:** 252 px aberto e 80 px recolhido, itens com cantos totalmente redondos. Os 18 ícones foram desenhados do zero no traço do Bastio (24 px, 1,7 de espessura, pontas redondas).
- **Botões:** pílulas de 40 px (32 px nos pequenos), como Export, New e Start reviewing. O botão laranja no tema Mono agora tem texto legível.
- **Visão Geral (ideia do menu Reports):** os seis blocos pequenos viram abas. O bloco escolhido fica escuro e abre, logo abaixo, o gráfico e os números dele, que mudam com o mês e a casa escolhidos. Blocos com série mensal abrem uma linha com comparação; o Custo do estoque abre barras por casa.
- **Gráficos (vídeo de Reports):** linha suave com área rasa, grade pontilhada com valores à esquerda, linha tracejada de comparação, barras arredondadas com a escolhida em destaque e balão escuro. Valem na Visão Geral e em "Evolução do grupo".
- **Painel de Consumo (tela de Alertas):** três blocos de gravidade no alto e a lista "Precisa de um olhar", com ícone, selo, descrição e botões. O menu de abas virou pílula.
- **Lançamento Diário:** a página usa a largura da tela, o nome do item ganha espaço e quebra de linha, e em tela estreita a tabela rola dentro do cartão.
- Arquivos novos na raiz: `js/tema-grafico.js`, `js/tema-visao.js`, `js/painel-resumo-novo.js` e `css/fonts/`. As imagens desta rodada estão em `imagens/`, com números de exemplo.
