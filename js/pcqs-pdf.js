// ============================================================================
// RELATÓRIO DE RECEBIMENTO DE SALMÃO — o PDF que sai do PCQS
//
// A planilha de qualidade é um formulário de campo: serve para a gerência
// preencher com a caixa aberta na frente, e é ilegível para quem vai decidir.
// Este documento é o outro lado — a mesma conferência escrita para diretoria,
// gerência e fornecedor lerem na ordem em que decidem: veredito, quanto de
// diferença, quanto isso vale em reais, o que exatamente não conformou e, só
// depois, a caixa a caixa que sustenta cada afirmação.
//
// Mesma paleta e mesma capa da Ordem de Compra (js/oc-pdf.js): é o mesmo
// remetente chegando na caixa de entrada do mesmo fornecedor. Os temas da tela
// (inclusive o mono) não valem aqui — documento que muda de cor conforme quem
// exportou não é documento.
// ============================================================================

const PCQS_COR = {
  laranja: [243, 111, 29],
  preto: [26, 26, 26],
  tinta: [55, 55, 55],
  cinza: [120, 120, 120],
  cinzaClaro: [247, 247, 247],
  cinzaBorda: [223, 223, 223],
  verde: [26, 150, 84],
  verdeClaro: [232, 246, 238],
  vermelho: [199, 48, 38],
  vermelhoClaro: [253, 235, 233],
  ambar: [206, 133, 10],
  ambarClaro: [254, 245, 228],
  branco: [255, 255, 255],
};

const PCQS_TOM = {
  aprovado: { cor: PCQS_COR.verde, claro: PCQS_COR.verdeClaro },
  ressalva: { cor: PCQS_COR.ambar, claro: PCQS_COR.ambarClaro },
  reprovado: { cor: PCQS_COR.vermelho, claro: PCQS_COR.vermelhoClaro },
};

const PCQS_MARGEM = 15;
const PCQS_LARG = 180;            // 210 - duas margens
const PCQS_RODAPE = 279;          // abaixo disso, vira página (o filete do
                                  // rodapé fica em 284, com 5 mm de folga)

// Texto em caixa alta e vazio como travessão: o documento é lido em diagonal,
// e campo vazio sem marca parece campo esquecido.
const pcqsTx = (v) => {
  const s = (v === null || v === undefined) ? "" : String(v).trim();
  return s !== "" ? s.toUpperCase() : "—";
};

function pcqsDocumento(analise, extras) {
  const ex = extras || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const cab = analise.cab || {};
  const tot = analise.tot;
  const tom = PCQS_TOM[analise.veredito.tipo] || PCQS_TOM.ressalva;

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
    doc.setTextColor(...(cor || PCQS_COR.tinta));
  };
  // Rótulo de seção: cinza, pequeno, espaçado. Divide o documento sem gastar
  // uma faixa colorida a cada bloco.
  const secao = (titulo) => {
    fonte(7.5, "bold", PCQS_COR.cinza);
    texto(String(titulo).toUpperCase(), PCQS_MARGEM, y, { charSpace: 0.35 });
    y += 3.5;
  };
  const quebra = (altura) => {
    if (y + altura <= PCQS_RODAPE) return;
    doc.addPage();
    y = 20;
  };

  // ------------------------------------------------------------------ capa
  const capa = (typeof DEFAULT_HEADER_IMG !== "undefined") ? DEFAULT_HEADER_IMG : null;
  if (capa) {
    doc.addImage(capa, /image\/jpe?g/.test(capa) ? "JPEG" : "PNG", 0, 0, 210, 45);
  } else {
    doc.setFillColor(...PCQS_COR.laranja);
    doc.rect(0, 0, 210, 45, "F");
  }
  fonte(13.5, "bold", PCQS_COR.branco);
  texto("RELATÓRIO DE RECEBIMENTO DE SALMÃO", 202, 15, { align: "right" });
  fonte(9, "bold", PCQS_COR.branco);
  texto("PCQS · CONTROLE DE QUALIDADE DO SALMÃO", 202, 21, { align: "right" });
  fonte(8.5, "bold", PCQS_COR.branco);
  texto(pcqsTx(cab.loja) + "   •   NF " + pcqsTx(cab.nf) +
        "   •   " + pcqsTx(cab.fornecedor), 202, 30, { align: "right" });
  fonte(7.5, "normal", PCQS_COR.branco);
  texto("Entrega " + pcqsTx(cab.entrega) + "  •  Validade " + pcqsTx(cab.validade) +
        "  •  " + pcqsTx(cab.caixasNF) + " caixas  •  Libragem contratada " +
        pcqsTx(tot.libragemContratada), 202, 36, { align: "right" });
  texto("Supervisor responsável: " + (pcqsNomeProprio(cab.responsavel) || "—") +
        "  •  Emitido em " + new Date().toLocaleDateString("pt-BR"), 202, 41, { align: "right" });

  y = 55;

  // ------------------------------------------------------- veredito
  secao("Situação do recebimento");
  const altSit = 17;
  doc.setFillColor(...tom.cor);
  doc.rect(PCQS_MARGEM, y, 62, altSit, "F");
  const rot = analise.veredito.rotulo;
  fonte(rot.length > 12 ? 11 : 16, "bold", PCQS_COR.branco);
  texto(rot, PCQS_MARGEM + 31, y + altSit / 2 + (rot.length > 12 ? 1 : 1.8), { align: "center" });

  doc.setFillColor(...tom.claro);
  doc.rect(PCQS_MARGEM + 62, y, PCQS_LARG - 62, altSit, "F");
  fonte(8.5, "bold", PCQS_COR.preto);
  const linhasSit = doc.splitTextToSize(analise.veredito.resumo, PCQS_LARG - 72);
  texto(linhasSit.slice(0, 2), PCQS_MARGEM + 67, y + (linhasSit.length > 1 ? 7 : 10));
  if (linhasSit.length <= 1) {
    fonte(7.5, "normal", PCQS_COR.tinta);
    texto(analise.financeiro.rotulo === "SEM ACERTO A FAZER" ? "Sem acerto financeiro pendente."
          : analise.financeiro.rotulo, PCQS_MARGEM + 67, y + 13.5);
  }
  y += altSit + 7;

  // ------------------------------------------------------- números do acerto
  const cartoes = [
    { rot: "PESO NOTA FISCAL", val: pcqsKg(tot.pesoNF), pe: "conforme NF", cor: PCQS_COR.preto },
    { rot: "PESO CONFERIDO", val: pcqsKg(tot.pesoRecebido), pe: "pesado na loja", cor: PCQS_COR.preto },
    { rot: "DIVERGÊNCIA DE PESO", val: pcqsSinalKg(tot.difPeso),
      pe: pcqsFmt(tot.difPesoPerc, 2) + "% do faturado",
      cor: Math.abs(tot.difPeso) > tot.tolTotal ? PCQS_COR.vermelho : PCQS_COR.verde },
    { rot: "ACERTO FINANCEIRO", val: pcqsRs(analise.financeiro.valor),
      pe: analise.financeiro.direcao === "fornecedor" ? "a creditar à loja"
        : (analise.financeiro.direcao === "loja" ? "a complementar" : "nada a acertar"),
      cor: analise.financeiro.valor > 0 ? PCQS_COR.laranja : PCQS_COR.verde },
  ];
  const larguraC = (PCQS_LARG - 3 * 2) / 4;
  cartoes.forEach((c, i) => {
    const x = PCQS_MARGEM + i * (larguraC + 2);
    doc.setFillColor(...PCQS_COR.cinzaClaro);
    doc.rect(x, y, larguraC, 22, "F");
    doc.setFillColor(...c.cor);
    doc.rect(x, y, larguraC, 0.9, "F");      // filete no topo, na cor do número
    fonte(6.2, "bold", PCQS_COR.cinza);
    texto(c.rot, x + larguraC / 2, y + 6, { align: "center", charSpace: 0.2 });
    fonte(13, "bold", c.cor);
    texto(c.val, x + larguraC / 2, y + 14, { align: "center" });
    fonte(6.2, "normal", PCQS_COR.cinza);
    texto(c.pe, x + larguraC / 2, y + 19, { align: "center" });
  });
  y += 22 + 9;

  // ------------------------------------------------------- comparativo
  secao("Comparativo — nota fiscal × conferido na loja");
  const valorDe = (l, qual) => {
    const v = l[qual];
    if (l.tipo === "texto") return pcqsTx(v);
    if (l.tipo === "rs") return pcqsRs(v);
    if (l.tipo === "pcs") return pcqsPcs(v);
    if (l.tipo === "qtd") return pcqsFmt(v, 0);
    return pcqsKg(v);
  };
  const difDe = (l) => {
    if (l.tipo === "texto") return l.ok ? "—" : "divergente";
    if (l.tipo === "rs") return pcqsSinalRs(l.dif);
    if (l.tipo === "pcs") return pcqsSinalPcs(l.dif);
    if (l.tipo === "qtd") return (l.dif > 0 ? "+" : "") + pcqsFmt(l.dif, 0);
    return pcqsSinalKg(l.dif);
  };
  doc.autoTable({
    startY: y,
    head: [["INDICADOR", "NOTA FISCAL / ETIQUETAS", "CONFERIDO NA LOJA", "DIFERENÇA", "SITUAÇÃO"]],
    body: analise.comparativo.map((l) => [l.indicador, valorDe(l, "nf"), valorDe(l, "rec"),
                                          difDe(l), l.ok ? "OK" : "DIVERGENTE"]),
    theme: "grid",
    headStyles: { fillColor: PCQS_COR.preto, textColor: PCQS_COR.branco, fontStyle: "bold",
                  halign: "center", fontSize: 7.2, cellPadding: 2 },
    styles: { fontSize: 7.6, textColor: PCQS_COR.tinta, lineColor: PCQS_COR.cinzaBorda,
              cellPadding: 2, valign: "middle" },
    columnStyles: { 0: { halign: "left", cellWidth: 58 }, 1: { halign: "center", fontStyle: "bold" },
                    2: { halign: "center", fontStyle: "bold" },
                    3: { halign: "center", cellWidth: 26, fontStyle: "bold" },
                    4: { halign: "center", cellWidth: 26, fontSize: 6.8, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [251, 251, 251] },
    margin: { left: PCQS_MARGEM, right: PCQS_MARGEM },
    // A cor mora na coluna da situação e na da diferença: quem lê em diagonal
    // precisa achar a linha divergente sem comparar número com número.
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const l = analise.comparativo[d.row.index];
      if (d.column.index === 4) {
        d.cell.styles.textColor = l.ok ? PCQS_COR.verde : PCQS_COR.vermelho;
        d.cell.styles.fillColor = l.ok ? PCQS_COR.verdeClaro : PCQS_COR.vermelhoClaro;
      }
      if (d.column.index === 3 && !l.ok) d.cell.styles.textColor = PCQS_COR.vermelho;
    },
  });
  y = doc.lastAutoTable.finalY + 3;
  const notas = analise.comparativo.filter((l) => l.nota).map((l) => l.nota);
  if (notas.length) {
    fonte(6.4, "italic", PCQS_COR.cinza);
    texto(notas.map((n) => "• " + n), PCQS_MARGEM, y + 1.5);
    y += notas.length * 2.8 + 2;
  }
  y += 5;

  // ------------------------------------------------------- não conformidades
  secao("Não conformidades apuradas");
  if (!analise.ncs.length) {
    doc.setFillColor(...PCQS_COR.verdeClaro);
    doc.rect(PCQS_MARGEM, y, PCQS_LARG, 12, "F");
    doc.setFillColor(...PCQS_COR.verde);
    doc.rect(PCQS_MARGEM, y, 1.4, 12, "F");
    fonte(8.5, "bold", PCQS_COR.verde);
    texto("Nenhuma não conformidade apurada nesta entrega.", PCQS_MARGEM + 5, y + 7.5);
    y += 12 + 8;
  } else {
    analise.ncs.forEach((n) => {
      const grave = n.gravidade === "alta";
      const cor = grave ? PCQS_COR.vermelho : PCQS_COR.ambar;
      const claro = grave ? PCQS_COR.vermelhoClaro : PCQS_COR.ambarClaro;
      const detalhe = n.detalhe + (n.caixas.length
        ? " Caixas: " + n.caixas.join(", ") + "." : "");
      fonte(7.2, "normal");
      const linhas = doc.splitTextToSize(detalhe, PCQS_LARG - 34);
      const alt = 9 + linhas.length * 3.1 + 2.5;
      quebra(alt + 4);
      doc.setFillColor(...claro);
      doc.rect(PCQS_MARGEM, y, PCQS_LARG, alt, "F");
      doc.setFillColor(...cor);
      doc.rect(PCQS_MARGEM, y, 1.4, alt, "F");
      fonte(8.2, "bold", PCQS_COR.preto);
      texto(n.titulo, PCQS_MARGEM + 5, y + 6);
      // selo de gravidade: "tratativa imediata" x "ressalva a esclarecer"
      fonte(6.2, "bold", cor);
      texto(grave ? "TRATATIVA IMEDIATA" : "RESSALVA",
            PCQS_MARGEM + PCQS_LARG - 3, y + 6, { align: "right" });
      fonte(7.2, "normal", PCQS_COR.tinta);
      texto(linhas, PCQS_MARGEM + 5, y + 10.5);
      y += alt + 3;
    });
    y += 5;
  }

  // ------------------------------------------------------- conciliação
  // A reserva é a altura REAL do bloco (rótulo + faixa preta + frase), medida
  // antes de decidir a quebra. Com uma reserva chutada por cima, a conciliação
  // pulava para a página seguinte e deixava um terço da primeira em branco.
  fonte(7.8, "normal", PCQS_COR.tinta);
  const linhasFr = doc.splitTextToSize(analise.financeiro.frase, PCQS_LARG - 12);
  const altFr = 6 + linhasFr.length * 3.4;
  quebra(3.5 + 17 + altFr + 4);
  secao("Conciliação financeira");
  doc.setFillColor(...PCQS_COR.preto);
  doc.rect(PCQS_MARGEM, y, PCQS_LARG, 17, "F");
  fonte(8.5, "bold", PCQS_COR.branco);
  texto("VALOR A ACERTAR", PCQS_MARGEM + 6, y + 10);
  fonte(16, "bold", PCQS_COR.branco);
  texto(pcqsRs(analise.financeiro.valor), PCQS_MARGEM + 88, y + 11.5, { align: "center" });
  fonte(8.5, "bold", PCQS_COR.laranja);
  texto(analise.financeiro.rotulo, PCQS_MARGEM + PCQS_LARG - 6, y + 10, { align: "right" });
  y += 17;

  fonte(7.8, "normal", PCQS_COR.tinta);
  doc.setFillColor(...PCQS_COR.cinzaClaro);
  doc.rect(PCQS_MARGEM, y, PCQS_LARG, altFr, "F");
  doc.setFillColor(...PCQS_COR.laranja);
  doc.rect(PCQS_MARGEM, y, 1.4, altFr, "F");
  texto(linhasFr, PCQS_MARGEM + 6, y + 5);
  y += altFr + 9;

  // ------------------------------------------------------- caixa a caixa
  quebra(80);
  secao("Conferência de peso, caixa a caixa");
  const temBruto = analise.caixas.some((c) => c.pesoBruto > 0);
  const cabPeso = ["CX", "LOTE", "LIBRAGEM", "PEIXES"]
    .concat(temBruto ? ["PESO BRUTO"] : [])
    .concat(["PESO ETIQUETA", "PESO FÍSICO", "DIFERENÇA", "PESO MÉDIO", "SITUAÇÃO"]);
  doc.autoTable({
    startY: y,
    head: [cabPeso],
    body: analise.caixas.map((c) => [String(c.n).padStart(2, "0"), pcqsTx(c.lote),
      pcqsTx(c.libragemConf || c.libragemEtiqueta), pcqsFmt(c.peixes, 0)]
      .concat(temBruto ? [c.pesoBruto ? pcqsKg(c.pesoBruto) : "—"] : [])
      .concat([pcqsKg(c.pesoLiquido), pcqsKg(c.pesoFisico), pcqsSinalKg(c.difEtiqueta),
               pcqsKg(c.pesoMedio), c.ok ? "OK" : (c.reprovada ? "REPROVADA" : "DIVERGENTE")])),
    foot: [["", "TOTAIS", "", pcqsFmt(tot.peixes, 0)]
      .concat(temBruto ? [""] : [])
      .concat([pcqsKg(tot.pesoEtiquetas), pcqsKg(tot.pesoRecebido),
               pcqsSinalKg(tot.pesoEtiquetas ? tot.pesoRecebido - tot.pesoEtiquetas : 0),
               pcqsKg(tot.pesoMedioRecebido), ""])],
    theme: "grid",
    headStyles: { fillColor: PCQS_COR.preto, textColor: PCQS_COR.branco, fontStyle: "bold",
                  halign: "center", fontSize: 6.6, cellPadding: 1.8 },
    footStyles: { fillColor: [240, 240, 240], textColor: PCQS_COR.preto, fontStyle: "bold",
                  halign: "center", fontSize: 7 },
    styles: { fontSize: 7.2, textColor: PCQS_COR.tinta, lineColor: PCQS_COR.cinzaBorda,
              cellPadding: 1.8, halign: "center", valign: "middle" },
    columnStyles: { 0: { cellWidth: 9, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [251, 251, 251] },
    margin: { left: PCQS_MARGEM, right: PCQS_MARGEM },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const c = analise.caixas[d.row.index];
      const ult = cabPeso.length - 1;
      if (d.column.index === ult) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 6.4;
        d.cell.styles.textColor = c.ok ? PCQS_COR.verde : PCQS_COR.vermelho;
        d.cell.styles.fillColor = c.ok ? PCQS_COR.verdeClaro : PCQS_COR.vermelhoClaro;
      }
      if (d.column.index === ult - 2 && c.pesoDivergente) {
        d.cell.styles.textColor = PCQS_COR.vermelho;
        d.cell.styles.fontStyle = "bold";
      }
      if (d.column.index === ult - 1 && c.foraDaFaixa) {
        d.cell.styles.textColor = PCQS_COR.vermelho;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ------------------------------------------------------- sensorial
  quebra(60);
  secao("Avaliação sensorial, gelo e validade");
  const temMotivo = analise.caixas.some((c) => c.motivo);
  const cabSens = ["CX", "ODOR", "VISUAL", "FIBRA", "GELO", "VALIDADE", "DIAS", "STATUS"]
    .concat(temMotivo ? ["MOTIVO DA REPROVAÇÃO"] : []);
  doc.autoTable({
    startY: y,
    head: [cabSens],
    body: analise.caixas.map((c) => [String(c.n).padStart(2, "0"), pcqsTx(c.odor),
      pcqsTx(c.visual), pcqsTx(c.fibra), pcqsTx(c.gelo), pcqsTx(c.validade),
      c.diasValidade === null ? "—" : String(c.diasValidade),
      pcqsTx(c.status || c.veredito)]
      .concat(temMotivo ? [pcqsTx(c.motivo)] : [])),
    theme: "grid",
    headStyles: { fillColor: PCQS_COR.preto, textColor: PCQS_COR.branco, fontStyle: "bold",
                  halign: "center", fontSize: 6.6, cellPadding: 1.8 },
    styles: { fontSize: 6.9, textColor: PCQS_COR.tinta, lineColor: PCQS_COR.cinzaBorda,
              cellPadding: 1.8, halign: "center", valign: "middle" },
    columnStyles: temMotivo
      ? { 0: { cellWidth: 9, fontStyle: "bold" }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 },
          4: { cellWidth: 34 }, 5: { cellWidth: 20 }, 6: { cellWidth: 11 }, 7: { cellWidth: 20 } }
      : { 0: { cellWidth: 9, fontStyle: "bold" }, 1: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: 24 },
          4: { cellWidth: 42 }, 5: { cellWidth: 24 }, 6: { cellWidth: 12 }, 7: { cellWidth: 21 } },
    alternateRowStyles: { fillColor: [251, 251, 251] },
    margin: { left: PCQS_MARGEM, right: PCQS_MARGEM },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const c = analise.caixas[d.row.index];
      const tipos = { 1: c.odorTipo, 2: c.visualTipo, 3: c.fibraTipo, 4: c.geloTipo };
      const t = tipos[d.column.index];
      if (t === "ruim") { d.cell.styles.textColor = PCQS_COR.vermelho; d.cell.styles.fontStyle = "bold"; }
      else if (t === "duvida") { d.cell.styles.textColor = PCQS_COR.ambar; }
      if (d.column.index === 6 && c.validadeCurta) {
        d.cell.styles.textColor = PCQS_COR.vermelho; d.cell.styles.fontStyle = "bold";
      }
      if (d.column.index === 7) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = c.reprovada ? PCQS_COR.vermelho : PCQS_COR.verde;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ------------------------------------------------------- observações
  const obs = [].concat(analise.observacoes || [])
    .concat(ex.obs ? [ex.obs] : []).filter((o) => String(o).trim());
  if (obs.length) {
    quebra(28);
    secao("Observações da conferência");
    fonte(7.8, "normal", PCQS_COR.tinta);
    const linhasObs = doc.splitTextToSize(obs.join("  •  "), PCQS_LARG - 12);
    const altObs = 6 + linhasObs.length * 3.4;
    doc.setFillColor(...PCQS_COR.cinzaClaro);
    doc.rect(PCQS_MARGEM, y, PCQS_LARG, altObs, "F");
    texto(linhasObs, PCQS_MARGEM + 6, y + 5);
    y += altObs + 8;
  }

  // ------------------------------------------------------- critérios
  // O fornecedor vai contestar o número; a régua tem de estar no documento,
  // não na conversa.
  const aj = analise.ajustes;
  const criterios = [
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
  fonte(6.8, "normal", PCQS_COR.cinza);
  const linhasCrit = [];
  criterios.forEach((c) => doc.splitTextToSize("• " + c, PCQS_LARG - 8)
    .forEach((l) => linhasCrit.push(l)));

  // Critérios e assinaturas quebram JUNTOS. Medidos um a um, o relatório longo
  // acabava com a régua no fim de uma página e três assinaturas sozinhas na
  // seguinte; medidos como um par, ou os dois cabem aqui, ou os dois começam
  // a página nova — que aí tem conteúdo, e não só linha para assinar.
  const altCrit = 3.5 + linhasCrit.length * 2.9 + 6;
  quebra(altCrit + 3.5 + 12 + 8);
  secao("Critérios aplicados nesta conferência");
  fonte(6.8, "normal", PCQS_COR.cinza);   // secao() deixou a fonte em negrito
  texto(linhasCrit, PCQS_MARGEM + 2, y + 2);
  y += linhasCrit.length * 2.9 + 6;

  // ------------------------------------------------------- validação
  // A folga antes dos nomes encolhe quando a página está no fim: assinatura um
  // pouco mais perto do texto é melhor que assinatura em página à parte.
  const folgaAss = (y + 3.5 + 12 + 8 <= PCQS_RODAPE) ? 12 : 6;
  secao("Validação");
  // Quem valida é a casa: suprimentos, operação e o supervisor que recebeu. O
  // fornecedor não assina o relatório — ele recebe o resultado já validado.
  const assin = [
    { nome: ex.assSuprimentos, papel: "GERENTE SUPRIMENTOS" },
    { nome: ex.assOperacional, papel: "GERENTE OPERACIONAL" },
    { nome: ex.assSupervisor || cab.responsavel, papel: "SUPERVISOR OPERACIONAL" },
  ];
  const largA = PCQS_LARG / 3;
  y += folgaAss;
  assin.forEach((a, i) => {
    const x = PCQS_MARGEM + i * largA;
    fonte(8, "normal", PCQS_COR.tinta);
    // Campo sem nome digitado fica em branco: linha para assinar à mão é melhor
    // que um travessão no lugar de quem vai assinar.
    texto(pcqsNomeProprio(a.nome), x + largA / 2, y, { align: "center" });
    doc.setDrawColor(...PCQS_COR.cinzaBorda);
    doc.setLineWidth(0.3);
    doc.line(x + 6, y + 3, x + largA - 6, y + 3);
    fonte(6.4, "bold", PCQS_COR.cinza);
    texto(a.papel, x + largA / 2, y + 7, { align: "center", charSpace: 0.2 });
  });

  // ------------------------------------------------------- rodapé
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PCQS_COR.cinzaBorda);
    doc.setLineWidth(0.2);
    doc.line(PCQS_MARGEM, 284, PCQS_MARGEM + PCQS_LARG, 284);
    fonte(6.2, "normal", PCQS_COR.cinza);
    texto("PCQS · Relatório de recebimento de salmão  |  " + pcqsTx(cab.loja) +
          "  |  NF " + pcqsTx(cab.nf) + "  |  " + pcqsTx(cab.fornecedor) +
          "  |  Custo real " + pcqsRs(tot.custoReal) + "/Kg", PCQS_MARGEM, 288);
    texto("Página " + p + " de " + total, PCQS_MARGEM + PCQS_LARG, 288, { align: "right" });
  }
  return doc;
}

// Mesmo padrão de nome do PDF da OC: o fornecedor recebe os dois documentos e
// eles ordenam juntos na pasta de quem confere.
function pcqsNomeArquivo(cab) {
  const d = new Date();
  const data = String(d.getDate()).padStart(2, "0") + "." +
               String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  const pedaco = (v, padrao) => String(v || padrao).toUpperCase().trim();
  return "RELATORIO DE RECEBIMENTO DE SALMAO - " + pedaco(cab.loja, "LOJA") + " - " +
         pedaco(cab.fornecedor, "FORNECEDOR") + " - NF " + pedaco(cab.nf, "SN") +
         " - " + data;
}
