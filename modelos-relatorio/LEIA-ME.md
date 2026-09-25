# Três modelos do Relatório de Recebimento de Salmão (PCQS)

Os três PDFs desta pasta saíram do **mesmo arquivo e dos mesmos números** —
`PCQS-SL-15.09.pdf`, NF 123, YAKUMI, Senador Lemos. O que muda é só o desenho do
documento, para você escolher o que vai para diretoria, gerência e fornecedor.

| Arquivo | Modelo | Ideia | Páginas |
|---|---|---|---|
| `MODELO A - Executivo.pdf` | **Executivo** | A decisão em uma página: conclusão escrita como frase, valor a acertar, três pesos, comparativo e ressalvas. A prova (caixa a caixa, sensorial, critérios) vira anexo. | 2 |
| `MODELO B - Dossie.pdf` | **Dossiê** | O relatório como ato formal: quadro-resumo emoldurado, seções numeradas, grade fechada nas tabelas, termo de ciência e folha de assinatura. | 3 |
| `MODELO C - Painel.pdf` | **Painel** | A conferência lida por gráfico: barra-alvo (faturado × conferido), diferença por caixa e mapa das caixas. Tabelas viram comprovação na 2ª folha. | 2 |

Todos usam a paleta atual do sistema — laranja `#F36F1D`, preto, cinzas, e
verde/vermelho/âmbar como status — e a mesma marca dos PDFs de Ordem de Compra.

## Diferenças que importam na escolha

- **Quem lê rápido** → A. Cabe numa folha, imprime bem em preto e branco e não
  gasta tinta: o laranja aparece num filete e no número do acerto.
- **Quem vai cobrar** → B. É o único com termo de ciência e campo de assinatura
  emoldurado — a folha 3 é a que circula para as três assinaturas antes de o
  valor ser cobrado do fornecedor.
- **Quem vai apresentar** → C. Os três desenhos respondem "faltou peso?", "onde
  faltou?" e "alguma caixa caiu?" antes de qualquer tabela.

## Sobre a cor nos gráficos do Modelo C

Severidade nos gráficos **não** é codificada por matiz: verde e âmbar reprovam no
teste de separação para daltonismo (ΔE 5,2 em protanopia — abaixo do piso de 8).
Os desenhos usam uma rampa de cinza validada (`#ABABAB → #7A7A7A → #1A1A1A`) e
vermelho apenas onde o valor estoura a tolerância, sempre com o número escrito ao
lado. Verde, âmbar e vermelho seguem nos selos e nas tabelas, onde vêm junto com a
palavra — cor nunca é o único portador da informação.

## Para aplicar o escolhido

O código de cada modelo está aqui como `pcqs-modelo-a.js`, `-b.js` e `-c.js`
(mais `marca-lockup.js`, a marca recortada que A e C usam no cabeçalho). Escolhido
um deles, o conteúdo vai para `js/pcqs-pdf.js` — que é o arquivo que a tela
**Qualidade do Salmão** chama no botão "Baixar relatório em PDF" — e esta pasta
pode ser apagada. Nada aqui é carregado pelo sistema hoje.

## Assinaturas

Os três modelos fecham com as mesmas três validações internas, nesta ordem:
**Gerente Suprimentos**, **Gerente Operacional** e **Supervisor Operacional** — o
último já vem preenchido com o "RESPONSÁVEL" que a planilha do PCQS traz. O
fornecedor não assina o relatório: ele recebe o documento já validado pela casa.
Nome de pessoa sai em caixa mista ("Daylson Rodrigues"), não em caixa alta.

Os dois gerentes vêm preenchidos pela casa que recebeu:

| Loja | Gerente Operacional | Gerente Suprimentos |
|---|---|---|
| Senador Lemos, Duque de Caxias | Emesson Soares | José do Couto |
| Delivery Umarizal, Delivery Cidade Nova | Francenilde Moraes | José do Couto |

A lista fica em `js/pcqs.js` (`PCQS_GERENTES_OPERACIONAIS`) — trocou o gerente de
uma loja, troca-se ali e vale para os três modelos. Na aba **Qualidade do Salmão**
os dois nomes continuam editáveis: digitou por cima, a lista para de mandar
naquela conferência, e trocar a loja depois não apaga o que foi digitado.
