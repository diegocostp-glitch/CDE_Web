// ============================================================================
// MODELO B — MAKISU
//
// O modelo para imprimir. Papel branco, quase sem tinta: no alto, a esteira
// de bambu de enrolar sushi (makisu) em listras claras, amarrada por dois fios
// laranja; as datas numa faixa escura que envolve a folha como o nori envolve
// o arroz. No lugar do carimbo, o campo de quem recebe — a OC impressa é a
// que o estoque usa para conferir a entrega.
//
// Substitui js/oc-pdf.js sem mexer na tela: mesma função montarPDF(oc, previa)
// e mesmo nomeArquivoOC. Precisa de Ideias/oc-marca.js carregado antes.
// ============================================================================

const fmtBR = (n, c = 2) => (isFinite(n) ? n : 0)
  .toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

const pdfVal = (v) => {
  const s = (v === null || v === undefined) ? "" : String(v).trim();
  return s !== "" ? s.toUpperCase() : "-";
};

const COR = {
  marca: [237, 63, 3],
  tinta: [26, 26, 26],
  texto: [55, 55, 55],
  rotulo: [120, 120, 120],
  borda: [222, 222, 222],
  nori: [33, 37, 35],
  noriTexto: [168, 176, 171],
  bambu: [242, 239, 232],      // listras da esteira: claras, para não gastar tinta
  bambuFio: [226, 221, 210],
};

// Esteira de bambu: varetas horizontais finas e dois fios atravessando.
function makisu(doc, y0, h) {
  doc.setFillColor(...COR.bambu); doc.rect(0, y0, 210, h, "F");
  doc.setDrawColor(...COR.bambuFio); doc.setLineWidth(0.25);
  for (let y = y0 + 1.1; y < y0 + h; y += 1.6) doc.line(0, y, 210, y);
  doc.setDrawColor(...COR.marca); doc.setLineWidth(0.5);
  [38, 172].forEach((x) => { doc.line(x, y0, x, y0 + h); doc.line(x + 1.2, y0, x + 1.2, y0 + h); });
}

// Texto espaçado alinhado à direita: o jsPDF não conta o charSpace ao alinhar,
// e o texto vazava da margem. A largura é medida e o texto, posto pela esquerda.
function textoDireita(doc, txt, x, y, espaco) {
  const w = doc.getTextWidth(txt) + espaco * (txt.length - 1);
  doc.text(txt, x - w, y, { charSpace: espaco });
}

function montarPDF(oc, previa) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  const un = oc.unidade || {};
  const forn = oc.fornecedor || {};
  const itens = (oc.itens || []).filter((i) => i.qtd > 0);
  const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);

  // === CAPA: esteira, marca e número ===
  makisu(doc, 0, 9);
  if (typeof OC_MARCA_IMG !== "undefined") doc.addImage(OC_MARCA_IMG, "PNG", 15, 14, 44, 22, undefined, "FAST");
  doc.setTextColor(...COR.rotulo); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  textoDireita(doc, "ORDEM DE COMPRA", 195, 19, 0.6);
  doc.setTextColor(...COR.tinta); doc.setFontSize(24);
  doc.text("Nº " + pdfVal(oc.numero), 195, 29.5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...COR.texto);
  doc.text(pdfVal(un.nome), 195, 35, { align: "right" });

  // === a tira de nori, com as datas ===
  let y = 41;
  doc.setFillColor(...COR.nori); doc.rect(0, y, 210, 13, "F");
  [["EMISSÃO", oc.dataEmissao], ["PREVISÃO DE ENTREGA", oc.dataEntrega],
   ["HORÁRIO DE RECEBIMENTO", oc.horario]].forEach(([rot, val], n) => {
    const x = 15 + n * 60;
    doc.setTextColor(...COR.noriTexto); doc.setFontSize(6.3); doc.setFont("helvetica", "bold");
    doc.text(rot, x, y + 5, { charSpace: 0.3 });
    doc.setTextColor(255, 255, 255); doc.setFontSize(9.5);
    doc.text(pdfVal(val), x, y + 10);
  });

  // === COMPRADOR e FORNECEDOR ===
  y += 22;
  const titulo = (txt, x, yy, w) => {
    doc.setTextColor(...COR.tinta); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
    doc.text(txt, x, yy, { charSpace: 0.5 });
    doc.setDrawColor(...COR.nori); doc.setLineWidth(0.5); doc.line(x, yy + 2, x + w, yy + 2);
  };
  const campo = (rot, val, x, yy, w) => {
    doc.setTextColor(...COR.rotulo); doc.setFontSize(6.3); doc.setFont("helvetica", "bold");
    doc.text(rot.toUpperCase(), x, yy, { charSpace: 0.2 });
    doc.setTextColor(...COR.texto); doc.setFontSize(8.3); doc.setFont("helvetica", "normal");
    const linhas = doc.splitTextToSize(pdfVal(val), w);
    doc.text(linhas, x, yy + 4);
    return 4 + linhas.length * 3.5 + 1.8;
  };

  const L = 15, R = 108, W = 87, meia = 41;
  titulo("COMPRADOR", L, y, W);
  titulo("FORNECEDOR", R, y, W);
  let yl = y + 8, yr = y + 8;
  yl += campo("Razão social", un.nome, L, yl, W);
  campo("CNPJ", un.cnpj, L, yl, meia); yl += campo("I.E.", un.ie, L + 46, yl, meia);
  campo("Contato", un.contato, L, yl, meia); yl += campo("Telefone", un.tel, L + 46, yl, meia);
  yl += campo("E-mail", un.email, L, yl, W);
  yl += campo("Endereço de entrega", un.end, L, yl, W);

  yr += campo("Razão social", forn.razao || oc.fornecedorNome, R, yr, W);
  campo("Condição de pagamento", oc.pagamento || "Boleto", R, yr, meia);
  yr += campo("Nº de parcelas", oc.parcelas, R + 46, yr, meia);
  campo("Frete", oc.frete || "CIF", R, yr, meia);
  yr += campo("Prazo (faturado)", oc.prazoFaturado, R + 46, yr, meia);
  campo("Prazo de entrega", oc.prazoEntrega, R, yr, meia);
  yr += campo("Entrega na transportadora", oc.transportadora, R + 46, yr, meia);
  y = Math.max(yl, yr) + 3;

  // === ITENS: sem fundo, só linhas, para imprimir limpo ===
  doc.autoTable({
    startY: y,
    head: [["#", "Produto / descrição", "Unidade", "Qtd.", "Valor unit.", "Valor total"]],
    body: itens.map((i, n) => [n + 1, pdfVal(i.nome), pdfVal(i.un), fmtBR(i.qtd, 3),
                               "R$ " + fmtBR(i.preco), "R$ " + fmtBR(i.qtd * i.preco)]),
    theme: "plain",
    headStyles: { textColor: COR.rotulo, fontStyle: "bold", fontSize: 7, cellPadding: { top: 2, bottom: 2.4, left: 1.8, right: 1.8 } },
    columnStyles: { 0: { halign: "center", cellWidth: 9, textColor: COR.rotulo },
                    1: { halign: "left" },
                    2: { halign: "center", cellWidth: 33 }, 3: { halign: "right", cellWidth: 18 },
                    4: { halign: "right", cellWidth: 25 },
                    5: { halign: "right", cellWidth: 27, fontStyle: "bold", textColor: COR.tinta } },
    styles: { fontSize: 8, textColor: COR.texto, cellPadding: 2, valign: "middle" },
    margin: { left: 15, right: 15, top: 18, bottom: 297 - LIMITE },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index > 1) d.cell.styles.halign = d.column.index === 2 ? "center" : "right";
    },
    // cabeçalho com régua grossa de nori; linhas com régua fina
    didDrawCell: (d) => {
      const yb = d.cell.y + d.cell.height;
      if (d.section === "head") {
        doc.setDrawColor(...COR.nori); doc.setLineWidth(0.6);
      } else {
        doc.setDrawColor(...COR.borda); doc.setLineWidth(0.2);
      }
      doc.line(d.cell.x, yb, d.cell.x + d.cell.width, yb);
    },
  });

  let fim = doc.lastAutoTable.finalY + 6;
  if (fim + 17 > LIMITE) { doc.addPage(); fim = 20; }

  // === TOTAL na tira de nori, e o campo de quem recebe ===
  doc.setTextColor(...COR.rotulo); doc.setFontSize(6.3); doc.setFont("helvetica", "bold");
  doc.text("RECEBIDO POR", 15, fim + 4, { charSpace: 0.3 });
  doc.text("DATA E HORA", 70, fim + 4, { charSpace: 0.3 });
  doc.setDrawColor(...COR.texto); doc.setLineWidth(0.25);
  doc.line(15, fim + 14, 64, fim + 14); doc.line(70, fim + 14, 104, fim + 14);

  doc.setFillColor(...COR.nori); doc.rect(115, fim, 80, 16, "F");
  doc.setTextColor(...COR.noriTexto); doc.setFontSize(6.8); doc.setFont("helvetica", "bold");
  doc.text("TOTAL DA ORDEM", 120, fim + 6, { charSpace: 0.3 });
  doc.text(itens.length + (itens.length === 1 ? " ITEM" : " ITENS"), 120, fim + 10.5);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15.5);
  doc.text("R$ " + fmtBR(total), 191, fim + 10.5, { align: "right" });
  doc.setFillColor(...COR.marca); doc.rect(115, fim + 16, 80, 1, "F");
  fim += 24;

  // === OBSERVAÇÕES ===
  if (oc.obs && oc.obs.trim()) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const linhas = doc.splitTextToSize(oc.obs.toUpperCase(), 170);
    const alt = 9 + linhas.length * 3.8;
    if (fim + alt > LIMITE) { doc.addPage(); fim = 20; }
    doc.setDrawColor(...COR.borda); doc.setLineWidth(0.3); doc.rect(15, fim, 180, alt, "S");
    doc.setFillColor(...COR.nori); doc.rect(15, fim, 1.4, alt, "F");
    doc.setTextColor(...COR.tinta); doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES DO COMPRADOR", 20, fim + 5, { charSpace: 0.3 });
    doc.setTextColor(...COR.texto); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(linhas, 20, fim + 9.8);
  }

  rodape(doc, oc);
  if (previa) { window.open(doc.output("bloburl"), "_blank"); return null; }
  return doc;
}

// Rodapé de todas as folhas: avisos institucionais (numa OC cheia eles caíam
// sozinhos na última folha), os dois traços de hashi e a paginação.
const AVISOS = [
  ["Verificação de CNPJ", "a nota fiscal deverá ser emitida EXATAMENTE para o CNPJ e a razão social do comprador acima."],
  ["RDC 216 ANVISA", "transporte e armazenamento deverão seguir rigorosamente as normas sanitárias vigentes."],
  ["Conferência", "as mercadorias serão conferidas no ato da entrega. Divergências resultarão em devolução imediata."],
];
const LIMITE = 266;            // conteúdo para aqui; abaixo é o rodapé

function rodape(doc, oc) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    // folha de continuação: a esteira de novo, fina, com o número da ordem
    if (p > 1) {
      makisu(doc, 0, 5);
      doc.setTextColor(...COR.texto); doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.text("Ordem de Compra nº " + pdfVal(oc.numero) + "  ·  continuação", 195, 10.5, { align: "right" });
    }
    doc.setDrawColor(...COR.borda); doc.setLineWidth(0.3); doc.line(15, 269, 195, 269);
    AVISOS.forEach(([t, d], k) => {
      const yy = 273 + k * 3.6;
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR.tinta); doc.text(String(k + 1) + ".", 15, yy);
      doc.text(t + ":", 18.5, yy);
      const recuo = doc.getTextWidth(t + ": ");      // medido ainda em negrito
      doc.setFont("helvetica", "normal"); doc.setTextColor(...COR.texto);
      doc.text(d, 18.5 + recuo, yy);
    });
    doc.setDrawColor(...COR.nori); doc.setLineWidth(0.5);
    doc.line(15, 286, 27, 286); doc.line(15, 287.6, 24, 287.6);
    doc.setTextColor(...COR.rotulo); doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text("Sushi Boulevard  ·  Ordem de Compra nº " + pdfVal(oc.numero), 31, 287.4);
    doc.text("Página " + p + " de " + n, 195, 287.4, { align: "right" });
  }
}

// Mesmo padrão de nome de arquivo do Gerador, para os PDFs continuarem
// ordenando juntos na pasta de quem recebe.
function nomeArquivoOC(numero, unidadeNome, fornecedorNome) {
  const n = String(numero || 0).padStart(3, "0");
  const d = new Date();
  const data = String(d.getDate()).padStart(2, "0") + "." +
               String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  return `OC - ${n} - ${unidadeNome} - ${String(fornecedorNome || "").toUpperCase().trim()} - ${data}`;
}
