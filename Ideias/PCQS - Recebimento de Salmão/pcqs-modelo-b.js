// ============================================================================
// MODELO B — DOSSIÊ
//
// Proposta: o relatório como ATO formal, não como apresentação. É o modelo para
// quando a divergência vai virar cobrança — o documento que a diretoria arquiva
// e o fornecedor assina. Seções numeradas, quadro-resumo emoldurado no alto, tabelas com grade fechada, termo de ciência e três campos de assinatura.
//
// Linguagem visual: a mesma capa laranja da Ordem de Compra (o fornecedor
// reconhece o remetente), barras de seção pretas com o número em laranja, e
// moldura em tudo o que é dado — a estética do documento fiscal, onde o valor
// vem dentro de um quadro e não solto na página. Denso de propósito: aqui
// ninguém está folheando, está conferindo.
// ============================================================================
(function () {
  "use strict";

  const COR = {
    laranja: [243, 111, 29],
    preto: [26, 26, 26],
    tinta: [50, 50, 50],
    cinza: [115, 115, 115],
    cinzaClaro: [155, 155, 155],
    borda: [176, 176, 176],
    grade: [206, 206, 206],
    fundo: [245, 245, 244],
    verde: [26, 150, 84],
    vermelho: [199, 48, 38],
    ambar: [193, 124, 9],
    branco: [255, 255, 255],
  };
  const TOM = { aprovado: COR.verde, ressalva: COR.ambar, reprovado: COR.vermelho };

  const M = 15;
  const L = 180;
  const FIM = 274;

  const TX = (v) => {
    const s = (v === null || v === undefined) ? "" : String(v).trim();
    return s !== "" ? String(s).toUpperCase() : "—";
  };

  function documento(analise, extras) {
    const ex = extras || {};
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const cab = analise.cab || {};
    const tot = analise.tot;
    const fin = analise.financeiro;
    const corTom = TOM[analise.veredito.tipo] || COR.ambar;
    // Identificação do documento: é por este número que a tratativa é cobrada
    // depois, no telefone e no e-mail.
    const docId = "PCQS " + (String(cab.nf || "SN").replace(/\D/g, "") || "SN") + "/" +
      (String(cab.loja || "").split(/\s+/).map((p) => p[0]).join("").toUpperCase() || "LJ");

    let y = 0, secaoN = 0;
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
    const moldura = (x, yy, larg, alt, preenche) => {
      if (preenche) { doc.setFillColor(...preenche); doc.rect(x, yy, larg, alt, "F"); }
      doc.setDrawColor(...COR.borda);
      doc.setLineWidth(0.3);
      doc.rect(x, yy, larg, alt);
    };
    const quebra = (alt) => { if (y + alt > FIM) { doc.addPage(); y = 22; } };
    // Barra de seção: número em laranja, título em branco sobre preto. É o que
    // deixa citar "item 4 do relatório" numa reunião.
    const secao = (titulo, altura) => {
      secaoN += 1;
      // A barra preta só desce se o conteúdo dela também couber: título de
      // seção sozinho no pé da página é o erro clássico deste tipo de relatório.
      quebra(6.4 + 4 + (altura || 14));
      doc.setFillColor(...COR.preto);
      doc.rect(M, y, L, 6.4, "F");
      fonte(9, "bold", COR.laranja);
      texto(String(secaoN), M + 3.5, y + 4.5);
      fonte(7.6, "bold", COR.branco);
      texto(String(titulo).toUpperCase(), M + 10, y + 4.4, { charSpace: 0.25 });
      y += 6.4 + 3.2;
    };
    const campo = (rot, val, x, yy, larg, tam) => {
      fonte(5.5, "bold", COR.cinzaClaro);
      texto(String(rot).toUpperCase(), x, yy, { charSpace: 0.2 });
      fonte(tam || 8, "bold", COR.preto);
      texto(doc.splitTextToSize(TX(val), larg)[0], x, yy + 4.2);
    };

    // ------------------------------------------------------------------ capa
    const capa = (typeof DEFAULT_HEADER_IMG !== "undefined") ? DEFAULT_HEADER_IMG : null;
    if (capa) doc.addImage(capa, /image\/jpe?g/.test(capa) ? "JPEG" : "PNG", 0, 0, 210, 45);
    else { doc.setFillColor(...COR.laranja); doc.rect(0, 0, 210, 45, "F"); }
    fonte(13, "bold", COR.branco);
    texto("RELATÓRIO DE RECEBIMENTO DE SALMÃO", 195, 16, { align: "right" });
    fonte(8.5, "bold", COR.branco);
    texto("PCQS · CONTROLE DE QUALIDADE DO SALMÃO", 195, 22, { align: "right" });
    doc.setFillColor(...COR.preto);
    doc.rect(118, 27, 77, 12, "F");
    fonte(7, "bold", COR.branco);
    texto("DOCUMENTO Nº " + docId, 122, 32);
    fonte(6.4, "normal", COR.branco);
    texto("Emitido em " + new Date().toLocaleDateString("pt-BR") +
          " · supervisor responsável " + (pcqsNomeProprio(cab.responsavel) || "—"),
          122, 36.5);

    y = 52;

    // ---------------------------------------------------------- quadro resumo
    fonte(6.2, "bold", COR.cinza);
    texto("QUADRO RESUMO DO RECEBIMENTO", M, y, { charSpace: 0.3 });
    y += 2.5;
    const altQ = 32, largStatus = 46;
    moldura(M, y, L, altQ, COR.fundo);
    doc.setFillColor(...corTom);
    doc.rect(M + L - largStatus, y, largStatus, altQ, "F");
    const rotSt = analise.veredito.rotulo;
    fonte(rotSt.length > 12 ? 9 : 13, "bold", COR.branco);
    doc.splitTextToSize(rotSt, largStatus - 8).forEach((l, i) =>
      texto(l, M + L - largStatus / 2, y + 11 + i * 5, { align: "center" }));
    fonte(6, "normal", COR.branco);
    texto(analise.ncs.length
      ? analise.ncs.length + (analise.ncs.length > 1 ? " não conformidades" : " não conformidade")
      : "sem não conformidades", M + L - largStatus / 2, y + altQ - 6, { align: "center" });

    const colQ = [M + 4, M + 48, M + 92];
    campo("Loja / unidade", cab.loja, colQ[0], y + 6, 42);
    campo("Nota fiscal", cab.nf, colQ[1], y + 6, 40);
    campo("Fornecedor", cab.fornecedor, colQ[2], y + 6, 38);
    campo("Data/hora da entrega", cab.entrega, colQ[0], y + 16, 42, 7.5);
    campo("Validade (NF)", cab.validade, colQ[1], y + 16, 40, 7.5);
    campo("Libragem contratada", tot.libragemContratada, colQ[2], y + 16, 38, 7.5);
    campo("Caixas (NF / conferidas)", TX(cab.caixasNF) + " / " + tot.caixas, colQ[0], y + 25, 42, 7.5);
    campo("Peso faturado", pcqsKg(tot.pesoNF), colQ[1], y + 25, 40, 7.5);
    campo("Custo unitário (NF)", pcqsRs(tot.custo) + "/Kg", colQ[2], y + 25, 38, 7.5);
    y += altQ + 8;

    // ----------------------------------------------- 1 situação do recebimento
    secao("Situação do recebimento", 34);
    const cx = (L - 2 * 3) / 3;
    const celulas = [
      { r: "Peso faturado (NF)", v: pcqsKg(tot.pesoNF), n: "conforme nota fiscal", cor: COR.preto },
      { r: "Peso conferido na loja", v: pcqsKg(tot.pesoRecebido),
        n: tot.caixas + " caixas pesadas", cor: COR.preto },
      { r: "Divergência apurada", v: pcqsSinalKg(tot.difPeso),
        n: pcqsFmt(tot.difPesoPerc, 2) + "% · tolerância " + pcqsKg(tot.tolTotal),
        cor: Math.abs(tot.difPeso) > tot.tolTotal ? COR.vermelho : COR.verde },
    ];
    celulas.forEach((c, i) => {
      const x = M + i * (cx + 3);
      moldura(x, y, cx, 20, COR.branco);
      fonte(5.5, "bold", COR.cinzaClaro);
      texto(c.r.toUpperCase(), x + 3, y + 5, { charSpace: 0.2 });
      fonte(13, "bold", c.cor);
      texto(c.v, x + 3, y + 13);
      fonte(6, "normal", COR.cinza);
      texto(c.n, x + 3, y + 17.5);
    });
    y += 20 + 5;
    fonte(8, "normal", COR.tinta);
    const lr = doc.splitTextToSize(analise.veredito.resumo + " " + fin.frase, L);
    texto(lr, M, y + 2);
    y += lr.length * 3.8 + 6;

    // ---------------------------------------------------------- 2 comparativo
    secao("Comparativo — nota fiscal × conferido na loja", 26);
    doc.autoTable({
      startY: y,
      head: [["INDICADOR", "NOTA FISCAL / ETIQUETAS", "CONFERIDO NA LOJA", "DIFERENÇA", "SITUAÇÃO"]],
      body: analise.comparativo.map((l) => [l.indicador, valorDe(l, "nf"), valorDe(l, "rec"),
                                            difDe(l), l.ok ? "CONFORME" : "DIVERGENTE"]),
      theme: "grid",
      headStyles: { fillColor: COR.fundo, textColor: COR.preto, fontStyle: "bold",
                    halign: "center", fontSize: 6.4, cellPadding: 2, lineColor: COR.borda,
                    lineWidth: 0.3 },
      styles: { fontSize: 7.6, textColor: COR.tinta, lineColor: COR.grade, lineWidth: 0.2,
                cellPadding: 2, valign: "middle" },
      columnStyles: { 0: { halign: "left", cellWidth: 58 }, 1: { halign: "center", fontStyle: "bold" },
                      2: { halign: "center", fontStyle: "bold" },
                      3: { halign: "center", cellWidth: 26, fontStyle: "bold" },
                      4: { halign: "center", cellWidth: 26, fontSize: 6.2, fontStyle: "bold" } },
      margin: { left: M, right: M },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const l = analise.comparativo[d.row.index];
        if (d.column.index === 4) d.cell.styles.textColor = l.ok ? COR.verde : COR.vermelho;
        if (d.column.index === 3 && !l.ok) d.cell.styles.textColor = COR.vermelho;
      },
    });
    y = doc.lastAutoTable.finalY + 2.5;
    const notas = analise.comparativo.filter((l) => l.nota).map((l) => "(" + (l.indicador) + ") " + l.nota);
    if (notas.length) {
      fonte(6, "italic", COR.cinza);
      texto(notas, M, y + 1.5);
      y += notas.length * 2.7;
    }
    y += 5;

    // ------------------------------------------------- 3 não conformidades
    secao("Não conformidades apuradas", 24);
    if (!analise.ncs.length) {
      moldura(M, y, L, 11, COR.branco);
      fonte(8, "bold", COR.verde);
      texto("Nenhuma não conformidade apurada nesta entrega.", M + 4, y + 7);
      y += 11 + 8;
    } else {
      doc.autoTable({
        startY: y,
        head: [["Nº", "GRAVIDADE", "NÃO CONFORMIDADE", "APURAÇÃO", "CAIXAS"]],
        body: analise.ncs.map((n, i) => [String(i + 1).padStart(2, "0"),
          n.gravidade === "alta" ? "TRATATIVA\nIMEDIATA" : "RESSALVA",
          n.titulo, n.detalhe, n.caixas.length ? n.caixas.join(", ") : "—"]),
        theme: "grid",
        headStyles: { fillColor: COR.fundo, textColor: COR.preto, fontStyle: "bold",
                      halign: "center", fontSize: 6.4, cellPadding: 2, lineColor: COR.borda,
                      lineWidth: 0.3 },
        styles: { fontSize: 7, textColor: COR.tinta, lineColor: COR.grade, lineWidth: 0.2,
                  cellPadding: 2, valign: "top" },
        columnStyles: { 0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
                        1: { cellWidth: 20, halign: "center", fontSize: 5.8, fontStyle: "bold" },
                        2: { cellWidth: 44, fontStyle: "bold", textColor: COR.preto },
                        4: { cellWidth: 16, halign: "center" } },
        margin: { left: M, right: M },
        didParseCell: (d) => {
          if (d.section !== "body") return;
          const n = analise.ncs[d.row.index];
          if (d.column.index === 1) {
            d.cell.styles.textColor = n.gravidade === "alta" ? COR.vermelho : COR.ambar;
          }
        },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // ------------------------------------------------ 4 conciliação financeira
    secao("Conciliação financeira", 28);
    moldura(M, y, L, 18, COR.branco);
    doc.setFillColor(...COR.preto);
    doc.rect(M, y, 4, 18, "F");
    fonte(6, "bold", COR.cinzaClaro);
    texto("VALOR A ACERTAR", M + 8, y + 6, { charSpace: 0.25 });
    fonte(17, "bold", fin.valor > 0 ? COR.laranja : COR.verde);
    texto(pcqsRs(fin.valor), M + 8, y + 14.5);
    fonte(7.6, "bold", COR.preto);
    texto(fin.rotulo, M + L - 5, y + 7, { align: "right" });
    fonte(6.4, "normal", COR.cinza);
    texto("custo unitário real " + pcqsRs(tot.custoReal) + "/Kg  ·  " +
          "valor da nota " + pcqsRs(tot.valorNF) + "  ·  " +
          "valor recebido " + pcqsRs(tot.valorRecebido), M + L - 5, y + 13, { align: "right" });
    y += 18 + 5;

    // termo: o parágrafo que o fornecedor assina embaixo
    const termo = montarTermo(analise, tot, cab);
    fonte(7.6, "normal", COR.tinta);
    const lt = doc.splitTextToSize(termo, L - 8);
    quebra(lt.length * 3.6 + 12);
    moldura(M, y, L, lt.length * 3.6 + 8, COR.fundo);
    texto(lt, M + 4, y + 5.5);
    y += lt.length * 3.6 + 8 + 6;

    // ---------------------------------------------------- 5 caixa a caixa
    secao("Conferência de peso, caixa a caixa", 30);
    y = tabelaPeso(doc, analise, y) + 5;
    quebra(40);
    secao("Avaliação sensorial, gelo e validade", 30);
    y = tabelaSensorial(doc, analise, y) + 5;

    // -------------------------------------------------------- 6 observações
    const obs = [].concat(analise.observacoes || [])
      .concat(ex.obs ? [ex.obs] : []).filter((o) => String(o).trim());
    if (obs.length) {
      fonte(7.6, "normal", COR.tinta);
      const lo = doc.splitTextToSize(obs.join("   ·   "), L - 8);
      secao("Observações da conferência", lo.length * 3.6 + 10);
      moldura(M, y, L, lo.length * 3.6 + 8, COR.branco);
      texto(lo, M + 4, y + 5.5);
      y += lo.length * 3.6 + 8 + 6;
    }

    // ---------------------------------------------------------- 7 critérios
    fonte(6.8, "normal", COR.cinza);
    const lc = [];
    listaDeCriterios(analise, tot).forEach((c, i) =>
      doc.splitTextToSize((i + 1) + ". " + c, L - 6).forEach((l) => lc.push(l)));
    secao("Critérios aplicados nesta conferência", lc.length * 3 + 6);
    fonte(6.8, "normal", COR.cinza);   // secao() deixou a fonte em negrito
    texto(lc, M + 2, y + 1);
    y += lc.length * 3 + 6;

    // ---------------------------------------------------------- 8 validação
    secao("Validação", 26);
    // Quem valida e a casa: suprimentos, operacao e o supervisor que recebeu. O
    // fornecedor nao assina o relatorio — ele recebe o resultado ja validado.
    const assin = [
      { nome: ex.assSuprimentos, papel: "Gerente suprimentos" },
      { nome: ex.assOperacional, papel: "Gerente operacional" },
      { nome: ex.assSupervisor || cab.responsavel, papel: "Supervisor operacional" },
    ];
    const largA = (L - 2 * 4) / 3;
    assin.forEach((a, i) => {
      const x = M + i * (largA + 4);
      moldura(x, y, largA, 24, COR.branco);
      fonte(7.4, "bold", COR.preto);
      // Campo sem nome digitado fica em branco: linha para assinar a mao e
      // melhor que um travessao no lugar de quem vai assinar.
      texto(doc.splitTextToSize(pcqsNomeProprio(a.nome) || " ", largA - 6)[0],
            x + largA / 2, y + 6, { align: "center" });
      doc.setDrawColor(...COR.borda);
      doc.setLineWidth(0.2);
      doc.line(x + 5, y + 17, x + largA - 5, y + 17);
      fonte(5.8, "bold", COR.cinza);
      texto(a.papel.toUpperCase(), x + largA / 2, y + 21, { align: "center", charSpace: 0.2 });
    });
    y += 26;

    rodape(doc, cab, tot, docId);
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
      if (l.tipo === "texto") return l.ok ? "—" : "DIVERGENTE";
      if (l.tipo === "rs") return pcqsSinalRs(l.dif);
      if (l.tipo === "pcs") return pcqsSinalPcs(l.dif);
      if (l.tipo === "qtd") return (l.dif > 0 ? "+" : "") + pcqsFmt(l.dif, 0);
      return pcqsSinalKg(l.dif);
    }
    function tabelaPeso(d, a, yy) {
      const temBruto = a.caixas.some((c) => c.pesoBruto > 0);
      const cabeca = ["CX", "LOTE", "LIBRAGEM", "PEIXES"]
        .concat(temBruto ? ["PESO BRUTO"] : [])
        .concat(["PESO ETIQUETA", "PESO FÍSICO", "DIFERENÇA", "PESO MÉDIO", "SITUAÇÃO"]);
      d.autoTable({
        startY: yy,
        head: [cabeca],
        body: a.caixas.map((c) => [String(c.n).padStart(2, "0"), TX(c.lote),
          TX(c.libragemConf || c.libragemEtiqueta), pcqsFmt(c.peixes, 0)]
          .concat(temBruto ? [c.pesoBruto ? pcqsKg(c.pesoBruto) : "—"] : [])
          .concat([pcqsKg(c.pesoLiquido), pcqsKg(c.pesoFisico), pcqsSinalKg(c.difEtiqueta),
                   pcqsKg(c.pesoMedio),
                   c.ok ? "CONFORME" : (c.reprovada ? "REPROVADA" : "DIVERGENTE")])),
        foot: [["", "TOTAIS", "", pcqsFmt(a.tot.peixes, 0)]
          .concat(temBruto ? [""] : [])
          .concat([pcqsKg(a.tot.pesoEtiquetas), pcqsKg(a.tot.pesoRecebido),
                   pcqsSinalKg(a.tot.pesoEtiquetas ? a.tot.pesoRecebido - a.tot.pesoEtiquetas : 0),
                   pcqsKg(a.tot.pesoMedioRecebido), ""])],
        theme: "grid",
        headStyles: { fillColor: COR.fundo, textColor: COR.preto, fontStyle: "bold",
                      halign: "center", fontSize: 5.9, cellPadding: 1.7, lineColor: COR.borda,
                      lineWidth: 0.3 },
        footStyles: { fillColor: COR.branco, textColor: COR.preto, fontStyle: "bold",
                      halign: "center", fontSize: 6.8, lineColor: COR.borda, lineWidth: 0.3 },
        styles: { fontSize: 7, textColor: COR.tinta, lineColor: COR.grade, lineWidth: 0.2,
                  cellPadding: 1.7, halign: "center", valign: "middle" },
        columnStyles: { 0: { cellWidth: 8, fontStyle: "bold" } },
        margin: { left: M, right: M },
        didParseCell: (dd) => {
          if (dd.section !== "body") return;
          const c = a.caixas[dd.row.index];
          const ult = cabeca.length - 1;
          if (dd.column.index === ult) {
            dd.cell.styles.fontSize = 5.9;
            dd.cell.styles.fontStyle = "bold";
            dd.cell.styles.textColor = c.ok ? COR.verde : COR.vermelho;
          }
          if (dd.column.index === ult - 2 && c.pesoDivergente) {
            dd.cell.styles.textColor = COR.vermelho; dd.cell.styles.fontStyle = "bold";
          }
          if (dd.column.index === ult - 1 && c.foraDaFaixa) {
            dd.cell.styles.textColor = COR.vermelho; dd.cell.styles.fontStyle = "bold";
          }
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
        theme: "grid",
        headStyles: { fillColor: COR.fundo, textColor: COR.preto, fontStyle: "bold",
                      halign: "center", fontSize: 5.9, cellPadding: 1.7, lineColor: COR.borda,
                      lineWidth: 0.3 },
        styles: { fontSize: 6.8, textColor: COR.tinta, lineColor: COR.grade, lineWidth: 0.2,
                  cellPadding: 1.7, halign: "center", valign: "middle" },
        columnStyles: temMotivo
          ? { 0: { cellWidth: 8, fontStyle: "bold" }, 1: { cellWidth: 19 }, 2: { cellWidth: 19 },
              3: { cellWidth: 19 }, 4: { cellWidth: 32 }, 5: { cellWidth: 19 },
              6: { cellWidth: 10 }, 7: { cellWidth: 19 } }
          : { 0: { cellWidth: 8, fontStyle: "bold" }, 1: { cellWidth: 24 }, 2: { cellWidth: 24 },
              3: { cellWidth: 24 }, 4: { cellWidth: 42 }, 5: { cellWidth: 24 },
              6: { cellWidth: 12 } },
        margin: { left: M, right: M },
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
    function rodape(d, c, t, id) {
      const total = d.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        d.setPage(p);
        d.setDrawColor(...COR.borda);
        d.setLineWidth(0.2);
        d.line(M, 283, M + L, 283);
        fonte(6, "normal", COR.cinza);
        texto("DOCUMENTO Nº " + id + "  ·  " + TX(c.loja) + "  ·  NF " + TX(c.nf) + "  ·  " +
              TX(c.fornecedor) + "  ·  CUSTO REAL " + pcqsRs(t.custoReal) + "/KG", M, 287);
        texto("PÁGINA " + p + " DE " + total, M + L, 287, { align: "right" });
      }
    }
  }

  // O termo muda com o caso: crédito a receber, complemento a pagar, ou nada a
  // acertar — e ganha um parágrafo à parte quando houve reprovação, porque
  // produto alterado não se resolve em desconto.
  //
  // Quem declara ciência aqui é a casa (suprimentos e operação), não o
  // fornecedor: o relatório sai validado internamente e é ASSIM que chega ao
  // fornecedor, com o valor já apurado e assinado por quem responde por ele.
  function montarTermo(analise, tot, cab) {
    const quem = pcqsLimpa(cab.fornecedor) || "o fornecedor";
    const loja = pcqsLimpa(cab.loja) || "a loja";
    let t = "Suprimentos e operação declaram ciência do resultado desta conferência, " +
      "realizada no ato do recebimento, com pesagem caixa por caixa na presença do " +
      "entregador. ";
    if (analise.financeiro.direcao === "fornecedor") {
      t += "Fica apurada diferença de " + pcqsKg(Math.abs(tot.difPeso)) + " a menos que o peso " +
        "faturado na nota fiscal " + (pcqsLimpa(cab.nf) || "—") + ", equivalente a " +
        pcqsRs(analise.financeiro.valor) + " ao custo unitário de " + pcqsRs(tot.custo) +
        "/Kg, a ser creditado por " + quem + " em favor de " + loja + ". ";
    } else if (analise.financeiro.direcao === "loja") {
      t += "Fica apurada diferença de " + pcqsKg(tot.difPeso) + " a mais que o peso faturado, " +
        "equivalente a " + pcqsRs(analise.financeiro.valor) + " a complementar em favor de " +
        quem + ". ";
    } else {
      t += "Peso faturado e peso conferido fecham dentro da tolerância acordada, não havendo " +
        "valor a acertar. ";
    }
    if (analise.veredito.tipo === "reprovado") {
      t += "As caixas reprovadas na análise de conformidade NÃO integram o acerto financeiro " +
        "acima: produto com alteração sensorial, validade insuficiente ou gelo impróprio segue " +
        "o procedimento de devolução, com substituição ou estorno integral do item.";
    } else {
      t += "Eventuais ressalvas registradas no item 3 devem ser tratadas junto ao fornecedor " +
        "antes do próximo pedido da mesma libragem.";
    }
    return t;
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

  window.PCQS_MODELO_B = documento;
  if (typeof module !== "undefined" && module.exports) module.exports = documento;
})();
