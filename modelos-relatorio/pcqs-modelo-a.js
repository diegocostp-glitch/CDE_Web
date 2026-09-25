// ============================================================================
// MODELO A — EXECUTIVO
//
// Proposta: a diretoria lê UMA página e decide. A primeira página não é um
// resumo do relatório, é o relatório: a conclusão escrita como frase, o valor a
// acertar, os três pesos que sustentam a frase, o comparativo e as não
// conformidades. Tudo o que é prova — caixa a caixa, sensorial, critérios —
// vira ANEXO, para quem for contestar.
//
// Linguagem visual: papel branco, filetes de cabelo, tipografia fazendo a
// hierarquia. Sem faixa colorida atravessando a folha, sem célula pintada: o
// laranja aparece em um filete e no número do acerto; verde e vermelho só em
// palavra de status. É o registro de quem fala pouco e com precisão — e imprime
// bem em preto e branco, que é como metade dos diretores vai ler.
//
// Mesma paleta do PDF da Ordem de Compra (js/pcqs-pdf.js), mesmos dados.
// ============================================================================
(function () {
  "use strict";

  const COR = {
    laranja: [243, 111, 29],
    preto: [26, 26, 26],
    tinta: [52, 52, 52],
    cinza: [122, 122, 122],
    cinzaClaro: [168, 168, 168],
    filete: [219, 219, 219],
    fundo: [248, 248, 247],
    verde: [26, 150, 84],
    vermelho: [199, 48, 38],
    ambar: [193, 124, 9],
    branco: [255, 255, 255],
  };
  const TOM = { aprovado: COR.verde, ressalva: COR.ambar, reprovado: COR.vermelho };

  const M = 18;                 // margem
  const L = 210 - 2 * M;        // 174 mm de coluna de texto
  const FIM = 272;              // limite do corpo

  const TX = (v) => {
    const s = (v === null || v === undefined) ? "" : String(v).trim();
    return s !== "" ? s : "—";
  };

  function documento(analise, extras) {
    const ex = extras || {};
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const cab = analise.cab || {};
    const tot = analise.tot;
    const fin = analise.financeiro;
    const corTom = TOM[analise.veredito.tipo] || COR.ambar;

    let y = 0;
    // O charSpace do jsPDF fica no estado do documento: passado uma vez, vale
    // para todo texto seguinte. Sem o zero explícito aqui, um rótulo espaçado
    // contamina o parágrafo de baixo — e a linha sai espaçada e estourando a
    // margem. Toda escrita passa por aqui justamente para isso.
    const texto = (t, x, yy, opc) => doc.text(Array.isArray(t) ? t : String(t),
      x, yy, Object.assign({ charSpace: 0 }, opc));
    const fonte = (tam, estilo, cor) => {
      doc.setFontSize(tam);
      doc.setFont("helvetica", estilo || "normal");
      doc.setTextColor(...(cor || COR.tinta));
    };
    const filete = (yy, x1, x2, esp, cor) => {
      doc.setDrawColor(...(cor || COR.filete));
      doc.setLineWidth(esp || 0.2);
      doc.line(x1 === undefined ? M : x1, yy, x2 === undefined ? M + L : x2, yy);
    };
    // Rótulo de campo: o menor tipo do documento, em caixa alta espaçada. É o
    // que deixa ler um dado sem precisar de moldura em volta dele.
    const rotulo = (t, x, yy, alinha) => {
      fonte(5.8, "bold", COR.cinzaClaro);
      texto(String(t).toUpperCase(), x, yy, { charSpace: 0.3, align: alinha });
    };

    // --------------------------------------------------------------- cabeçalho
    const marca = (typeof PCQS_MARCA_IMG !== "undefined") ? PCQS_MARCA_IMG : null;
    if (marca) doc.addImage(marca, "PNG", M, 15, 30, 15);
    else {
      doc.setFillColor(...COR.laranja);
      doc.rect(M, 15, 30, 15, "F");
    }
    rotulo("PCQS · Controle de qualidade do salmão", M + L, 20, "right");
    fonte(7, "normal", COR.cinza);
    texto("Documento emitido em " + new Date().toLocaleDateString("pt-BR") +
          " · uso interno e tratativa com fornecedor", M + L, 25.5, { align: "right" });
    texto("Supervisor responsável: " + (pcqsNomeProprio(cab.responsavel) || "—"),
          M + L, 29.5, { align: "right" });

    y = 43;
    fonte(19, "bold", COR.preto);
    texto("Relatório de recebimento de salmão", M, y);
    y += 7;
    fonte(10, "normal", COR.cinza);
    texto("Salmão " + TX(tot.libragemContratada) + "  ·  Nota fiscal " + TX(cab.nf) +
          "  ·  " + TX(cab.fornecedor) + "  ·  " + TX(cab.loja), M, y);
    y += 5;
    filete(y, M, M + L, 0.8, COR.laranja);
    y += 9;

    // ------------------------------------------------------------- a conclusão
    // O status é palavra, não selo colorido: quadrado pequeno na cor do tom e o
    // nome ao lado. Impresso em preto e branco, continua legível.
    doc.setFillColor(...corTom);
    doc.rect(M, y - 2.6, 2.6, 2.6, "F");
    fonte(7, "bold", corTom);
    texto(analise.veredito.rotulo, M + 4.5, y, { charSpace: 0.3 });
    y += 6;

    const frase = analise.veredito.tipo === "aprovado"
      ? "Recebimento conforme: peso, libragem e avaliação sensorial dentro do contratado."
      : (analise.veredito.tipo === "reprovado"
        ? "Recebimento reprovado. " + primeiraGrave(analise) + " " + fraseDoDinheiro(analise, tot)
        : "Recebimento aprovado com ressalvas. " + fraseDoDinheiro(analise, tot));
    fonte(13.5, "normal", COR.preto);
    const linhasFrase = doc.splitTextToSize(frase, L);
    texto(linhasFrase, M, y);
    y += linhasFrase.length * 6 + 6;

    // ----------------------------------------------------------- três números
    const largC = L / 3;
    const numeros = [
      { r: "Peso faturado (NF)", v: pcqsKg(tot.pesoNF), n: TX(cab.caixasNF) + " caixas · " +
          pcqsPcs(tot.peixesEtiqueta), cor: COR.preto },
      { r: "Peso conferido na loja", v: pcqsKg(tot.pesoRecebido), n: tot.caixas +
          " caixas pesadas · " + pcqsPcs(tot.peixesFisico), cor: COR.preto },
      { r: "Divergência", v: pcqsSinalKg(tot.difPeso),
        n: pcqsFmt(tot.difPesoPerc, 2) + "% · tolerância " + pcqsKg(tot.tolTotal),
        cor: Math.abs(tot.difPeso) > tot.tolTotal ? COR.vermelho : COR.verde },
    ];
    filete(y, M, M + L, 0.4, COR.preto);
    numeros.forEach((c, i) => {
      const x = M + i * largC;
      if (i) filete(y, x, x, 0);                       // nada: a divisória é vertical
      if (i) {
        doc.setDrawColor(...COR.filete);
        doc.setLineWidth(0.2);
        doc.line(x - 4, y + 2, x - 4, y + 19);
      }
      rotulo(c.r, x, y + 6);
      fonte(15, "bold", c.cor);
      texto(c.v, x, y + 14);
      fonte(6.4, "normal", COR.cinza);
      texto(c.n, x, y + 18.5);
    });
    y += 22;
    filete(y, M, M + L, 0.2);
    y += 8;

    // ------------------------------------------------------- valor a acertar
    rotulo("Valor a acertar", M, y);
    fonte(24, "bold", fin.valor > 0 ? COR.laranja : COR.verde);
    texto(pcqsRs(fin.valor), M, y + 10);
    fonte(8, "bold", COR.preto);
    texto(fin.rotulo, M + L, y + 4, { align: "right" });
    fonte(7, "normal", COR.cinza);
    const linhasFin = doc.splitTextToSize(fin.frase, L - 62);
    texto(linhasFin.slice(0, 3), M + 62, y + 9);
    y += Math.max(15, linhasFin.length * 3.4 + 8);
    filete(y, M, M + L, 0.2);
    y += 9;

    // ---------------------------------------------------------- comparativo
    rotulo("Nota fiscal × conferido na loja", M, y);
    y += 3;
    const col = [M, M + 76, M + 108, M + 140, M + L];
    filete(y, M, M + L, 0.4, COR.preto);
    y += 4.5;
    rotulo("Indicador", col[0], y);
    rotulo("NF / etiquetas", col[2] - 2, y, "right");
    rotulo("Conferido", col[3] - 2, y, "right");
    rotulo("Diferença", col[4], y, "right");
    y += 2;
    filete(y, M, M + L, 0.2);

    analise.comparativo.forEach((l) => {
      y += 6.6;
      fonte(8.2, "normal", COR.tinta);
      texto(l.indicador, col[0], y);
      fonte(8.2, "bold", COR.preto);
      texto(valorDe(l, "nf"), col[2] - 2, y, { align: "right" });
      texto(valorDe(l, "rec"), col[3] - 2, y, { align: "right" });
      fonte(8.2, "bold", l.ok ? COR.tinta : COR.vermelho);
      texto(difDe(l), col[4], y, { align: "right" });
      if (!l.ok) {                                     // marca discreta na margem
        doc.setFillColor(...COR.vermelho);
        doc.rect(M - 3.4, y - 1.6, 1.4, 1.4, "F");
      }
      y += 2.2;
      filete(y, M, M + L, 0.2);
    });
    y += 3.5;
    const notas = analise.comparativo.filter((l) => l.nota).map((l) => "— " + l.nota);
    if (notas.length) {
      fonte(6.4, "italic", COR.cinzaClaro);
      texto(notas, M, y);
      y += notas.length * 2.9;
    }
    y += 7;

    // ------------------------------------------------------ não conformidades
    rotulo("Não conformidades apuradas", M, y);
    y += 3;
    filete(y, M, M + L, 0.4, COR.preto);
    y += 6;
    if (!analise.ncs.length) {
      fonte(9, "normal", COR.verde);
      texto("Nenhuma não conformidade apurada nesta entrega.", M, y);
      y += 6;
    }
    analise.ncs.forEach((n, i) => {
      const grave = n.gravidade === "alta";
      const cor = grave ? COR.vermelho : COR.ambar;
      fonte(7.2, "normal", COR.tinta);
      const det = doc.splitTextToSize(n.detalhe, L - 14);
      const alt = 5.5 + det.length * 3.2 + (n.caixas.length ? 3.4 : 0) + 3.5;
      if (y + alt > FIM) { anexo(doc, cab, analise); y = 34; }
      fonte(12, "bold", COR.cinzaClaro);       // numeral de apoio, mas legível
      texto(String(i + 1).padStart(2, "0"), M, y + 1.5);
      fonte(8.6, "bold", COR.preto);
      texto(n.titulo, M + 10, y);
      fonte(6.2, "bold", cor);
      texto(grave ? "TRATATIVA IMEDIATA" : "RESSALVA", M + L, y, { align: "right", charSpace: 0.2 });
      fonte(7.2, "normal", COR.tinta);
      texto(det, M + 10, y + 4.4);
      let yy = y + 4.4 + det.length * 3.2;
      if (n.caixas.length) {
        fonte(6.4, "italic", COR.cinza);
        texto("Caixas " + n.caixas.join(", "), M + 10, yy + 0.8);
        yy += 3.4;
      }
      y = yy + 3.5;
      filete(y - 1.5, M, M + L, 0.2);
    });

    // ------------------------------------------------------------- anexo
    anexo(doc, cab, analise);
    y = 34;

    rotulo("Anexo I · Conferência de peso, caixa a caixa", M, y);
    y += 3;
    y = tabelaPeso(doc, analise, y);
    y += 9;
    rotulo("Anexo II · Avaliação sensorial, gelo e validade", M, y);
    y += 3;
    y = tabelaSensorial(doc, analise, y);
    y += 9;

    const obs = [].concat(analise.observacoes || [])
      .concat(ex.obs ? [ex.obs] : []).filter((o) => String(o).trim());
    if (obs.length) {
      if (y > FIM - 24) { anexo(doc, cab, analise); y = 34; }
      rotulo("Observações da conferência", M, y);
      fonte(7.8, "normal", COR.tinta);
      const lo = doc.splitTextToSize(obs.join("   ·   "), L);
      texto(lo, M, y + 5);
      y += 5 + lo.length * 3.5 + 8;
    }

    // critérios: a régua que sustenta cada número acima
    const criterios = listaDeCriterios(analise, tot);
    fonte(6.8, "normal", COR.cinza);
    const lc = [];
    criterios.forEach((c) => doc.splitTextToSize("— " + c, L).forEach((l) => lc.push(l)));
    if (y + 6 + lc.length * 3 + 30 > FIM) { anexo(doc, cab, analise); y = 34; }
    rotulo("Critérios aplicados nesta conferência", M, y);
    fonte(6.8, "normal", COR.cinza);
    texto(lc, M, y + 5);
    y += 5 + lc.length * 3 + 12;

    // assinaturas
    rotulo("Validação", M, y);
    y += 14;
    // Quem valida e a casa: suprimentos, operacao e o supervisor que recebeu. O
    // fornecedor nao assina o relatorio — ele recebe o resultado ja validado.
    const assin = [
      { nome: ex.assSuprimentos, papel: "Gerente suprimentos" },
      { nome: ex.assOperacional, papel: "Gerente operacional" },
      { nome: ex.assSupervisor || cab.responsavel, papel: "Supervisor operacional" },
    ];
    const largA = L / 3;
    assin.forEach((a, i) => {
      const x = M + i * largA;
      fonte(8.5, "normal", COR.preto);
      // Campo sem nome digitado fica em branco: linha para assinar a mao e
      // melhor que um travessao no lugar de quem vai assinar.
      texto(pcqsNomeProprio(a.nome), x, y);
      filete(y + 2.5, x, x + largA - 10, 0.2);
      fonte(6.2, "bold", COR.cinzaClaro);
      texto(a.papel.toUpperCase(), x, y + 6, { charSpace: 0.25 });
    });

    rodape(doc, cab, tot);
    return doc;

    // ------------------------------------------------------------- auxiliares
    function valorDe(l, qual) {
      const v = l[qual];
      if (l.tipo === "texto") return TX(v);
      if (l.tipo === "rs") return pcqsRs(v);
      if (l.tipo === "pcs") return pcqsPcs(v);
      if (l.tipo === "qtd") return pcqsFmt(v, 0);
      return pcqsKg(v);
    }
    function difDe(l) {
      if (l.tipo === "texto") return l.ok ? "—" : "divergente";
      if (l.tipo === "rs") return pcqsSinalRs(l.dif);
      if (l.tipo === "pcs") return pcqsSinalPcs(l.dif);
      if (l.tipo === "qtd") return (l.dif > 0 ? "+" : "") + pcqsFmt(l.dif, 0);
      return pcqsSinalKg(l.dif);
    }
    function tabelaPeso(d, a, yy) {
      const temBruto = a.caixas.some((c) => c.pesoBruto > 0);
      const cabeca = ["CX", "LOTE", "LIBRAGEM", "PEIXES"]
        .concat(temBruto ? ["PESO BRUTO"] : [])
        .concat(["PESO ETIQUETA", "PESO FÍSICO", "DIFERENÇA", "PESO MÉDIO", ""]);
      d.autoTable({
        startY: yy,
        head: [cabeca],
        body: a.caixas.map((c) => [String(c.n).padStart(2, "0"), TX(c.lote),
          TX(c.libragemConf || c.libragemEtiqueta), pcqsFmt(c.peixes, 0)]
          .concat(temBruto ? [c.pesoBruto ? pcqsKg(c.pesoBruto) : "—"] : [])
          .concat([pcqsKg(c.pesoLiquido), pcqsKg(c.pesoFisico), pcqsSinalKg(c.difEtiqueta),
                   pcqsKg(c.pesoMedio), c.ok ? "" : (c.reprovada ? "reprovada" : "divergente")])),
        foot: [["", "TOTAIS", "", pcqsFmt(a.tot.peixes, 0)]
          .concat(temBruto ? [""] : [])
          .concat([pcqsKg(a.tot.pesoEtiquetas), pcqsKg(a.tot.pesoRecebido),
                   pcqsSinalKg(a.tot.pesoEtiquetas ? a.tot.pesoRecebido - a.tot.pesoEtiquetas : 0),
                   pcqsKg(a.tot.pesoMedioRecebido), ""])],
        theme: "plain",
        headStyles: { textColor: COR.cinzaClaro, fontStyle: "bold", fontSize: 5.8,
                      halign: "center", cellPadding: { top: 1.6, bottom: 1.6 } },
        footStyles: { textColor: COR.preto, fontStyle: "bold", fontSize: 7, halign: "center" },
        styles: { fontSize: 7.4, textColor: COR.tinta, cellPadding: { top: 1.9, bottom: 1.9 },
                  halign: "center", valign: "middle", lineColor: COR.filete, lineWidth: 0 },
        columnStyles: { 0: { cellWidth: 9, fontStyle: "bold", textColor: COR.preto } },
        margin: { left: M, right: M },
        // Filete embaixo de cada linha e régua preta no cabeçalho: a grade
        // inteira desenhada pesaria mais que os números.
        didDrawCell: (dd) => {
          const b = dd.cell;
          d.setLineWidth(dd.section === "head" ? 0.4 : 0.2);
          d.setDrawColor(...(dd.section === "head" ? COR.preto : COR.filete));
          d.line(b.x, b.y + b.height, b.x + b.width, b.y + b.height);
          if (dd.section === "head") {
            d.setLineWidth(0.4); d.setDrawColor(...COR.preto);
            d.line(b.x, b.y, b.x + b.width, b.y);
          }
        },
        didParseCell: (dd) => {
          if (dd.section !== "body") return;
          const c = a.caixas[dd.row.index];
          const ult = cabeca.length - 1;
          if (dd.column.index === ult) {
            dd.cell.styles.fontSize = 6.2;
            dd.cell.styles.fontStyle = "bold";
            dd.cell.styles.textColor = c.reprovada ? COR.vermelho : COR.ambar;
          }
          if (dd.column.index === ult - 2 && c.pesoDivergente) dd.cell.styles.textColor = COR.vermelho;
          if (dd.column.index === ult - 1 && c.foraDaFaixa) dd.cell.styles.textColor = COR.vermelho;
        },
      });
      return d.lastAutoTable.finalY;
    }
    function tabelaSensorial(d, a, yy) {
      const temMotivo = a.caixas.some((c) => c.motivo);
      const cabeca = ["CX", "ODOR", "VISUAL", "FIBRA", "GELO", "VALIDADE", "DIAS", "STATUS"]
        .concat(temMotivo ? ["MOTIVO DA REPROVAÇÃO"] : []);
      d.autoTable({
        startY: yy,
        head: [cabeca],
        body: a.caixas.map((c) => [String(c.n).padStart(2, "0"), TX(c.odor), TX(c.visual),
          TX(c.fibra), TX(c.gelo), TX(c.validade),
          c.diasValidade === null ? "—" : String(c.diasValidade), TX(c.status || c.veredito)]
          .concat(temMotivo ? [TX(c.motivo)] : [])),
        theme: "plain",
        headStyles: { textColor: COR.cinzaClaro, fontStyle: "bold", fontSize: 5.8,
                      halign: "center", cellPadding: { top: 1.6, bottom: 1.6 } },
        styles: { fontSize: 7, textColor: COR.tinta, cellPadding: { top: 1.9, bottom: 1.9 },
                  halign: "center", valign: "middle" },
        columnStyles: temMotivo
          ? { 0: { cellWidth: 9, fontStyle: "bold", textColor: COR.preto }, 4: { cellWidth: 32 },
              6: { cellWidth: 10 }, 8: { cellWidth: 30 } }
          : { 0: { cellWidth: 9, fontStyle: "bold", textColor: COR.preto }, 4: { cellWidth: 40 },
              6: { cellWidth: 12 } },
        margin: { left: M, right: M },
        didDrawCell: (dd) => {
          const b = dd.cell;
          d.setLineWidth(dd.section === "head" ? 0.4 : 0.2);
          d.setDrawColor(...(dd.section === "head" ? COR.preto : COR.filete));
          d.line(b.x, b.y + b.height, b.x + b.width, b.y + b.height);
          if (dd.section === "head") d.line(b.x, b.y, b.x + b.width, b.y);
        },
        didParseCell: (dd) => {
          if (dd.section !== "body") return;
          const c = a.caixas[dd.row.index];
          const tipos = { 1: c.odorTipo, 2: c.visualTipo, 3: c.fibraTipo, 4: c.geloTipo };
          const t = tipos[dd.column.index];
          if (t === "ruim") { dd.cell.styles.textColor = COR.vermelho; dd.cell.styles.fontStyle = "bold"; }
          else if (t === "duvida") dd.cell.styles.textColor = COR.ambar;
          if (dd.column.index === 6 && c.validadeCurta) {
            dd.cell.styles.textColor = COR.vermelho; dd.cell.styles.fontStyle = "bold";
          }
          if (dd.column.index === 7) {
            dd.cell.styles.fontStyle = "bold";
            dd.cell.styles.textColor = c.reprovada ? COR.vermelho : COR.verde;
          }
        },
      });
      return d.lastAutoTable.finalY;
    }
    // Folha seguinte: cabeçalho magro, só para quem folheou até ali saber de
    // que documento esta folha saiu. Serve tanto para a continuação da lista
    // quanto para os anexos — o que a folha traz é o rótulo da seção que diz.
    function anexo(d, c, a) {
      d.addPage();
      fonte(6.2, "bold", COR.cinzaClaro);
      texto("RELATÓRIO DE RECEBIMENTO DE SALMÃO", M, 18, { charSpace: 0.3 });
      fonte(6.2, "normal", COR.cinza);
      texto("NF " + TX(c.nf) + " · " + TX(c.fornecedor) + " · " + TX(c.loja) +
            " · " + TX(c.entrega), M + L, 18, { align: "right" });
      d.setDrawColor(...COR.laranja);
      d.setLineWidth(0.5);
      d.line(M, 21, M + L, 21);
    }
    function rodape(d, c, t) {
      const total = d.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        d.setPage(p);
        d.setDrawColor(...COR.filete);
        d.setLineWidth(0.2);
        d.line(M, 282, M + L, 282);
        fonte(5.8, "normal", COR.cinzaClaro);
        texto("PCQS · Relatório de recebimento de salmão · " + TX(c.loja) + " · NF " + TX(c.nf) +
              " · custo real " + pcqsRs(t.custoReal) + "/Kg", M, 286);
        texto(p + " / " + total, M + L, 286, { align: "right" });
      }
    }
  }

  function primeiraGrave(analise) {
    const g = analise.ncs.find((n) => n.gravidade === "alta");
    return g ? g.titulo + "." : "";
  }
  function fraseDoDinheiro(analise, tot) {
    if (analise.financeiro.direcao === "fornecedor") {
      return "A loja recebeu " + pcqsKg(Math.abs(tot.difPeso)) + " abaixo da nota fiscal e há " +
             pcqsRs(analise.financeiro.valor) + " a creditar pelo fornecedor.";
    }
    if (analise.financeiro.direcao === "loja") {
      return "A loja recebeu " + pcqsKg(tot.difPeso) + " acima da nota fiscal e há " +
             pcqsRs(analise.financeiro.valor) + " a complementar.";
    }
    return "Peso faturado e peso conferido fecham dentro da tolerância.";
  }
  function listaDeCriterios(analise, tot) {
    const aj = analise.ajustes;
    return [
      "Tolerância de peso: " + pcqsFmt(aj.tolPesoPerc, 2) + "% do peso faturado (" +
        pcqsKg(tot.tolTotal) + ") e, por caixa, o maior valor entre " +
        pcqsFmt(aj.tolPesoPerc, 2) + "% e " + pcqsKg(aj.tolPesoKg) + ".",
      "Peso conferido: soma do peso físico medido na loja, caixa por caixa, na presença do entregador.",
      tot.faixaContratada ? "Libragem " + tot.libragemContratada + ": cada peixe deve pesar de " +
        pcqsFmt(tot.faixaContratada.min, 3) + " a " + pcqsFmt(tot.faixaContratada.max, 3) +
        " Kg (" + tot.faixaContratada.lbMin + " a " + tot.faixaContratada.lbMax + " libras)."
        : "Libragem contratada não informada na planilha.",
      "Validade mínima aceita no recebimento: " + aj.validadeMinDias + " dias.",
      "Custo unitário real: " + pcqsRs(tot.custo) + "/Kg faturados sobre o peso recebido = " +
        pcqsRs(tot.custoReal) + "/Kg (" + pcqsSinalRs(tot.custoDif) + "/Kg).",
      "Acerto financeiro: divergência de peso × custo unitário da nota fiscal.",
    ];
  }

  window.PCQS_MODELO_A = documento;
  if (typeof module !== "undefined" && module.exports) module.exports = documento;
})();
