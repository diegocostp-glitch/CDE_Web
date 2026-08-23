# Migração do CDE Web para React — instruções de execução

> **Como usar:** copie a pasta do sistema, abra o Claude Code dentro da CÓPIA e diga:
> **"Leia o MIGRACAO-REACT.md e execute a migração, começando pela Etapa 1."**
>
> Este documento é o comando. Ele existe porque uma sessão nova não conhece as
> regras de negócio que estão espalhadas pelas 5.500 linhas de front — e perder
> uma delas é o único risco real desta migração.

---

## 1. Objetivo

Trocar a camada de apresentação (HTML + JS + CSS puros) por **React**, mantendo
o comportamento atual idêntico. Nada de backend, regra de negócio, dado ou
aparência muda.

### Restrições absolutas

| Regra | Por quê |
|---|---|
| **Sem npm, sem `node_modules`, sem etapa de build** | A pasta fica dentro do OneDrive; `node_modules` tem dezenas de milhares de arquivos e a sincronização trava. E o fluxo de manutenção precisa continuar "editar arquivo → F5" |
| **`server.py` não muda** | Ele já é uma API REST com 16 rotas. Serve os arquivos estáticos da própria pasta, então React entra sem tocar nele |
| **`dados/*.json` não são alterados** | São os dados reais da operação: faturamento, consumo, pedidos, ordens |
| **`Servidor.bat` e `Abrir.bat` continuam iguais** | É como as lojas abrem o sistema |
| **As telas antigas continuam funcionando durante a migração** | Uma tela por vez; o arquivo antigo só é removido quando a nova passa na verificação |
| **Não migrar `oc-pdf.js`, `header-img.js`, `importar-pdf.js`** | Geram o PDF idêntico ao do Gerador de OCs, dependem de jsPDF/autoTable/pdf.js globais e não têm interface. Continuam sendo chamados como estão |

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
    formato.js               fmt, reais, curto, pct, parte, brDate, num, chave
    tema.js                   tema claro/escuro (chave sb_theme_v1)
    componentes/
      Sidebar.js              menu lateral com selo de pendentes
      Cartao.js               cartão, cabeça, cartão dobrável
      Placar.js               ficha do placar
      Selo.js                 selo e selo-mini
      Tabela.js               tabela com rolagem
      Aviso.js                aviso flutuante e barra de estado
      Grafico.js              curva suave, sparkline, rosca, barras
      AcoesRapidas.js         botão de ação e os três mini formulários
    telas/
      overview.js  painel.js  lancamento.js  movimentacoes.js
      projecao.js  ordens.js  cadastros.js   importar.js  conversao.js
```

Regras da estrutura:
- **`api.js` é o único lugar com `fetch`.** Hoje as chamadas estão espalhadas
  em 11 arquivos. Uma função por rota, com o nome da rota no nome da função.
- **`formato.js` é o único lugar com `fmt`/`esc`/`num`.** Hoje `fmt` está
  duplicado em 9 arquivos, `esc` e `num` em 7 — foi por causa dessa duplicação
  que incluir o `comum.js` em outra tela derrubava a página (dois `const $`).
- **Nada de variável global.** Módulos ES6 resolvem as colisões de nome que
  hoje derrubam a tela inteira (aconteceu com `const ICO`).

---

## 4. Ordem da migração

Da menor para a maior, porque os componentes compartilhados vão sendo
descobertos no caminho:

| # | Tela | Arquivo atual | Linhas | Observação |
|---|---|---|---|---|
| 1 | Movimentações | `js/movimentacoes.js` | 162 | Prova de conceito: tabela, filtros, fichas clicáveis, CSV |
| 2 | Conversão de Salmão | `js/conversao.js` | 243 | Cálculo puro, sem servidor; fatores no localStorage |
| 3 | Lançamento Diário | `js/app.js` | 306 | Cuidado com o cálculo do uso e os campos travados |
| 4 | Botão de ações | `js/acoes.js` | 406 | Componente global, entra em todas as telas |
| 5 | Painel de Consumo | `js/painel.js` | 428 | Gráficos SVG e as três visões |
| 6 | Projeção de Compras | `js/compras.js` | 484 | Recálculo por tecla, consolidado, split do salmão |
| 7 | Visão Geral | `js/overview.js` | 631 | Rosca, cartões-atalho, seções dobráveis |
| 8 | Cadastros | `js/cadastros.js` | 728 | Gravação com debounce, busca, vínculos |
| 9 | Ordens de Compras | `js/ordens.js` | 737 | **Peça teste de mesa antes de aposentar o antigo** |
| 10 | Importar OC | `js/importar.js` | 584 | **Idem** — depende de arquivo real (planilha e PDF) |

Para cada tela: crie a versão React, verifique (seção 6), e **só então** remova
o arquivo antigo e ajuste o HTML. Se a verificação falhar, o antigo continua
valendo — o sistema nunca fica quebrado no meio do caminho.

---

## 5. Regras de negócio que NÃO podem se perder

Esta é a parte que importa. Cada item abaixo é comportamento atual, testado e
em uso. Antes de migrar uma tela, leia o arquivo antigo inteiro — os comentários
explicam o porquê de cada regra.

### Lançamento Diário
- `uso = inicial + entrada − transferência − final`. **Desperdício não entra no
  uso** — é registrado à parte.
- Estoque inicial vem do dia anterior, calculado pelo servidor. Não recalcular no
  navegador.
- Ordem das colunas: **Inicial → Entrada (chegada) → Saída (transferências) →
  Desperdício → Final → Uso → Coef.**
- Campo com selo `Planilha` é somente leitura. Só outra sincronização muda.
- `salmao_equivalente` é linha derivada: soma das quatro faixas convertidas
  pelos fatores 08/10 = 1.00, 10/12 = 1.25, 12/14 = 1.48, 14/16 = 1.67.
- Uso importado da planilha vence o cálculo (lula, salmão, polvo e atum têm
  rendimento de processamento embutido).
- Sem faturamento não há coeficiente.

### Painel de Consumo
- A situação sai da **média do período**, não do último dia.
- Cores por situação, nos mini gráficos e nos grandes: Crítico = vermelho,
  Atenção = amarelo, Consumo zerado = azul, Normal = verde, Sem dados = cinza.
- O placar conta as séries **sem** aplicar o filtro de situação (senão, ao
  escolher "Atenção", os outros contadores zerariam).
- Metas vêm de `dados/metas.json`, geradas pelo `recalcular_metas.py`.

### Projeção de Compras
- `duração = (estoque + trânsito) ÷ (média diária × fator)`;
  `pedido = (dias a cobrir − duração) × média × fator`.
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
  compartilhado com o Gerador de OCs.
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
- Mês em curso é comparado com o **mesmo trecho** do mês anterior (dia 1 ao 16
  contra dia 1 ao 16).
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
- Mínimo de segurança = consumo médio do dia × `dias_seguranca` (hoje 3).
- Paleta das casas nas variáveis `--casa-sl`, `--casa-dc`, `--casa-dlu`,
  `--casa-dlcn`, com valores próprios no tema escuro.

### Movimentações e botão de ações
- Tipos: Entrada (chegada), Saída (transferência), Desperdício, Consumo do dia.
- No botão de ações, `POST /api/movimentacao`: entrada, saída e desperdício
  **somam** ao que já existe no dia; contagem final **substitui**. Insumo
  travado pela planilha é recusado.
- Conversão rápida usa os mesmos fatores da tela cheia, inclusive a calibração
  salva em `cde_conversor_fatores_v1`.
- O painel tem que nascer **fechado**: `display:flex` numa classe vence o
  `[hidden]` do HTML, então a regra `.acao-painel[hidden] { display:none }`
  precisa continuar existindo.

### Padrão de texto (manter)
- Nome de tela/módulo em Capitalização de Título: "Visão Geral", "Ordens de
  Compras", "Nova Ordem de Compra".
- Títulos, rótulos, botões, opções, selos e notas com inicial maiúscula.
- Siglas preservadas: OC, CNPJ, PDF, CSV, ABC, CDE, R$.
- Mês por extenso capitalizado só quando abre frase ou é rótulo
  ("Agosto/2026"); dentro da frase, minúsculo ("de agosto/2026").

---

## 6. Verificação obrigatória por tela

O sistema não tem suíte de testes; a verificação é feita em navegador de
verdade. Crie o script abaixo (fora da pasta do projeto, num diretório
temporário) e rode depois de **cada** tela migrada.

```python
# checar_telas.py — acusa erro de JavaScript em cada tela, num Chrome real
import io, os, re, subprocess, sys
RAIZ = os.getcwd()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TELAS = ["overview.html", "index.html", "painel.html", "movimentacoes.html",
         "compras.html", "cadastros.html", "ordens.html", "importar.html",
         "conversao.html", "ajuda.html"]
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
    html = io.open(tela, encoding="utf-8").read()
    m = re.search(r'<script src="js/', html)
    alvo = "_diag_" + tela
    io.open(alvo, "w", encoding="utf-8").write(html[:m.start()] + CACADOR + html[m.start():])
    try:
        saida = subprocess.run([CHROME, "--headless=new", "--disable-gpu",
            "--virtual-time-budget=12000", "--dump-dom",
            "http://localhost:8935/" + alvo], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=90).stdout
        achado = re.search(r'id="_diag">([^<]*)', saida or "")
        recado = achado.group(1) if achado else "(marcador não encontrado)"
    finally:
        os.remove(alvo)
    ok = recado.strip() == "sem erro"
    falhou = falhou or not ok
    print("%-22s %s" % (tela, "ok" if ok else recado))
sys.exit(1 if falhou else 0)
```

Além disso, para cada tela migrada:

1. **Screenshot antes e depois.** Guarde o print da tela em vanilla antes de
   migrar e compare com o da versão React:
   ```bash
   chrome --headless=new --disable-gpu --hide-scrollbars \
     --virtual-time-budget=12000 --window-size=1500,1080 \
     --screenshot=antes.png "http://localhost:8935/painel.html"
   ```
2. **Conferência de dados na tela**, não só de layout: carregue a mesma data ou
   o mesmo mês nas duas versões e compare os números exibidos.
3. **Interação**: teste o que a tela faz (filtrar, digitar na busca, abrir
   detalhe, salvar). Dá para automatizar carregando a tela num iframe e
   disparando eventos — foi assim que os bugs anteriores apareceram.
4. **Os dois temas**: claro e escuro (`#btn-tema` no rodapé do menu).

### Pronto quando
- O script acima diz `ok` para as dez telas;
- o screenshot da tela migrada é visualmente igual ao de antes;
- os números conferem;
- as interações funcionam;
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

---

## 8. Ao terminar

1. Rode `python recalcular_metas.py --simular` e `python corrigir_lancamentos.py`
   (sem `--gravar`) só para confirmar que os scripts de manutenção continuam
   funcionando — eles não têm relação com o front, mas moram na mesma pasta.
2. Acrescente ao `.gitignore`: `js/vendor/` é opcional (são 144 KB de
   biblioteca; versionar facilita usar sem internet — decida e registre).
3. Atualize o `ajuda.html` só se algum comportamento de tela mudar. Se a
   migração foi fiel, o manual continua válido.
4. Escreva no fim deste arquivo o que ficou pendente e o que foi testado à mão.
