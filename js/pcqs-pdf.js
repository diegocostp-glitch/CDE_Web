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
// Modelo NOREN, o mesmo da Ordem de Compra (js/oc-pdf.js): cortina laranja com
// ondas seigaiha e a logo, a faixa de datas logo abaixo, títulos de seção com o
// quadradinho laranja, tabelas com cabeçalho nori e filete laranja, assinaturas
// em itálico sobre a linha e a tira da cortina nas folhas de continuação. É o
// mesmo remetente chegando na caixa de entrada do mesmo fornecedor. Os temas da
// tela (inclusive o mono) não valem aqui — documento que muda de cor conforme
// quem exportou não é documento.
//
// Verde, âmbar e vermelho continuam só onde dizem a situação (veredito, linha
// divergente, caixa reprovada): é o que a diretoria procura em diagonal.
//
// Precisa de js/oc-logo.js (OC_LOGO_IMG) carregado antes.
// ============================================================================

const PCQS_COR = {
  marca: [237, 63, 3],          // laranja da cortina (#ED3F03), o mesmo da OC
  onda: [244, 90, 38],          // seigaiha: um passo acima do laranja, só textura
  tinta: [26, 26, 26],
  texto: [51, 51, 51],
  rotulo: [138, 138, 138],
  claro: [170, 170, 170],
  borda: [228, 228, 228],
  zebra: [250, 250, 250],
  nori: [33, 37, 35],           // cabeçalho das tabelas: preto esverdeado da alga
  obs: [253, 236, 228],
  caixa: [247, 247, 247],
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

const PCQS_MARGEM = 12.7;         // a mesma margem da OC
const PCQS_LARG = 210 - 2 * PCQS_MARGEM;
const PCQS_RODAPE = 279;          // o conteúdo para aqui; abaixo é o rodapé
const PCQS_TOPO = 18;             // folha de continuação: abaixo da tira da cortina

// Texto em caixa alta e vazio como travessão: o documento é lido em diagonal,
// e campo vazio sem marca parece campo esquecido.
const pcqsTx = (v) => {
  const s = (v === null || v === undefined) ? "" : String(v).trim();
  return s !== "" ? s.toUpperCase() : "—";
};

// Nome de loja e fornecedor em caixa de título, como na OC ("Sushi Boulevard
// Doca"), e não em MAIÚSCULAS. Sigla com ponto (S.A.) fica em maiúsculas.
const PCQS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "em"]);
function pcqsTitulo(v) {
  const s = (v === null || v === undefined) ? "" : String(v).trim();
  if (!s) return "—";
  return s.toLowerCase().split(/\s+/).map((p, k) => {
    if (k && PCQS_MINUSCULAS.has(p)) return p;
    if (/^([a-zà-ú]\.)+$/.test(p)) return p.toUpperCase();
    return p.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
  }).join(" ");
}

// Ondas seigaiha: fileiras de escamas, cada uma cobre a metade de baixo da
// anterior. Desenhadas dentro de um recorte, para não vazar da capa.
function pcqsSeigaiha(doc, x0, y0, w, h, r) {
  doc.saveGraphicsState();
  doc.rect(x0, y0, w, h, null); doc.clip(); doc.discardPath();
  doc.setLineWidth(0.26);
  doc.setFillColor(...PCQS_COR.marca); doc.setDrawColor(...PCQS_COR.onda);
  for (let lin = 0, y = y0 - r / 2; y < y0 + h + r; lin++, y += r / 2) {
    const desloc = lin % 2 ? r : 0;
    for (let x = x0 - 2 * r + desloc; x < x0 + w + 2 * r; x += 2 * r) {
      doc.circle(x, y, r, "FD");
      doc.circle(x, y, r * 0.7, "S");
      doc.circle(x, y, r * 0.4, "S");
    }
  }
  doc.restoreGraphicsState();
}

function pcqsDocumento(analise, extras) {
  const ex = extras || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const cab = analise.cab || {};
  const tot = analise.tot;
  const tom = PCQS_TOM[analise.veredito.tipo] || PCQS_TOM.ressalva;
  const M = PCQS_MARGEM, W = PCQS_LARG;

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
    doc.setTextColor(...(cor || PCQS_COR.texto));
  };
  // Texto espaçado alinhado à direita: o jsPDF não conta o charSpace ao alinhar.
  const textoDireita = (t, x, yy, espaco) => {
    const w = doc.getTextWidth(t) + espaco * (t.length - 1);
    texto(t, x - w, yy, { charSpace: espaco });
  };
  // Rótulo de campo: o menor tipo do documento, em caixa alta espaçada.
  const rotulo = (t, x, yy, cor) => {
    fonte(5.3, "bold", cor || PCQS_COR.rotulo);
    texto(String(t).toUpperCase(), x, yy, { charSpace: 0.35 });
  };
  // Título de seção, como "COMPRADOR" e "FORNECEDOR" na OC: quadradinho
  // laranja, caixa alta espaçada e um fio embaixo.
  const secao = (titulo) => {
    y += 2.1;
    doc.setFillColor(...PCQS_COR.marca); doc.rect(M, y - 2.1, 2.1, 2.1, "F");
    fonte(7.1, "bold", PCQS_COR.tinta);
    texto(String(titulo).toUpperCase(), M + 3.9, y, { charSpace: 0.45 });
    doc.setDrawColor(...PCQS_COR.borda); doc.setLineWidth(0.26);
    doc.line(M, y + 2.2, M + W, y + 2.2);
    y += 6.2;
  };
  const ALT_SECAO = 8.3;
  const quebra = (altura) => {
    if (y + altura <= PCQS_RODAPE) return;
    doc.addPage();
    y = PCQS_TOPO;
  };
  // Faixa com filete colorido à esquerda: observação, não conformidade, frase
  // do acerto — o mesmo bloco da observação do comprador na OC.
  const faixa = (x, yy, w, h, fundo, filete) => {
    doc.setFillColor(...fundo); doc.rect(x, yy, w, h, "F");
    doc.setFillColor(...filete); doc.rect(x, yy, 1.06, h, "F");
  };

  // Tabelas no padrão da OC: cabeçalho nori com filete laranja, zebra clara e
  // fio fino entre as linhas. `extra` acrescenta as cores de situação.
  const tabela = (opc, extra) => {
    const pinta = opc.didParseCell;
    doc.autoTable(Object.assign({
      startY: y,
      theme: "plain",
      headStyles: { fillColor: PCQS_COR.nori, textColor: PCQS_COR.branco, fontStyle: "bold",
                    fontSize: 5.8, halign: "center", valign: "middle",
                    cellPadding: { top: 2.4, bottom: 2.6, left: 1.4, right: 1.4 } },
      footStyles: { fillColor: PCQS_COR.caixa, textColor: PCQS_COR.tinta, fontStyle: "bold",
                    fontSize: 6.8, halign: "center" },
      styles: { font: "helvetica", fontSize: 6.9, textColor: PCQS_COR.texto, valign: "middle",
                halign: "center", overflow: "linebreak",
                cellPadding: { top: 1.9, bottom: 1.9, left: 1.4, right: 1.4 } },
      margin: { left: M, right: M, top: PCQS_TOPO, bottom: 297 - PCQS_RODAPE },
    }, extra, {
      didParseCell: (d) => {
        if (d.section === "body" && d.row.index % 2) d.cell.styles.fillColor = PCQS_COR.zebra;
        if (pinta) pinta(d);
      },
      // Desenhado na ÚLTIMA célula da linha: na primeira, as células seguintes
      // pintavam o fundo por cima e o filete sumia depois da primeira coluna.
      didDrawCell: (d) => {
        if (d.column.index !== d.table.columns.length - 1) return;
        if (d.section === "head") {
          doc.setFillColor(...PCQS_COR.marca);
          doc.rect(M, d.cell.y + d.cell.height - 0.8, W, 0.8, "F");
        } else if (d.section === "body") {
          doc.setDrawColor(...PCQS_COR.borda); doc.setLineWidth(0.26);
          doc.line(M, d.cell.y + d.cell.height, M + W, d.cell.y + d.cell.height);
        }
      },
    }));
  };

  // ------------------------------------------------------------------ capa
  // A cortina: laranja com ondas, fendas brancas e a logo no primeiro painel.
  const altCapa = 46.5;
  doc.setFillColor(...PCQS_COR.marca); doc.rect(0, 0, 210, altCapa, "F");
  pcqsSeigaiha(doc, 0, 0, 210, altCapa, 6.9);
  // Selo do veredito medido antes das fendas: a fenda que cairia em cima dele
  // (o "APROVADO COM RESSALVAS" é bem mais largo que o "APROVADA" da OC) não
  // é desenhada.
  const selo = String(analise.veredito.rotulo || "").toUpperCase();
  fonte(6, "bold", tom.cor);
  const wSelo = doc.getTextWidth(selo) + 0.3 * (selo.length - 1) + 9;
  const xSelo = 210 - M - wSelo;
  doc.setFillColor(255, 255, 255);
  doc.rect(71.4, 9, 1.3, altCapa - 9, "F");
  [117.5, 163.5].filter((x) => x + 1.3 < xSelo - 3)
    .forEach((x) => doc.rect(x, 33.9, 1.3, altCapa - 33.9, "F"));
  if (typeof OC_LOGO_IMG !== "undefined") {
    doc.addImage(OC_LOGO_IMG, "PNG", 9.25, 10.75, 52.9, 25, undefined, "FAST");
  }

  fonte(6.8, "normal", PCQS_COR.branco);
  textoDireita("QUALIDADE  ·  RECEBIMENTO DE SALMÃO", 210 - M, 11, 0.55);
  // A nota fiscal é o número do documento, como o nº da OC. Número comprido
  // encolhe até caber no painel da direita.
  const nf = "NF " + (String(cab.nf || "").trim() || "—");
  let tam = 30;
  fonte(tam, "bold", PCQS_COR.branco);
  while (tam > 16 && doc.getTextWidth(nf) > 118) { tam -= 1; doc.setFontSize(tam); }
  texto(nf, 210 - M, 24.5, { align: "right" });
  fonte(6.8, "bold", PCQS_COR.branco);
  texto(pcqsTitulo(cab.fornecedor) + "  ·  " + pcqsTitulo(cab.loja), 210 - M, 29.5, { align: "right" });

  // selo do veredito, na cor da situação: é a primeira coisa que se procura
  fonte(6, "bold", tom.cor);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(xSelo, 36.4, wSelo, 5.6, 2.8, 2.8, "F");
  doc.setFillColor(...tom.cor); doc.circle(210 - M - wSelo + 3.6, 39.2, 0.8, "F");
  texto(selo, 210 - M - wSelo + 5.6, 40.2, { charSpace: 0.3 });

  // ------------------------------------------- a faixa de datas e números
  y = altCapa;
  const dataEntrega = pcqsData(cab.entrega);
  const dataValidade = pcqsData(cab.validade);
  const semana = (dt) => dt ? dt.toLocaleDateString("pt-BR", { weekday: "long" }) : "";
  const faixaCab = [
    ["Entrega", dataEntrega ? pcqsDataBR(dataEntrega) : (String(cab.entrega || "").trim() || "—"),
      semana(dataEntrega)],
    ["Validade", dataValidade ? pcqsDataBR(dataValidade) : (String(cab.validade || "").trim() || "—"),
      dataEntrega && dataValidade ? pcqsDias(dataEntrega, dataValidade) + " dias após a entrega" : ""],
    ["Caixas", (String(cab.caixasNF || "").trim() || "—"),
      analise.caixas.length + (analise.caixas.length === 1 ? " conferida" : " conferidas")],
    ["Libragem contratada", (String(tot.libragemContratada || "").trim() || "—"),
      tot.faixaContratada ? pcqsFmt(tot.faixaContratada.min, 3) + " a " +
        pcqsFmt(tot.faixaContratada.max, 3) + " kg por peixe" : ""],
  ];
  const colD = W / 4;
  faixaCab.forEach(([r, v, s], n) => {
    const x = M + n * colD + (n ? 3.7 : 0);
    rotulo(r, x, y + 6.6);
    fonte(10.5, "bold", PCQS_COR.tinta);
    texto(v, x, y + 11.8);
    if (s) { fonte(5.6, "normal", PCQS_COR.claro); texto(s, x, y + 14.8); }
    if (n) {
      doc.setDrawColor(...PCQS_COR.borda); doc.setLineWidth(0.26);
      doc.line(M + n * colD, y, M + n * colD, y + 18.5);
    }
  });
  y += 18.5;
  doc.setDrawColor(...PCQS_COR.borda); doc.setLineWidth(0.26); doc.line(M, y, M + W, y);
  y += 7.4;

  // ------------------------------------------------------- veredito
  secao("Situação do recebimento");
  const altSit = 17;
  doc.setFillColor(...tom.cor);
  doc.rect(M, y, 62, altSit, "F");
  const rot = analise.veredito.rotulo;
  fonte(rot.length > 12 ? 11 : 16, "bold", PCQS_COR.branco);
  texto(rot, M + 31, y + altSit / 2 + (rot.length > 12 ? 1 : 1.8), { align: "center" });

  doc.setFillColor(...tom.claro);
  doc.rect(M + 62, y, W - 62, altSit, "F");
  fonte(8.5, "bold", PCQS_COR.tinta);
  const linhasSit = doc.splitTextToSize(analise.veredito.resumo, W - 72);
  texto(linhasSit.slice(0, 2), M + 67, y + (linhasSit.length > 1 ? 7 : 10));
  if (linhasSit.length <= 1) {
    fonte(7.5, "normal", PCQS_COR.texto);
    texto(analise.financeiro.rotulo === "SEM ACERTO A FAZER" ? "Sem acerto financeiro pendente."
          : analise.financeiro.rotulo, M + 67, y + 13.5);
  }
  y += altSit + 4.8;

  // ------------------------------------------------------- números do acerto
  // Caixas no desenho do total da OC: fundo cinza, filete à esquerda na cor do
  // número, rótulo em cima e o valor grande.
  const cartoes = [
    { rot: "Peso nota fiscal", val: pcqsKg(tot.pesoNF), pe: "conforme NF", cor: PCQS_COR.tinta },
    { rot: "Peso conferido", val: pcqsKg(tot.pesoRecebido), pe: "pesado na loja", cor: PCQS_COR.tinta },
    { rot: "Divergência de peso", val: pcqsSinalKg(tot.difPeso),
      pe: pcqsFmt(tot.difPesoPerc, 2) + "% do faturado",
      cor: Math.abs(tot.difPeso) > tot.tolTotal ? PCQS_COR.vermelho : PCQS_COR.verde },
    { rot: "Acerto financeiro", val: pcqsRs(analise.financeiro.valor),
      pe: analise.financeiro.direcao === "fornecedor" ? "a creditar à loja"
        : (analise.financeiro.direcao === "loja" ? "a complementar" : "nada a acertar"),
      cor: analise.financeiro.valor > 0 ? PCQS_COR.marca : PCQS_COR.verde },
  ];
  const gap = 3.2;
  const larguraC = (W - 3 * gap) / 4;
  cartoes.forEach((c, i) => {
    const x = M + i * (larguraC + gap);
    faixa(x, y, larguraC, 20, PCQS_COR.caixa, c.cor);
    rotulo(c.rot, x + 4.2, y + 5.4);
    fonte(12.5, "bold", c.cor);
    texto(c.val, x + 4.2, y + 12.6);
    fonte(5.6, "normal", PCQS_COR.claro);
    texto(c.pe, x + 4.2, y + 16.6);
  });
  y += 20 + 7.4;

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
  tabela({
    // A cor mora na coluna da situação e na da diferença: quem lê em diagonal
    // precisa achar a linha divergente sem comparar número com número.
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index === 0) d.cell.styles.halign = "left";
      if (d.section !== "body") return;
      const l = analise.comparativo[d.row.index];
      if (d.column.index === 4) {
        d.cell.styles.textColor = l.ok ? PCQS_COR.verde : PCQS_COR.vermelho;
        d.cell.styles.fillColor = l.ok ? PCQS_COR.verdeClaro : PCQS_COR.vermelhoClaro;
      }
      if (d.column.index === 3 && !l.ok) d.cell.styles.textColor = PCQS_COR.vermelho;
    },
  }, {
    head: [["INDICADOR", "NOTA FISCAL / ETIQUETAS", "CONFERIDO NA LOJA", "DIFERENÇA", "SITUAÇÃO"]],
    body: analise.comparativo.map((l) => [l.indicador, valorDe(l, "nf"), valorDe(l, "rec"),
                                          difDe(l), l.ok ? "OK" : "DIVERGENTE"]),
    columnStyles: { 0: { halign: "left", cellWidth: 58, fontStyle: "bold", textColor: [34, 34, 34] },
                    1: { fontStyle: "bold" }, 2: { fontStyle: "bold" },
                    3: { cellWidth: 26, fontStyle: "bold" },
                    4: { cellWidth: 26, fontSize: 6.2, fontStyle: "bold" } },
  });
  y = doc.lastAutoTable.finalY + 3;
  const notas = analise.comparativo.filter((l) => l.nota).map((l) => l.nota);
  if (notas.length) {
    fonte(6.2, "italic", PCQS_COR.rotulo);
    texto(notas.map((n) => "• " + n), M, y + 1.5);
    y += notas.length * 2.8 + 2;
  }
  y += 5;

  // ------------------------------------------------------- não conformidades
  quebra(ALT_SECAO + 14);
  secao("Não conformidades apuradas");
  if (!analise.ncs.length) {
    faixa(M, y, W, 12, PCQS_COR.verdeClaro, PCQS_COR.verde);
    fonte(8.2, "bold", PCQS_COR.verde);
    texto("Nenhuma não conformidade apurada nesta entrega.", M + 4.2, y + 7.5);
    y += 12 + 7.4;
  } else {
    analise.ncs.forEach((n) => {
      const grave = n.gravidade === "alta";
      const cor = grave ? PCQS_COR.vermelho : PCQS_COR.ambar;
      const claro = grave ? PCQS_COR.vermelhoClaro : PCQS_COR.ambarClaro;
      const detalhe = n.detalhe + (n.caixas.length
        ? " Caixas: " + n.caixas.join(", ") + "." : "");
      fonte(7.1, "normal");
      const linhas = doc.splitTextToSize(detalhe, W - 34);
      const alt = 9 + linhas.length * 3.1 + 2.5;
      quebra(alt + 4);
      faixa(M, y, W, alt, claro, cor);
      fonte(8, "bold", PCQS_COR.tinta);
      texto(n.titulo, M + 4.2, y + 6);
      // selo de gravidade: "tratativa imediata" x "ressalva a esclarecer"
      fonte(5.6, "bold", cor);
      textoDireita(grave ? "TRATATIVA IMEDIATA" : "RESSALVA", M + W - 3, y + 6, 0.3);
      fonte(7.1, "normal", PCQS_COR.texto);
      texto(linhas, M + 4.2, y + 10.5);
      y += alt + 3;
    });
    y += 4.4;
  }

  // ------------------------------------------------------- conciliação
  // A reserva é a altura REAL do bloco (título + faixa escura + frase), medida
  // antes de decidir a quebra. Com uma reserva chutada por cima, a conciliação
  // pulava para a página seguinte e deixava um terço da primeira em branco.
  fonte(7.1, "normal", PCQS_COR.texto);
  const linhasFr = doc.splitTextToSize(analise.financeiro.frase, W - 12);
  const altFr = 6 + linhasFr.length * 3.2;
  quebra(ALT_SECAO + 17 + altFr + 4);
  secao("Conciliação financeira");
  doc.setFillColor(...PCQS_COR.nori);
  doc.rect(M, y, W, 17, "F");
  doc.setFillColor(...PCQS_COR.marca);
  doc.rect(M, y, 1.06, 17, "F");
  rotulo("Valor a acertar", M + 5.3, y + 7.4, PCQS_COR.claro);
  fonte(18, "bold", PCQS_COR.branco);
  texto(pcqsRs(analise.financeiro.valor), M + 5.3, y + 13.6);
  fonte(7.1, "bold", PCQS_COR.marca);
  textoDireita(String(analise.financeiro.rotulo || "").toUpperCase(), M + W - 5.3, y + 10, 0.35);
  y += 17;

  faixa(M, y, W, altFr, PCQS_COR.obs, PCQS_COR.marca);
  fonte(7.1, "normal", PCQS_COR.texto);
  texto(linhasFr, M + 5.3, y + 5);
  y += altFr + 7.4;

  // ------------------------------------------------------- caixa a caixa
  quebra(80);
  secao("Conferência de peso, caixa a caixa");
  const temBruto = analise.caixas.some((c) => c.pesoBruto > 0);
  const cabPeso = ["CX", "LOTE", "LIBRAGEM", "PEIXES"]
    .concat(temBruto ? ["PESO BRUTO"] : [])
    .concat(["PESO ETIQUETA", "PESO FÍSICO", "DIFERENÇA", "PESO MÉDIO", "SITUAÇÃO"]);
  tabela({
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const c = analise.caixas[d.row.index];
      const ult = cabPeso.length - 1;
      if (d.column.index === ult) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 6.2;
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
  }, {
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
    columnStyles: { 0: { cellWidth: 9, textColor: [154, 154, 154] } },
  });
  y = doc.lastAutoTable.finalY + 7.4;

  // ------------------------------------------------------- sensorial
  quebra(60);
  secao("Avaliação sensorial, gelo e validade");
  const temMotivo = analise.caixas.some((c) => c.motivo);
  const cabSens = ["CX", "ODOR", "VISUAL", "FIBRA", "GELO", "VALIDADE", "DIAS", "STATUS"]
    .concat(temMotivo ? ["MOTIVO DA REPROVAÇÃO"] : []);
  tabela({
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
  }, {
    head: [cabSens],
    body: analise.caixas.map((c) => [String(c.n).padStart(2, "0"), pcqsTx(c.odor),
      pcqsTx(c.visual), pcqsTx(c.fibra), pcqsTx(c.gelo), pcqsTx(c.validade),
      c.diasValidade === null ? "—" : String(c.diasValidade),
      pcqsTx(c.status || c.veredito)]
      .concat(temMotivo ? [pcqsTx(c.motivo)] : [])),
    columnStyles: temMotivo
      ? { 0: { cellWidth: 9, textColor: [154, 154, 154] }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 },
          3: { cellWidth: 20 }, 4: { cellWidth: 34 }, 5: { cellWidth: 20 }, 6: { cellWidth: 11 },
          7: { cellWidth: 20 } }
      : { 0: { cellWidth: 9, textColor: [154, 154, 154] }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 },
          3: { cellWidth: 25 }, 4: { cellWidth: 42.6 }, 5: { cellWidth: 24 }, 6: { cellWidth: 12 },
          7: { cellWidth: 22 } },
  });
  y = doc.lastAutoTable.finalY + 7.4;

  // ------------------------------------------------------- observações
  const obs = [].concat(analise.observacoes || [])
    .concat(ex.obs ? [ex.obs] : []).filter((o) => String(o).trim());
  if (obs.length) {
    fonte(7.1, "normal", PCQS_COR.texto);
    const linhasObs = doc.splitTextToSize(obs.join("  •  "), W - 12);
    const altObs = 6 + linhasObs.length * 3.2;
    quebra(ALT_SECAO + altObs + 4);
    secao("Observações da conferência");
    faixa(M, y, W, altObs, PCQS_COR.obs, PCQS_COR.marca);
    fonte(7.1, "normal", PCQS_COR.texto);
    texto(linhasObs, M + 5.3, y + 5);
    y += altObs + 7.4;
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
  fonte(6.4, "normal", PCQS_COR.rotulo);
  const linhasCrit = [];
  criterios.forEach((c) => doc.splitTextToSize("• " + c, W - 8)
    .forEach((l) => linhasCrit.push(l)));

  // Critérios e assinaturas quebram JUNTOS. Medidos um a um, o relatório longo
  // acabava com a régua no fim de uma página e três assinaturas sozinhas na
  // seguinte; medidos como um par, ou os dois cabem aqui, ou os dois começam
  // a página nova — que aí tem conteúdo, e não só linha para assinar.
  const altCrit = ALT_SECAO + linhasCrit.length * 3.1 + 5;
  const altAss = ALT_SECAO + 16;
  quebra(altCrit + altAss);
  secao("Critérios aplicados nesta conferência");
  fonte(6.4, "normal", PCQS_COR.rotulo);   // secao() deixou a fonte em negrito
  texto(linhasCrit, M, y + 1.5, { lineHeightFactor: 1.35 });
  y += linhasCrit.length * 3.1 + 5;

  // ------------------------------------------------------- validação
  // Assinaturas no desenho da OC: rótulo em cima, nome em itálico sobre a
  // linha, cargo embaixo. Quem valida é a casa: suprimentos, operação e o
  // supervisor que recebeu. O fornecedor não assina o relatório — ele recebe o
  // resultado já validado.
  secao("Validação");
  const assin = [
    ["Validado por", ex.assSuprimentos, "Gerente Suprimentos"],
    ["Validado por", ex.assOperacional, "Gerente Operacional"],
    ["Recebido por", ex.assSupervisor || cab.responsavel, "Supervisor Operacional"],
  ];
  const wA = (W - 2 * 5.8) / 3;
  assin.forEach(([r, nome, cargo], n) => {
    const x = M + n * (wA + 5.8);
    rotulo(r, x, y + 2);
    // Campo sem nome digitado fica em branco: linha para assinar à mão é melhor
    // que um travessão no lugar de quem vai assinar.
    const quem = pcqsNomeProprio(nome);
    if (quem) {
      doc.setFont("times", "italic"); doc.setFontSize(10.5); doc.setTextColor(...PCQS_COR.texto);
      texto(quem, x, y + 9.3);
    }
    doc.setDrawColor(154, 154, 154); doc.setLineWidth(0.26);
    doc.line(x, y + 10.4, x + wA, y + 10.4);
    fonte(5.6, "normal", PCQS_COR.rotulo);
    texto(cargo, x + wA / 2, y + 13.4, { align: "center" });
  });

  // ------------------------------------------------------- rodapé
  const total = doc.internal.getNumberOfPages();
  const ident = "Relatório de Recebimento de Salmão  ·  NF " + (String(cab.nf || "").trim() || "—");
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // folha de continuação: uma tira da cortina, para a folha solta dizer de onde é
    if (p > 1) {
      doc.setFillColor(...PCQS_COR.marca); doc.rect(0, 0, 210, 9, "F");
      fonte(7, "bold", PCQS_COR.branco);
      texto("SUSHI BOULEVARD", M, 5.8, { charSpace: 0.4 });
      fonte(7, "normal", PCQS_COR.branco);
      texto(ident + "  ·  continuação", 210 - M, 5.8, { align: "right" });
    }
    doc.setDrawColor(...PCQS_COR.borda); doc.setLineWidth(0.26);
    doc.line(M, 283.5, M + W, 283.5);
    fonte(5.6, "normal", [85, 85, 85]);
    texto(pcqsTitulo(cab.loja) + "  ·  " + pcqsTitulo(cab.fornecedor) +
          "  ·  Supervisor responsável: " + (pcqsNomeProprio(cab.responsavel) || "—") +
          "  ·  Custo real " + pcqsRs(tot.custoReal) + "/Kg  ·  Emitido em " +
          new Date().toLocaleDateString("pt-BR"), M, 287.6);
    // dois traços finos, como hashi apoiados, e a paginação
    doc.setFillColor(...PCQS_COR.marca);
    doc.rect(M, 291.3, 9, 0.42, "F"); doc.rect(M, 292.5, 6.9, 0.42, "F");
    fonte(5.6, "normal", PCQS_COR.rotulo);
    texto("Sushi Boulevard  ·  " + ident, M + 11.6, 292.6);
    texto("Página " + p + " de " + total, 210 - M, 292.6, { align: "right" });
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
