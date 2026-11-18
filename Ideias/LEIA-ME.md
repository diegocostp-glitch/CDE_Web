# Novos modelos de Ordem de Compra

Três propostas de PDF para a OC, todas montadas com **a mesma ordem de exemplo**
(nº 1306, Senador Lemos, 12 itens e uma observação), para comparar só o desenho.
`MODELO ATUAL - para comparar.pdf` é a OC de hoje com os mesmos dados.

O fornecedor e os preços são **fictícios** ("PESCADOS DO NORTE … (EXEMPLO)"): os
PDFs podem circular sem expor preço negociado. A unidade compradora é a real —
é o que sai em toda OC.

| Arquivo | Modelo | A referência ao sushi | Para quem |
|---|---|---|---|
| `MODELO A - Noren.pdf` | **Noren** | A faixa laranja da capa vira a cortina da porta do restaurante (*noren*): fendas que dividem os painéis e, ao fundo, ondas *seigaiha* num tom quase igual ao laranja. O total leva um carimbo quadrado de borda dupla, como o *hanko* de quem aprova. | Quem quer a cara mais próxima da OC atual, com a marca forte. |
| `MODELO B - Makisu.pdf` | **Makisu** | No alto, a esteira de bambu de enrolar sushi (*makisu*) em listras claras, amarrada por dois fios laranja. As datas numa faixa escura que envolve a folha como o *nori* envolve o arroz. | Quem imprime: quase sem tinta, tabela só com linhas. Traz o campo **Recebido por / Data e hora** para a conferência na entrega. |
| `MODELO C - Omakase.pdf` | **Omakase** | A OC com cara de cardápio da casa: cabeçalho em tom de arroz, o símbolo SB dentro de um *ensō* (o círculo de um traço só, a pincel), o número num carimbo vertical, itens em linhas pontilhadas e total com régua dupla, como a conta. | Quem quer a imagem mais elegante para o fornecedor. |

## O que muda nos três, em relação à OC atual

- **Capa nova**, desenhada no próprio PDF (sem foto): o arquivo caiu de ~505 KB
  para 29–88 KB — anexa em qualquer e-mail e WhatsApp.
- **Datas em destaque** logo abaixo da capa: emissão, previsão de entrega e
  horário de recebimento, que hoje ficam em letra pequena dentro do laranja.
- **Comprador e fornecedor lado a lado**: sobra espaço para os itens; uma OC de
  12 itens com observação cabe numa folha só.
- **Avisos institucionais no rodapé de todas as folhas.** Numa OC cheia eles
  caíam sozinhos na última página; agora quem separa uma folha para o estoque
  também lê o aviso de CNPJ.
- **Paginação** ("Página 1 de 3") e faixa de **continuação** com o número da
  ordem nas folhas seguintes; o cabeçalho da tabela se repete em cada folha.
- Unidade de compra numa linha só ("CAIXA C/10 PACOTES" não quebra mais).

O conteúdo é o mesmo da OC atual: os mesmos campos, os mesmos três avisos e o
mesmo nome de arquivo (`OC - 1306 - … - 28.10.2026`).

## Como adotar um modelo

Cada `oc-modelo-*.js` substitui `js/oc-pdf.js` inteiro — mesma função
`montarPDF(oc, previa)`, mesmo `nomeArquivoOC`. Em `ordens.html`:

1. trocar `<script src="js/oc-pdf.js">` pelo modelo escolhido (copiado para `js/`);
2. trocar `<script src="js/header-img.js">` por `oc-marca.js` (a marca recortada
   da capa atual e o símbolo SB).

O Gerador de OCs tem a sua cópia do PDF; para as duas OCs continuarem
idênticas ao fornecedor, o modelo escolhido entra nos dois sistemas.

## Arquivos

- `oc-modelo-a-noren.js`, `oc-modelo-b-makisu.js`, `oc-modelo-c-omakase.js` — os modelos.
- `oc-marca.js` — `OC_MARCA_IMG` (bloco laranja com o logo, recortado da capa
  atual) e `OC_SIMBOLO_IMG` (símbolo SB sem fundo, de `logo_aba.png`).

## Outras propostas nesta pasta

`PCQS - Recebimento de Salmão/` — os três desenhos do relatório de recebimento
de salmão (Executivo, Dossiê e Painel), de 18/09/2026, que antes ficavam em
`modelos-relatorio/`. Nenhum foi adotado: o relatório em uso continua sendo o
de `js/pcqs-pdf.js`.
