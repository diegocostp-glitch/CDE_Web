# Migração do CDE Web para React — instruções de execução

> **Como usar:** monte o ambiente de teste da seção 1.1 (cópia isolada, branch
> própria), abra o Claude Code dentro da CÓPIA e diga:
> **"Leia o MIGRACAO-REACT.md e execute a migração, começando pela Etapa 1."**
>
> Este documento é o comando. Ele existe porque uma sessão nova não conhece as
> regras de negócio que estão espalhadas pelas ~8.600 linhas de JavaScript do
> front — e perder uma delas é o único risco real desta migração.
>
> Escrito em 23/08/2026; **atualizado em 09/10/2026** com as telas e regras que
> entraram depois (Qualidade/PCQS, Parâmetros, três temas, processamento,
> alerta de contagem, preço com dez casas, sincronização por período).

---

## 1. Objetivo

Trocar a camada de apresentação (HTML + JS + CSS puros) por **React**, mantendo
o comportamento atual idêntico. Nada de backend, regra de negócio, dado ou
aparência muda.

### Restrições absolutas

| Regra | Por quê |
|---|---|
| **Sem npm, sem `node_modules`, sem etapa de build** | A pasta fica dentro do OneDrive; `node_modules` tem dezenas de milhares de arquivos e a sincronização trava. E o fluxo de manutenção precisa continuar "editar arquivo → F5" |
| **`server.py` não muda** | Ele já é uma API REST com 22 rotas. Serve os arquivos estáticos da própria pasta, então React entra sem tocar nele |
| **`dados/*.json` não são alterados** | São os dados reais da operação: faturamento, consumo, preços, pedidos, ordens |
| **`Servidor.bat` e `Abrir.bat` continuam iguais** | É como as lojas abrem o sistema |
| **As telas antigas continuam funcionando durante a migração** | Uma tela por vez; o arquivo antigo só é removido quando a nova passa na verificação |
| **Não migrar `oc-pdf.js`, `header-img.js`, `importar-pdf.js`, `pcqs.js`, `pcqs-pdf.js`** | Os três primeiros geram/leem o PDF idêntico ao do Gerador de OCs, dependem de jsPDF/autoTable/pdf.js globais e não têm interface. `pcqs.js` é a leitura e a análise do PCQS **sem DOM, de propósito** (roda no node nos testes) e `pcqs-pdf.js` gera o Relatório de Recebimento de Salmão. Continuam sendo chamados como estão |
| **Nunca trocar de branch na pasta de produção** | O servidor da operação roda direto da pasta `CDE Web`: um `git checkout` ali troca o sistema de todas as lojas na hora. A migração acontece **só** na cópia da seção 1.1 |

### 1.1 Ambiente de teste isolado (obrigatório)

O `server.py` lê e grava **fora da própria pasta**, por caminho relativo:

| Caminho no `server.py` | O que é | Risco numa cópia mal posicionada |
|---|---|---|
| `../Gerador de OCs/Base_SushiBoulevard.xlsx` | Cadastros (fornecedores, produtos, unidades), compartilhados com o Gerador de OCs | Teste de Cadastros **grava na planilha real** |
| `../Gerador de OCs/Registro_OCs.json` | Numeração das OCs, compartilhada com o Gerador de OCs | Teste de Ordens **consome números de OC reais** |
| `../../../Documentos 2026/Coeficiente de Consumo 2026/Faturamento - 2026.xlsx` | Faturamento (só leitura) | Nenhum — se não achar, o campo fica para digitação |

Por isso a cópia de teste **não pode** ficar ao lado da pasta real. Monte assim:

```
<fora de "Documentos Diego">\teste-react\
    CDE Web\            ← git worktree na branch de teste + cópia de dados\
    Gerador de OCs\     ← SÓ cópias de Base_SushiBoulevard.xlsx e Registro_OCs.json
```

```bash
# na pasta de produção (só cria o worktree; não troca a branch dela)
git worktree add "<...>/teste-react/CDE Web" -b teste/migracao-react
# dados/ e Base local são ignorados pelo git: copie à mão
cp -r dados "<...>/teste-react/CDE Web/"
mkdir "<...>/teste-react/Gerador de OCs"
cp "../Gerador de OCs/Base_SushiBoulevard.xlsx" "../Gerador de OCs/Registro_OCs.json" \
   "<...>/teste-react/Gerador de OCs/"
```

O servidor de produção ocupa a porta **8935** e o `server.py` recusa subir uma
segunda cópia na mesma porta. Para testar sem alterar o `server.py`, suba a
cópia em outra porta com um arquivo de apoio **fora do repositório**
(`teste-react/servir.py`):

```python
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "CDE Web"))
os.chdir(os.path.join(os.path.dirname(__file__), "CDE Web"))
import server
server.PORT = 8936
server.Servidor(("", 8936), server.Handler).serve_forever()
```

Todos os testes da seção 6 apontam para `http://localhost:8936`.

---

## 2. Stack exata

React 18 + [htm](https://github.com/developit/htm), servidos da própria pasta.
Sem JSX (que exigiria build); `htm` dá a mesma escrita em template literal.

### Etapa 1 — baixar as bibliotecas (uma vez)

```bash
mkdir -p js/vendor
curl -sL -o js/vendor/react.production.min.js      https://unpkg.com/react@18.3.1/umd/react.production.min.js
curl -sL -o js/vendor/react-dom.production.min.js  https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
curl -sL -o js/vendor/htm.umd.js                   https://unpkg.com/htm@3.1.1/dist/htm.umd.js
```

Confira: os três somam ~144 KB e o `react-dom` precisa conter `createRoot`
(`grep -c createRoot js/vendor/react-dom.production.min.js` deve dar 1).
Arquivos locais, não CDN: o sistema tem que abrir sem internet.

> Exceção já existente: Importar OC e Qualidade carregam **pdf.js** e
> **jsPDF/autoTable** de CDN (`cdnjs`), e o PCQS usa a mesma URL do pdf.js do
> Importar OC de propósito — duas versões de pdf.js dariam dois resultados para
> o mesmo arquivo. A migração não muda isso.

### Como cada tela carrega

```html
<script src="js/vendor/react.production.min.js"></script>
<script src="js/vendor/react-dom.production.min.js"></script>
<script src="js/vendor/htm.umd.js"></script>
<script type="module" src="js/app/telas/movimentacoes.js"></script>
```

O `<body>` da tela fica com um ponto de montagem só:

```html
<body class="light"><div id="raiz"></div></body>
```

(a classe do `body` é a do tema: `light`, `dark` ou `mono` — seção 5).

### Escrita dos componentes

```js
// js/app/html.js
export const html = htm.bind(React.createElement);
export const { useState, useEffect, useMemo, useRef, useCallback } = React;
```

```js
// exemplo de componente
import { html } from "../html.js";

export function Ficha({ titulo, valor, pe, tom }) {
  return html`
    <div class="ficha estatica ${tom || ""}">
      <span class="ficha-topo"><span class="ficha-vals">
        <span class="ficha-n">${valor}</span>
        <span class="ficha-r">${titulo}</span>
      </span></span>
      <span class="ficha-pe">${pe}</span>
    </div>`;
}
```

Atenção a três detalhes de `htm` + React:
- use `class`, não `className` (o htm aceita os dois; padronize em `class` para
  o CSS existente continuar legível ao comparar com o arquivo antigo);
- `dangerouslySetInnerHTML` só onde o texto vem de dentro do sistema (nunca com
  nome digitado pelo usuário) — o objetivo da migração é justamente parar de
  escapar à mão;
- SVG funciona normalmente; mantenha os mesmos atributos (`stroke-linejoin`,
  `stroke-width`) do código atual.

---

## 3. Estrutura de arquivos alvo

```
js/
  vendor/                     react, react-dom, htm (baixados na Etapa 1)
  app/
    html.js                   bind do htm + reexport dos hooks
    api.js                    TODAS as chamadas fetch, uma função por rota
    formato.js                fmt, qtd, reais, curto, pct, parte, brDate, num, chave
    tema.js                   três temas (chave sb_theme_v1)
    componentes/
      Sidebar.js              menu lateral (hoje navegacao.js), selo de pendentes, voltar ao topo
      Cartao.js               cartão, cabeça, cartão dobrável
      Placar.js               ficha do placar
      Selo.js                 selo e selo-mini
      Tabela.js               tabela com rolagem
      Aviso.js                aviso flutuante e barra de estado
      Grafico.js              curva suave (com destaque no hover), sparkline, rosca, barras
      AcoesRapidas.js         botão de ação e os três mini formulários
      FiltroInsumos.js        seleção de vários insumos (Movimentações)
    telas/
      overview.js  painel.js  lancamento.js  movimentacoes.js  projecao.js
      ordens.js    cadastros.js  importar.js  conversao.js     parametros.js
      qualidade.js
  oc-pdf.js  header-img.js  importar-pdf.js  pcqs.js  pcqs-pdf.js   (ficam como estão)
```

Regras da estrutura:
- **`api.js` é o único lugar com `fetch`.** Hoje as chamadas estão espalhadas
  pelas telas. Uma função por rota, com o nome da rota no nome da função.
- **`formato.js` é o único lugar com `fmt`/`esc`/`num`/`qtd`.** Hoje `num`
  existe em `app.js`, `acoes.js`, `compras.js`, `conversao.js`,
  `movimentacoes.js` e `comum.js` — com a MESMA regra (só a vírgula distingue
  ponto de milhar de ponto decimal). Foi por divergir dela que um "0.184"
  voltava do campo como 184 e um faturamento de "20.802,90" virou R$ 20,80.
- **Nada de variável global.** Módulos ES6 resolvem as colisões de nome que
  hoje derrubam a tela inteira (aconteceu com `const ICO` e com `const $`).

---

## 4. Ordem da migração

Da menor para a maior, porque os componentes compartilhados vão sendo
descobertos no caminho:

| # | Tela | Arquivo atual | Linhas | Observação |
|---|---|---|---|---|
| 0 | Menu e tema | `js/navegacao.js` | 185 | Vira o componente `Sidebar`; entra em todas as telas |
| 1 | Conversão de Salmão | `js/conversao.js` | 275 | Cálculo puro, sem servidor; fatores no localStorage |
| 2 | Parâmetros | `js/parametros.js` | 279 | Formulário simples; manda o conjunto inteiro ao salvar |
| 3 | Movimentações | `js/movimentacoes.js` | 397 | Filtro de vários insumos e campo de preço (regras novas) |
| 4 | Qualidade (PCQS) | `js/qualidade.js` | 387 | Só a tela; `pcqs.js` e `pcqs-pdf.js` não migram |
| 5 | Painel de Consumo | `js/painel.js` | 428 | Gráficos SVG e as três visões |
| 6 | Botão de ações | `js/acoes.js` | 487 | Componente global, entra em todas as telas |
| 7 | Projeção de Compras | `js/compras.js` | 525 | Recálculo por tecla, consolidado, split do salmão |
| 8 | Lançamento Diário | `js/app.js` | 674 | **A tela mais sensível**: alertas, processamento, sincronização |
| 9 | Cadastros | `js/cadastros.js` | 728 | Gravação com debounce, busca, vínculos |
| 10 | Visão Geral | `js/overview.js` | 996 | Recorte por casa (VISTA), rosca, gráficos dinâmicos |
| 11 | Ordens de Compras | `js/ordens.js` | 737 | **Peça teste de mesa antes de aposentar o antigo** |
| 12 | Importar OC | `js/importar.js` | 584 | **Idem** — depende de arquivo real (planilha e PDF) |

`js/comum.js` (248 linhas, peças das telas de compras) se desfaz em
`formato.js` + `api.js` à medida que Cadastros, Ordens, Importar, Parâmetros e
Qualidade migram; só é removido quando nenhum HTML o carrega mais.

Para cada tela: crie a versão React, verifique (seção 6), e **só então** remova
o arquivo antigo e ajuste o HTML. Se a verificação falhar, o antigo continua
valendo — o sistema nunca fica quebrado no meio do caminho.

---

## 5. Regras de negócio que NÃO podem se perder

Esta é a parte que importa. Cada item abaixo é comportamento atual, testado e
em uso. Antes de migrar uma tela, leia o arquivo antigo inteiro — os comentários
explicam o porquê de cada regra.

### Números (todas as telas)
- `num()`: **só a vírgula** distingue o ponto de milhar do decimal. "69,86" →
  69,86 · "1.234,56" → 1234,56 · "43.081" sem vírgula → 43081 (milhar).
- Campo de quantidade sempre em **três casas** pt-BR (`qtd()`, formato
  `#,##0.000` da planilha). Número cru do servidor nunca vai direto ao campo —
  "0.184" voltaria como 184.
- **Campo vazio ≠ zero.** Vazio é "não contado"; o servidor usa a diferença para
  não gravar contagem que ninguém fez. Ao sair do campo, vazio continua vazio.
- Abaixo de **0,0005** é zero para quem olha (`QUASE_ZERO`): resíduo de soma em
  binário não pode acender "contagem maior que o disponível".
- Dinheiro (faturamento, preço) em duas casas na exibição.

### Lançamento Diário
- `uso = inicial + entrada − transferência − final`. **Desperdício não entra no
  uso** — é registrado à parte.
- Estoque inicial vem do dia anterior, calculado pelo servidor. Não recalcular no
  navegador.
- Ordem das colunas: **Inicial → Entrada (chegada) → Saída (transferência) →
  Desperdício → Final (contagem) → Uso do dia → Coef.**
- Campo com selo **Planilha aceita correção** (não é mais somente leitura): ao
  salvar um número diferente, o servidor solta a marca de planilha, a linha
  ganha o selo **editado** e a sincronização passa a respeitar o valor digitado.
- `salmao_equivalente` é linha derivada, só leitura: soma das quatro faixas
  pelos fatores 08/10 = 1,00, 10/12 = 1,25, 12/14 = 1,48, 14/16 = 1,67, **mais o
  filé limpo que sobrou**, convertido em peixe (`fileEmPeixes`, fatores
  `conversao_file` vindos do servidor). O filé entra no FINAL do dia e no INICIAL
  do dia seguinte; o uso do equivalente é a conta de estoque, não a soma dos usos
  das faixas. As quatro colunas do meio da linha derivada mostram os números.
- **Filé de produção** é linha só de contagem (`so_contagem`): só o final; as
  colunas de movimento, uso e coeficiente ficam vazias. Sem a guarda, o
  salvamento inteiro quebra (o `querySelector` dos campos devolve null).
- Uso importado da planilha vence o cálculo (lula, salmão, polvo e atum têm
  rendimento de processamento embutido).
- Sem faturamento não há coeficiente.
- **Abas das casas** mostram quantos insumos faltam contar no dia, ou ✓ quando a
  casa está completa.
- **Bloco Processamento do dia** (anel de lula, tentáculo, lombo de atum): a
  casa digita só *in natura (foi processar)* e *processado (rendeu)*; perda e
  rendimento são calculados. Perda negativa → "rendeu mais do que entrou";
  rendimento fora da faixa padrão → aviso. É este rendimento que a Projeção usa.
- **Alertas na linha:**
  - uso negativo → uso em vermelho, "contagem maior que o disponível";
  - **contagem suspeita**: uso do dia acima de **1,5 ×** `maior_uso` (maior uso
    da casa naquele insumo nos últimos 30 dias, mandado em `/api/dia`) e por
    pelo menos 1 unidade → célula do final e uso em vermelho, com o "final
    esperado" calculado por `media_diaria`. Só visual; não impede salvar. A dica
    de origem (planilha/editado) volta quando o alerta apaga.
- **Sincronizar** (botão do topo):
  - sem período: o servidor lê do mês do último lançamento até o mês atual;
  - com período (setinha ao lado): reimporta os dias escolhidos mesmo que já
    existam; o seletor abre no mês atual;
  - a mensagem diz quantos dias novos/atualizados e de quais planilhas; avisa
    planilha **travada** (OneDrive/Excel), dia **preservado** (corrigido na tela,
    a planilha não reescreve) e item **pendente** (sem estoque final na planilha —
    fica de fora e entra na próxima sincronização).

### Painel de Consumo
- A situação sai da **média do período**, não do último dia. **Crítico só** pela
  média contra a meta (25% ou mais); um dia isolado fora da curva vira no máximo
  **Atenção**.
- Cores por situação, nos mini gráficos e nos grandes: Crítico = vermelho,
  Atenção = amarelo, Consumo zerado = azul, Normal = verde, Sem dados = cinza.
- O placar conta as séries **sem** aplicar o filtro de situação (senão, ao
  escolher "Atenção", os outros contadores zerariam).
- Metas vêm de `dados/metas.json`, geradas pelo `recalcular_metas.py`.
- Uso negativo não entra no painel (o servidor já o descarta).

### Projeção de Compras
- `duração = (estoque + trânsito) ÷ (média diária × fator)`;
  `pedido = (dias a cobrir − duração) × média × fator`.
- A média diária vem pronta do servidor: média dos usos registrados na janela
  (`janela_media_dias`, hoje 14), dividindo pelos dias **com registro** e
  **incluindo consumo negativo** — a mesma conta do `AVERAGEIFS` da planilha
  PCPOE. Não recalcular no navegador.
- **Lula, tentáculo e atum**: a casa CONTA o processado e COMPRA o in natura. A
  linha já vem convertida pelo servidor com o rendimento do **último
  processamento medido**; o selo diz se o rendimento foi medido ou ainda é a
  média de partida.
- Salmão: conta em peixes, pede em quilos — `kg_por_caixa ÷ peixes_por_caixa`.
- Quantidade ajustada à mão (`qtd_manual`) vence o cálculo e sobrevive ao
  recálculo; o calculado continua visível para mostrar o desvio.
- O consolidado **sempre** calcula as quatro casas; o filtro de casa só muda o
  que aparece.
- Coluna **Produto na OC**: de-para de `dados/vinculos.json`, restrito ao
  catálogo do fornecedor escolhido, com o preço negociado.
- **Split do salmão**: rendimentos 1,0 (inteiro), 0,6716 (filé com pele) e
  0,5380 (filé sem pele). Quilos de filé são divididos pelo rendimento para
  saber quanto de peixe inteiro consomem; o resto do pedido sai como inteiro.
- Fornecedor sem escolha mostra **"Selecione"**.

### Ordens de Compras
- Travas para gerar a OC: fornecedor vinculado ao cadastro, razão social,
  **CNPJ válido** e preço em todo item com quantidade.
- **Numeração nunca é calculada no navegador** — vem de
  `/api/ocs/proximo` e `/api/ocs/reservar`, que usam o `Registro_OCs.json`
  compartilhado com o Gerador de OCs (por isso o ambiente isolado da seção 1.1).
- Item com origem `projecao` é recalculado quando o pedido é salvo de novo;
  item incluído à mão sobrevive.
- Ordem já gerada não é sobrescrita pela sincronização.
- Observação fixa do fornecedor entra em toda OC dele, antes da observação da
  ordem.
- Prazos digitados na OC voltam para o cadastro do fornecedor.
- O PDF continua saindo pelo `oc-pdf.js` + `header-img.js`, sem alteração.

### Cadastros
- A planilha `Base_SushiBoulevard.xlsx` é a fonte, compartilhada com o Gerador
  de OCs. Cada gravação reescreve as quatro abas — por isso a fila com debounce
  de 700 ms em vez de um POST por tecla.
- Sair da página com gravação pendente precisa avisar.
- Busca procura em **todos** os campos (produto, fornecedor, unidade / apelido,
  razão, contato, CNPJ, cidade, e-mail) e aceita várias palavras em qualquer
  ordem. Trecho e nome completo funcionam igual.
- **A busca não pode redesenhar o campo de busca** — foi o bug que só deixava
  digitar uma letra. Em React isso deixa de ser possível, mas confira.
- Renomear apelido de fornecedor arrasta os produtos e a observação fixa.
- Coluna **Item do CDE**: vínculo com `dados/vinculos.json`; ao cadastrar um
  produto novo dá para vincular na hora (o catálogo precisa estar salvo antes,
  senão o servidor recusa o vínculo).

### Visão Geral
- **Filtro por casa (a "VISTA")**: a tela inteira recortada pela casa, com a
  mesma forma do dado do servidor; sem casa, a vista É o dado do servidor.
  Trocar de casa não vai ao servidor. O seletor guarda a casa entre trocas de
  mês.
  - A **curva ABC é reclassificada** pela casa (o corte de 80% cai sobre o
    consumo daquela casa — o camarão P é A na rede e C na Umarizal).
  - A **pizza de participação continua sendo a da rede**, e a **minicurva e o
    impacto em reais por insumo são omitidos** com casa escolhida (a série é da
    rede; mostrar ao lado de números de uma casa seria errado).
- Mês em curso é comparado com o **mesmo trecho** do mês anterior (dia 1 ao 16
  contra dia 1 ao 16).
- No cartão de variação, o número grande é a **diferença**; o total vai no
  rodapé.
- **Gráficos dinâmicos**: o destaque (faixa, guia, halo, ponto, rótulo em
  negrito) segue o mouse; o índice sai da posição horizontal arredondada para o
  ponto mais próximo; **nada é redesenhado** no mousemove (redesenhar piscava a
  curva). Em repouso o destaque fica no mês mais recente. Toque também destaca.
- Rosca no modelo de `modelo de grafico de pizza.png`: corte reto radial (não
  ponta arredondada), folga de 2°, raio interno fixo, espessura proporcional à
  fatia, quina levemente arredondada, escala **1.09** no hover com as outras
  fatias em 28% de opacidade e o miolo trocando o total pelo valor da casa.
- Quatro cartões-atalho (Principais insumos, Estoque baixo, Maiores variações,
  Últimos movimentos): clicar abre a seção recolhida correspondente, rola até
  ela e pisca a borda.
- Seções de relatório nascem recolhidas, com estado guardado por seção em
  `localStorage` (`cde_overview_dobras_v1`).
- Custo unitário: `dados/custos.json` primeiro; sem custo lá, o preço do
  catálogo **só** quando o produto é vendido em KG.
- Estoque baixo: mínimo de `dados/parametros.json`; sem mínimo definido, média
  diária da janela × dias de segurança — o texto da nota lê os dois números do
  servidor, nunca fixos.
- Paleta das casas nas variáveis `--casa-sl`, `--casa-dc`, `--casa-dlu`,
  `--casa-dlcn`, com valores próprios em cada tema.

### Movimentações
- Tipos: Entrada (chegada), Saída (transferência), Desperdício, Consumo do dia.
  A linha derivada (salmão equivalente) não aparece — as libragens já estão.
- **Filtro de vários insumos**: guarda as chaves marcadas (lista vazia = todos);
  agrupado como o Lançamento; a consulta só é refeita quando a escolha muda —
  meio segundo depois do último clique, ou na hora se o painel fechar antes;
  clicar fora fecha; um insumo mostra o nome, vários mostram a contagem.
- **Preço unitário** (entrada e transferência):
  - o cadastro guarda **até 10 casas**; o arredondamento é **só visual** —
    depois de Tab/Enter o campo mostra 2 casas; com o foco volta a mostrar o
    valor completo, para ajustar sem relançar; a dica mostra o valor gravado;
  - grava ao sair do campo (e no Enter), não a cada tecla; sair sem mudar o
    número **não grava**;
  - o campo e o **valor total da linha** assentam na hora, sem esperar o
    servidor (que regrava 3 MB no OneDrive); se a gravação falhar, os dois voltam
    ao valor anterior;
  - em branco apaga o cadastro;
  - o placar é recalculado com o que está na tela, sem ir ao servidor (para não
    tirar o foco do próximo campo).
- **Desperdício não recebe preço**: o valor perdido vem do último preço pago
  pelo insumo até a data (da casa, ou da rede quando a casa ainda não comprou).
- CSV leva o preço com até quatro casas.

### Botão de ações (todas as telas)
- `POST /api/movimentacao`: entrada, saída e desperdício **somam** ao que já
  existe no dia; contagem final **substitui**.
- Linha calculada (salmão equivalente) não é destino: a chegada de salmão entra
  na libragem que chegou.
- Conversão rápida usa os mesmos fatores da tela cheia, inclusive a calibração
  salva em `cde_conversor_fatores_v1`, campo a campo (calibração antiga sem o
  bloco do **bandado** usa o padrão, não zero).
- O painel tem que nascer **fechado**: `display:flex` numa classe vence o
  `[hidden]` do HTML, então a regra `.acao-painel[hidden] { display:none }`
  precisa continuar existindo.

### Parâmetros
- Moram aqui só o que o sistema não deduz: mínimo e máximo de estoque por
  insumo e casa, a janela da Projeção e as listas de responsável e fornecedor.
  Meta, custo e rendimento são **calculados de propósito** (a última seção da
  tela explica).
- O digitado é guardado por **(insumo, casa)**, não por posição na tela — o
  filtro redesenha a tabela e não pode perder o que está fora dele.
- Salvar manda o **conjunto inteiro**; campo em branco é informação ("sem mínimo
  definido"). O servidor recusa máximo abaixo do mínimo — mostre a mensagem dele.
- O texto da regra ("média dos últimos N dias × M dias de uso") vem do
  servidor, nunca fixo. O botão de preencher só preenche o que está à vista e
  ainda sem mínimo.

### Qualidade (PCQS)
- Lê o PCQS em **planilha (.xlsx) ou PDF**, como o Importar OC; um arquivo pode
  ter várias conferências (uma aba por recebimento).
- O **cabeçalho é editável** na tela (é o documento de acerto, e custo digitado
  errado viraria cobrança errada); **as caixas não** — peso, lote, sensorial e
  validade saem como a gerência registrou.
- A análise **recalcula** a conformidade a partir dos números medidos; nunca
  copia o "APROVADO" da planilha. Tolerâncias em `pcqs.js`: 0,5% de peso, piso de
  0,300 kg por caixa, validade mínima de 7 dias.
- Supervisor sai do próprio PCQS; os dois gerentes vêm da lista por casa e são
  editáveis. Trocar a loja corrige os gerentes **sem redesenhar** o formulário
  (quem está digitando não pode perder o campo); se a pessoa já digitou um
  gerente, a lista para de mandar naquela conferência.
- Só o que foge do padrão ganha selo na tabela de caixas.

### Menu e tema (todas as telas)
- **Três temas**: `light`, `dark` e `mono` (preto, cinza e branco — pedido da
  direção), na chave `sb_theme_v1`, a mesma do Gerador de OCs. Valor inválido no
  localStorage cai em `light`.
- Menu aberto: seletor de três posições (Claro / Escuro / Mono), cada botão vai
  direto ao tema; menu recolhido: só o ícone, e o clique cicla. O ícone mostra o
  tema em uso.
- Três seções no menu: dia a dia, compras (Ordens primeiro; Projeção e Importar
  abastecem a fila dele; Qualidade fecha o ciclo do salmão) e base.
- Botão **voltar ao topo**: nasce escondido e aparece depois de uma tela de
  rolagem; mora no menu porque o menu está em todas as telas.

### Padrão de texto (manter)
- Nome de tela/módulo em Capitalização de Título: "Visão Geral", "Ordens de
  Compras", "Nova Ordem de Compra".
- Títulos, rótulos, botões, opções, selos e notas com inicial maiúscula.
- Siglas preservadas: OC, CNPJ, PDF, CSV, ABC, CDE, PCQS, R$.
- Mês por extenso capitalizado só quando abre frase ou é rótulo
  ("Agosto/2026"); dentro da frase, minúsculo ("de agosto/2026").

---

## 6. Verificação obrigatória por tela

O sistema não tem suíte de testes; a verificação é feita em navegador de
verdade, **contra o servidor de teste da porta 8936** (seção 1.1). Crie o script
abaixo fora do repositório (na pasta `teste-react`) e rode depois de **cada**
tela migrada.

```python
# checar_telas.py — acusa erro de JavaScript em cada tela, num Chrome real
import io, os, re, subprocess, sys
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "CDE Web")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TELAS = ["overview.html", "index.html", "painel.html", "movimentacoes.html",
         "compras.html", "cadastros.html", "ordens.html", "importar.html",
         "conversao.html", "parametros.html", "qualidade.html", "ajuda.html"]
CACADOR = '''<div id="_diag">sem erro</div>
<script>
window.addEventListener("error", (e) => {
  document.getElementById("_diag").textContent = "ERRO: " + e.message + " (linha " + e.lineno + ")";
});
window.addEventListener("unhandledrejection", (e) => {
  document.getElementById("_diag").textContent = "REJEICAO: " + ((e.reason && e.reason.message) || e.reason);
});
</script>
'''
falhou = False
for tela in TELAS:
    html = io.open(os.path.join(RAIZ, tela), encoding="utf-8").read()
    m = re.search(r'<script src="js/', html)
    alvo = "_diag_" + tela
    io.open(os.path.join(RAIZ, alvo), "w", encoding="utf-8").write(html[:m.start()] + CACADOR + html[m.start():])
    try:
        saida = subprocess.run([CHROME, "--headless=new", "--disable-gpu",
            "--virtual-time-budget=12000", "--dump-dom",
            "http://localhost:8936/" + alvo], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=90).stdout
        achado = re.search(r'id="_diag">([^<]*)', saida or "")
        recado = achado.group(1) if achado else "(marcador não encontrado)"
    finally:
        os.remove(os.path.join(RAIZ, alvo))
    ok = recado.strip() == "sem erro"
    falhou = falhou or not ok
    print("%-22s %s" % (tela, "ok" if ok else recado))
sys.exit(1 if falhou else 0)
```

> Neste PC o Chrome bloqueia `localhost` em algumas configurações. Se o
> `--dump-dom` vier vazio, teste pelo Edge (`msedge.exe`, mesmos parâmetros).

Além disso, para cada tela migrada:

1. **Screenshot antes e depois.** Guarde o print da tela em vanilla antes de
   migrar e compare com o da versão React:
   ```bash
   chrome --headless=new --disable-gpu --hide-scrollbars \
     --virtual-time-budget=12000 --window-size=1500,1080 \
     --screenshot=antes.png "http://localhost:8936/painel.html"
   ```
2. **Conferência de dados na tela**, não só de layout: carregue a mesma data ou
   o mesmo mês nas duas versões e compare os números exibidos.
3. **Interação**: teste o que a tela faz (filtrar, digitar na busca, abrir
   detalhe, salvar). Dá para automatizar carregando a tela num iframe e
   disparando eventos — foi assim que os bugs anteriores apareceram.
4. **Os três temas**: claro, escuro e mono.

Casos que precisam ser reproduzidos à mão, porque já deram erro em produção:
- Lançamento: digitar "14" e sair → "14,000"; final zerado num insumo com
  estoque → célula vermelha com o final esperado; linha do filé de produção ao
  salvar; dia com campo vazio continua vazio depois de salvar.
- Movimentações: digitar 67,3429 e Enter → campo mostra 67,34, total usa
  67,3429, clicar de novo mostra 67,3429; sair sem mudar não grava.
- Faturamento "20.802,90" → R$ 20.802,90 (não R$ 20,80).

### Pronto quando
- O script acima diz `ok` para as doze telas;
- o screenshot da tela migrada é visualmente igual ao de antes, nos três temas;
- os números conferem;
- as interações e os casos à mão funcionam;
- o arquivo antigo foi removido e nenhum HTML aponta mais para ele.

---

## 7. Se travar

- **Erro em uma tela só:** o arquivo antigo ainda existe. Reaponte o HTML para
  ele, siga para a próxima tela e volte depois.
- **Dúvida em regra de negócio:** o arquivo antigo é a especificação. Os
  comentários dele explicam o motivo de cada decisão — leia antes de "melhorar"
  qualquer coisa.
- **Vontade de mudar comportamento no meio da migração:** não. Migração e
  melhoria juntas tornam impossível saber o que quebrou. Anote e faça depois.
- **Vontade de instalar pacote npm:** não. Se algo parece exigir build,
  descreva o problema e pergunte antes.
- **Mudança chegou na `main` durante a migração** (correção feita na produção):
  traga para a branch de teste com `git merge main` e reaplique na tela React
  correspondente — a regra nova entra nesta seção 5 antes do código.

---

## 8. Ao terminar

1. Rode `python recalcular_metas.py --simular` e `python corrigir_lancamentos.py`
   (sem `--gravar`) só para confirmar que os scripts de manutenção continuam
   funcionando — eles não têm relação com o front, mas moram na mesma pasta.
2. Decida e registre se `js/vendor/` entra no git (são 144 KB de biblioteca;
   versionar facilita usar sem internet).
3. Atualize o `ajuda.html` só se algum comportamento de tela mudar. Se a
   migração foi fiel, o manual continua válido.
4. A branch de teste só entra na `main` depois de uso real em paralelo (o
   servidor de teste na 8936 ao lado da produção na 8935) e com a sua
   aprovação. Remova o worktree com `git worktree remove`.
5. Escreva no fim deste arquivo o que ficou pendente e o que foi testado à mão.
