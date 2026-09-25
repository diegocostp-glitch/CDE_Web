// ============================================================================
// MODELO C — PAINEL
//
// Proposta: a conferência lida por gráfico, não por tabela. É o modelo para a
// reunião — o diretor vê num relance quanto faltou, em quais caixas, e quanto
// isso vale; a tabela vira comprovação na segunda folha. Três desenhos, cada um
// respondendo uma pergunta:
//
//   1. Faltou peso?          barra-alvo: faturado × conferido, com a tolerância
//   2. Onde faltou?          barras divergentes por caixa, a partir do zero
//   3. Alguma caixa caiu?    mapa das caixas, uma casa por caixa
//
// Sobre a cor dos gráficos: verde e âmbar reprovam no teste de separação para
// daltonismo (ΔE 5,2 em protanopia), então severidade NÃO é codificada por
// matiz aqui. Os desenhos usam uma rampa de cinza validada (#ABABAB → #7A7A7A →
// #1A1A1A) mais o vermelho só onde o valor estoura a tolerância, com o número
// escrito ao lado. Verde, âmbar e vermelho continuam nos selos e nas tabelas,
// onde vêm sempre acompanhados da palavra — cor nunca é o único portador.
// ============================================================================
(function () {
  "use strict";

  const COR = {
    laranja: [243, 111, 29],
    preto: [26, 26, 26],
    tinta: [50, 50, 50],
    cinza: [118, 118, 118],
    cinzaClaro: [160, 160, 160],
    filete: [214, 214, 214],
    fundo: [245, 245, 244],
    trilho: [237, 237, 236],
    faixa: [223, 223, 222],
    verde: [26, 150, 84],
    vermelho: [199, 48, 38],
    ambar: [193, 124, 9],
    branco: [255, 255, 255],
    // rampa ordinal de severidade — validada: L monotônica, ΔL >= 0,06,
    // ponta clara acima de 2:1 contra o papel, matiz única
    grau1: [171, 171, 171],
    grau2: [122, 122, 122],
    grau3: [26, 26, 26],
  };
  const TOM = { aprovado: COR.verde, ressalva: COR.ambar, reprovado: COR.vermelho };

  const M = 15;
  const L = 180;
  const FIM = 272;

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
    const largura = (t) => doc.getTextWidth(String(t));
    const titulo = (t, sub) => {
      fonte(7, "bold", COR.preto);
      texto(String(t).toUpperCase(), M, y, { charSpace: 0.25 });
      if (sub) {
        fonte(6.2, "normal", COR.cinzaClaro);
        texto(sub, M + L, y, { align: "right" });
      }
      y += 4;
    };
    const quebra = (alt) => {
      if (y + alt <= FIM) return;
      doc.addPage();
      fonte(6.2, "bold", COR.cinzaClaro);
      texto("RELATÓRIO DE RECEBIMENTO DE SALMÃO", M, 16, { charSpace: 0.3 });
      fonte(6.2, "normal", COR.cinza);
      texto("NF " + TX(cab.nf) + " · " + TX(cab.fornecedor) + " · " + TX(cab.loja),
            M + L, 16, { align: "right" });
      doc.setDrawColor(...COR.laranja);
      doc.setLineWidth(0.5);
      doc.line(M, 19, M + L, 19);
      y = 28;
    };

    // ------------------------------------------------------------- cabeçalho
    doc.setFillColor(...COR.preto);
    doc.rect(0, 0, 210, 40, "F");
    doc.setFillColor(...COR.laranja);
    doc.rect(0, 40, 210, 1.6, "F");
    const marca = (typeof PCQS_MARCA_IMG !== "undefined") ? PCQS_MARCA_IMG : null;
    if (marca) doc.addImage(marca, "PNG", M, 12, 28, 14);
    fonte(12.5, "bold", COR.branco);
    texto("RELATÓRIO DE RECEBIMENTO DE SALMÃO", 195, 16, { align: "right" });
    fonte(7.4, "normal", [190, 190, 190]);
    texto("Salmão " + TX(tot.libragemContratada) + "  ·  NF " + TX(cab.nf) + "  ·  " +
          TX(cab.fornecedor) + "  ·  " + TX(cab.loja), 195, 22, { align: "right" });
    texto("Entrega " + TX(cab.entrega) + "  ·  validade " + TX(cab.validade) +
          "  ·  supervisor responsável " + (pcqsNomeProprio(cab.responsavel) || "—"),
          195, 27, { align: "right" });
    texto("Emitido em " + new Date().toLocaleDateString("pt-BR"), 195, 32, { align: "right" });

    y = 52;

    // ------------------------------------------------------------- indicadores
    const tiles = [
      { r: "Peso faturado (NF)", v: pcqsKg(tot.pesoNF), n: TX(cab.caixasNF) + " caixas",
        cor: COR.preto, filete: COR.cinzaClaro },
      { r: "Peso conferido", v: pcqsKg(tot.pesoRecebido), n: tot.caixas + " caixas pesadas",
        cor: COR.preto, filete: COR.cinzaClaro },
      { r: "Divergência", v: pcqsSinalKg(tot.difPeso), n: pcqsFmt(tot.difPesoPerc, 2) + "% do faturado",
        cor: Math.abs(tot.difPeso) > tot.tolTotal ? COR.vermelho : COR.verde,
        filete: Math.abs(tot.difPeso) > tot.tolTotal ? COR.vermelho : COR.verde },
      { r: "Valor a acertar", v: pcqsRs(fin.valor), n: fin.rotulo.toLowerCase(),
        cor: fin.valor > 0 ? COR.laranja : COR.verde,
        filete: fin.valor > 0 ? COR.laranja : COR.verde },
    ];
    const largT = (L - 3 * 3) / 4;
    tiles.forEach((t, i) => {
      const x = M + i * (largT + 3);
      doc.setFillColor(...COR.fundo);
      doc.rect(x, y, largT, 21, "F");
      doc.setFillColor(...t.filete);
      doc.rect(x, y, 1, 21, "F");
      fonte(5.6, "bold", COR.cinzaClaro);
      texto(t.r.toUpperCase(), x + 4, y + 5.5, { charSpace: 0.2 });
      fonte(12.5, "bold", t.cor);
      texto(t.v, x + 4, y + 13.5);
      fonte(5.8, "normal", COR.cinza);
      texto(doc.splitTextToSize(t.n, largT - 6)[0], x + 4, y + 18);
    });
    y += 21 + 8;

    // ------------------------------------------------------------- veredito
    doc.setFillColor(...corTom);
    doc.rect(M, y - 2.8, 2.8, 2.8, "F");
    fonte(7.4, "bold", corTom);
    texto(analise.veredito.rotulo, M + 5, y, { charSpace: 0.25 });
    fonte(8, "normal", COR.tinta);
    const lres = doc.splitTextToSize(analise.veredito.resumo + " " + fin.frase, L);
    texto(lres.slice(0, 3), M, y + 5);
    y += 5 + Math.min(3, lres.length) * 3.6 + 7;

    // ----------------------------------------------- gráfico 1 · barra-alvo
    titulo("Peso faturado × conferido", "faixa clara = tolerância de " + pcqsKg(tot.tolTotal));
    y = barraAlvo(y + 3);
    y += 6;

    // ------------------------------------- gráfico 2 · divergência por caixa
    titulo("Diferença por caixa", "peso físico menos peso da etiqueta, em Kg");
    y = barrasDivergentes(y);
    y += 6;

    // --------------------------------------- gráfico 3 · mapa das caixas
    titulo("Mapa das caixas", "cada casa é uma caixa recebida");
    y = mapaDasCaixas(y);
    y += 7;

    // ------------------------------------------------------------- dinheiro
    quebra(26);
    doc.setFillColor(...COR.preto);
    doc.rect(M, y, L, 18, "F");
    fonte(6, "bold", [170, 170, 170]);
    texto("VALOR A ACERTAR", M + 6, y + 6.5, { charSpace: 0.25 });
    fonte(17, "bold", fin.valor > 0 ? COR.laranja : COR.branco);
    texto(pcqsRs(fin.valor), M + 6, y + 14.5);
    fonte(8, "bold", COR.branco);
    texto(fin.rotulo, M + L - 6, y + 7, { align: "right" });
    fonte(6.2, "normal", [170, 170, 170]);
    texto("custo da NF " + pcqsRs(tot.custo) + "/Kg  ·  custo real " +
          pcqsRs(tot.custoReal) + "/Kg  ·  " + pcqsSinalRs(tot.custoDif) + "/Kg",
          M + L - 6, y + 13, { align: "right" });
    y += 18 + 7;

    // ------------------------------------------------------ não conformidades
    quebra(20);
    titulo("Não conformidades", analise.ncs.length
      ? analise.ncs.filter((n) => n.gravidade === "alta").length + " de tratativa imediata"
      : "nenhuma apurada");
    if (!analise.ncs.length) {
      fonte(8, "normal", COR.verde);
      texto("Nenhuma não conformidade apurada nesta entrega.", M, y + 4);
      y += 10;
    }
    analise.ncs.forEach((n) => {
      const grave = n.gravidade === "alta";
      const cor = grave ? COR.vermelho : COR.ambar;
      fonte(7, "normal", COR.tinta);
      const det = doc.splitTextToSize(n.detalhe +
        (n.caixas.length ? " Caixas " + n.caixas.join(", ") + "." : ""), L - 12);
      const alt = 4.6 + det.length * 3.1 + 3;
      quebra(alt);
      doc.setFillColor(...cor);
      doc.rect(M, y, 2, alt - 1.5, "F");
      fonte(8.2, "bold", COR.preto);
      texto(n.titulo, M + 5.5, y + 3.4);
      fonte(5.8, "bold", cor);
      texto(grave ? "TRATATIVA IMEDIATA" : "RESSALVA", M + L, y + 3.4,
            { align: "right", charSpace: 0.2 });
      fonte(7, "normal", COR.tinta);
      texto(det, M + 5.5, y + 7.6);
      y += alt + 2.5;
    });

    // --------------------------------------------------------- comprovação
    // A prova continua na mesma folha se couber: pagina nova por decreto
    // desperdicava uma folha inteira quando a lista de ressalvas era curta.
    quebra(64);
    titulo("Comparativo — nota fiscal × conferido na loja");
    doc.autoTable({
      startY: y,
      head: [["INDICADOR", "NOTA FISCAL / ETIQUETAS", "CONFERIDO NA LOJA", "DIFERENÇA", "SITUAÇÃO"]],
      body: analise.comparativo.map((l) => [l.indicador, valorDe(l, "nf"), valorDe(l, "rec"),
                                            difDe(l), l.ok ? "OK" : "DIVERGENTE"]),
      theme: "striped",
      headStyles: { fillColor: COR.preto, textColor: COR.branco, fontStyle: "bold",
                    halign: "center", fontSize: 6.4, cellPadding: 2 },
      styles: { fontSize: 7.4, textColor: COR.tinta, cellPadding: 2, valign: "middle",
                lineWidth: 0 },
      alternateRowStyles: { fillColor: [250, 250, 249] },
      columnStyles: { 0: { halign: "left", cellWidth: 58 }, 1: { halign: "center", fontStyle: "bold" },
                      2: { halign: "center", fontStyle: "bold" },
                      3: { halign: "center", cellWidth: 26, fontStyle: "bold" },
                      4: { halign: "center", cellWidth: 24, fontSize: 6.2, fontStyle: "bold" } },
      margin: { left: M, right: M },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const l = analise.comparativo[d.row.index];
        if (d.column.index === 4) d.cell.styles.textColor = l.ok ? COR.verde : COR.vermelho;
        if (d.column.index === 3 && !l.ok) d.cell.styles.textColor = COR.vermelho;
      },
    });
    y = doc.lastAutoTable.finalY + 8;

    quebra(46);
    titulo("Conferência de peso, caixa a caixa");
    y = tabelaPeso(doc, analise, y) + 8;
    quebra(46);
    titulo("Avaliação sensorial, gelo e validade");
    y = tabelaSensorial(doc, analise, y) + 8;

    const obs = [].concat(analise.observacoes || [])
      .concat(ex.obs ? [ex.obs] : []).filter((o) => String(o).trim());
    if (obs.length) {
      fonte(7.6, "normal", COR.tinta);
      const lo = doc.splitTextToSize(obs.join("   ·   "), L - 8);
      quebra(lo.length * 3.5 + 14);
      titulo("Observações da conferência");
      doc.setFillColor(...COR.fundo);
      doc.rect(M, y, L, lo.length * 3.5 + 7, "F");
      fonte(7.6, "normal", COR.tinta);
      texto(lo, M + 4, y + 5);
      y += lo.length * 3.5 + 7 + 8;
    }

    fonte(6.8, "normal", COR.cinza);
    const lc = [];
    listaDeCriterios(analise, tot).forEach((c) =>
      doc.splitTextToSize("· " + c, L - 4).forEach((l) => lc.push(l)));
    quebra(lc.length * 3 + 34);
    titulo("Critérios aplicados nesta conferência");
    fonte(6.8, "normal", COR.cinza);
    texto(lc, M + 2, y + 1);
    y += lc.length * 3 + 12;

    titulo("Validação");
    y += 11;
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
      fonte(8.2, "normal", COR.preto);
      // Campo sem nome digitado fica em branco: linha para assinar a mao e
      // melhor que um travessao no lugar de quem vai assinar.
      texto(pcqsNomeProprio(a.nome), x + largA / 2, y, { align: "center" });
      doc.setDrawColor(...COR.filete);
      doc.setLineWidth(0.25);
      doc.line(x + 8, y + 2.8, x + largA - 8, y + 2.8);
      fonte(5.8, "bold", COR.cinzaClaro);
      texto(a.papel.toUpperCase(), x + largA / 2, y + 6.4, { align: "center", charSpace: 0.2 });
    });

    rodape(doc, cab, tot);
    return doc;

    // ===================================================== desenhos
    // Barra-alvo: o trilho é a escala, a barra preta é o que entrou, o traço
    // vertical é o que a nota fiscal prometeu e a faixa clara é a tolerância.
    // O pedaço que falta aparece em vermelho entre a ponta da barra e o alvo —
    // é exatamente o pedaço que vale dinheiro.
    function barraAlvo(yy) {
      const alvo = tot.pesoNF, valor = tot.pesoRecebido, tol = tot.tolTotal;
      if (!alvo) return yy;
      const alt = 9, altBarra = 5;
      const max = Math.max(alvo, valor) * 1.06;
      const px = (v) => M + (v / max) * L;
      doc.setFillColor(...COR.trilho);
      doc.rect(M, yy, L, alt, "F");
      doc.setFillColor(...COR.faixa);
      doc.rect(px(alvo - tol), yy, px(alvo + tol) - px(alvo - tol), alt, "F");
      doc.setFillColor(...COR.preto);
      doc.rect(M, yy + (alt - altBarra) / 2, px(valor) - M, altBarra, "F");
      // o que faltou, na altura da barra
      if (valor < alvo - tol) {
        doc.setFillColor(...COR.vermelho);
        doc.rect(px(valor), yy + alt / 2 - 0.6, px(alvo) - px(valor), 1.2, "F");
      }
      doc.setDrawColor(...COR.preto);
      doc.setLineWidth(0.7);
      doc.line(px(alvo), yy - 1.6, px(alvo), yy + alt + 1.6);

      // rótulos: valor conferido na ponta da barra, alvo sobre o traço
      fonte(7, "bold", COR.branco);
      const rotVal = pcqsKg(valor);
      if (px(valor) - M > largura(rotVal) + 6) {
        texto(rotVal, px(valor) - 3, yy + alt / 2 + 1.2, { align: "right" });
      } else {
        fonte(7, "bold", COR.preto);
        texto(rotVal, px(valor) + 3, yy + alt / 2 + 1.2);
      }
      // O alvo se identifica sobre o próprio traço; a barra já diz o que é pelo
      // valor escrito dentro dela. Uma legenda a mais aqui só brigaria com o
      // título da seção, três milímetros acima.
      const rotAlvo = "FATURADO " + pcqsKg(alvo);
      fonte(5.8, "bold", COR.preto);
      texto(rotAlvo, Math.min(px(alvo), M + L - largura(rotAlvo)), yy - 2.2);
      let yb = yy + alt + 4.5;
      if (valor < alvo - tol) {
        fonte(6.6, "bold", COR.vermelho);
        const g = pcqsSinalKg(tot.difPeso);
        texto(g, (px(valor) + px(alvo)) / 2, yb, { align: "center" });
        fonte(5.8, "normal", COR.cinza);
        texto("faltando", (px(valor) + px(alvo)) / 2, yb + 3.2, { align: "center" });
        yb += 3.2;
      }
      return yb + 1;
    }

    // Barras divergentes: uma linha por caixa, crescendo do zero para a
    // esquerda (pesou menos que a etiqueta) ou para a direita (pesou mais).
    // A direção já diz o sinal, então a cor fica livre para dizer a única coisa
    // que a direção não diz: se estourou a tolerância.
    function barrasDivergentes(yy) {
      const caixas = analise.caixas;
      if (!caixas.length) return yy;
      const xRot = M + 13;                 // faixa dos rótulos "CX 01"
      const xFim = M + L - 16;             // sobra à direita para o valor
      const areaW = xFim - xRot;
      const tol = Math.max.apply(null, caixas.map((c) => c.tolCaixa || 0)) ||
                  analise.ajustes.tolPesoKg;
      // Domínio assimétrico, colado no dado: como quase toda divergência é
      // negativa, centrar o zero jogaria metade da largura no vazio. O zero
      // continua desenhado — é dele que as barras saem — mas fica onde o dado
      // manda, não no meio da folha.
      const difs = caixas.map((c) => c.difEtiqueta || 0);
      const minV = Math.min(-tol * 1.25, Math.min.apply(null, difs) * 1.18);
      const maxV = Math.max(tol * 1.25, Math.max.apply(null, difs) * 1.18);
      const esc = areaW / (maxV - minV);
      const px = (v) => xRot + (v - minV) * esc;
      const zx = px(0);
      const hb = 3.4, gap = 2.2;
      const altTotal = caixas.length * (hb + gap);

      doc.setFillColor(...COR.trilho);                       // faixa da tolerância
      doc.rect(px(-tol), yy, px(tol) - px(-tol), altTotal, "F");
      doc.setDrawColor(...COR.cinzaClaro);                    // eixo do zero
      doc.setLineWidth(0.25);
      doc.line(zx, yy, zx, yy + altTotal);

      caixas.forEach((c, i) => {
        const yb = yy + i * (hb + gap);
        const dif = c.difEtiqueta || 0;
        const fora = !!c.pesoDivergente;
        doc.setFillColor(...(fora ? COR.vermelho : COR.grau2));
        const x1 = Math.min(zx, px(dif)), larguraB = Math.abs(px(dif) - zx);
        doc.rect(x1, yb, Math.max(larguraB, 0.3), hb, "F");
        fonte(6, "normal", COR.tinta);
        texto("CX " + String(c.n).padStart(2, "0"), xRot - 2.5, yb + hb - 0.7, { align: "right" });
        if (fora) {                                          // rótulo só no que estourou
          fonte(6, "bold", COR.vermelho);
          const r = pcqsSinalKg(dif);
          if (dif < 0) texto(r, x1 - 1.5, yb + hb - 0.7, { align: "right" });
          else texto(r, x1 + larguraB + 1.5, yb + hb - 0.7);
        }
      });

      // eixo: cinco marcas redondas, hairline
      let yb = yy + altTotal + 3.2;
      doc.setDrawColor(...COR.filete);
      doc.setLineWidth(0.2);
      doc.line(xRot, yy + altTotal + 1, xFim, yy + altTotal + 1);
      [minV, minV / 2, 0, maxV / 2, maxV].forEach((v) => {
        const x = px(v);
        doc.line(x, yy + altTotal + 1, x, yy + altTotal + 2);
        fonte(5.4, "normal", COR.cinzaClaro);
        texto(v === 0 ? "0" : pcqsFmt(v, 2), x, yb + 1.4, { align: "center" });
      });
      fonte(5.8, "normal", COR.cinzaClaro);
      texto("faixa clara = tolerância de " + pcqsKg(tol) + " por caixa  ·  " +
            "vermelho = fora da tolerância", M, yb + 5.4);
      return yb + 6;
    }

    // Mapa das caixas: uma casa por caixa, na rampa de cinza validada. Diz de
    // um relance QUANTAS e QUAIS caixas saíram do padrão — que é a pergunta
    // seguinte a "faltou peso?".
    function mapaDasCaixas(yy) {
      const caixas = analise.caixas;
      if (!caixas.length) return yy;
      const lado = 10, gap = 2.4;
      const porLinha = Math.max(1, Math.floor((L + gap) / (lado + gap)));
      let linhas = 0;
      caixas.forEach((c, i) => {
        const col = i % porLinha, lin = Math.floor(i / porLinha);
        linhas = lin + 1;
        const x = M + col * (lado + gap), yb = yy + lin * (lado + 6);
        const cor = c.reprovada ? COR.grau3 : (c.ok ? COR.grau1 : COR.grau2);
        doc.setFillColor(...cor);
        doc.rect(x, yb, lado, lado, "F");
        if (c.reprovada) {                       // segunda marca, além do tom
          doc.setDrawColor(...COR.vermelho);
          doc.setLineWidth(0.6);
          doc.rect(x - 0.6, yb - 0.6, lado + 1.2, lado + 1.2);
        }
        fonte(6, "bold", COR.tinta);
        texto(String(c.n).padStart(2, "0"), x + lado / 2, yb + lado + 3.4, { align: "center" });
      });
      let yb = yy + linhas * (lado + 6) + 1;
      // legenda: três tons, com a contagem escrita — o tom nunca responde sozinho
      const conta = {
        conformes: caixas.filter((c) => c.ok).length,
        divergentes: caixas.filter((c) => !c.ok && !c.reprovada).length,
        reprovadas: caixas.filter((c) => c.reprovada).length,
      };
      const itens = [
        { cor: COR.grau1, t: conta.conformes + " conforme" + (conta.conformes === 1 ? "" : "s") },
        { cor: COR.grau2, t: conta.divergentes + " com divergência de peso" },
        { cor: COR.grau3, t: conta.reprovadas + " reprovada" + (conta.reprovadas === 1 ? "" : "s") },
      ];
      let x = M;
      itens.forEach((it) => {
        doc.setFillColor(...it.cor);
        doc.rect(x, yb - 2.2, 2.6, 2.6, "F");
        fonte(6.2, "normal", COR.cinza);
        texto(it.t, x + 4, yb);
        x += 4 + largura(it.t) + 8;
      });
      return yb + 2;
    }

    // ===================================================== tabelas e apoio
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
        .concat(["PESO ETIQUETA", "PESO FÍSICO", "DIFERENÇA", "PESO MÉDIO", "SITUAÇÃO"]);
      d.autoTable({
        startY: yy,
        head: [cabeca],
        body: a.caixas.map((c) => [String(c.n).padStart(2, "0"), TX(c.lote),
          TX(c.libragemConf || c.libragemEtiqueta), pcqsFmt(c.peixes, 0)]
          .concat(temBruto ? [c.pesoBruto ? pcqsKg(c.pesoBruto) : "—"] : [])
          .concat([pcqsKg(c.pesoLiquido), pcqsKg(c.pesoFisico), pcqsSinalKg(c.difEtiqueta),
                   pcqsKg(c.pesoMedio), c.ok ? "OK" : (c.reprovada ? "REPROVADA" : "DIVERGENTE")])),
        foot: [["", "TOTAIS", "", pcqsFmt(a.tot.peixes, 0)]
          .concat(temBruto ? [""] : [])
          .concat([pcqsKg(a.tot.pesoEtiquetas), pcqsKg(a.tot.pesoRecebido),
                   pcqsSinalKg(a.tot.pesoEtiquetas ? a.tot.pesoRecebido - a.tot.pesoEtiquetas : 0),
                   pcqsKg(a.tot.pesoMedioRecebido), ""])],
        theme: "striped",
        headStyles: { fillColor: COR.preto, textColor: COR.branco, fontStyle: "bold",
                      halign: "center", fontSize: 5.9, cellPadding: 1.7 },
        footStyles: { fillColor: [238, 238, 237], textColor: COR.preto, fontStyle: "bold",
                      halign: "center", fontSize: 6.8 },
        styles: { fontSize: 7, textColor: COR.tinta, cellPadding: 1.7, halign: "center",
                  valign: "middle", lineWidth: 0 },
        alternateRowStyles: { fillColor: [250, 250, 249] },
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
        theme: "striped",
        headStyles: { fillColor: COR.preto, textColor: COR.branco, fontStyle: "bold",
                      halign: "center", fontSize: 5.9, cellPadding: 1.7 },
        styles: { fontSize: 6.8, textColor: COR.tinta, cellPadding: 1.7, halign: "center",
                  valign: "middle", lineWidth: 0 },
        alternateRowStyles: { fillColor: [250, 250, 249] },
        columnStyles: temMotivo
          ? { 0: { cellWidth: 8, fontStyle: "bold" }, 4: { cellWidth: 32 }, 6: { cellWidth: 10 },
              8: { cellWidth: 28 } }
          : { 0: { cellWidth: 8, fontStyle: "bold" }, 4: { cellWidth: 42 }, 6: { cellWidth: 12 } },
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
    function rodape(d, c, t) {
      const total = d.internal.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        d.setPage(p);
        d.setDrawColor(...COR.filete);
        d.setLineWidth(0.2);
        d.line(M, 282, M + L, 282);
        fonte(5.8, "normal", COR.cinzaClaro);
        texto("PCQS · Relatório de recebimento de salmão · " + TX(c.loja) + " · NF " +
              TX(c.nf) + " · custo real " + pcqsRs(t.custoReal) + "/Kg", M, 286);
        texto(p + " / " + total, M + L, 286, { align: "right" });
      }
    }
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

  window.PCQS_MODELO_C = documento;
  if (typeof module !== "undefined" && module.exports) module.exports = documento;
})();
