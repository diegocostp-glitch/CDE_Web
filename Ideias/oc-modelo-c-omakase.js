// ============================================================================
// MODELO C — OMAKASE
//
// A OC com cara de cardápio da casa. Cabeçalho em tom de arroz, o símbolo SB
// dentro de um ensō (o círculo de um traço só, feito a pincel), o número da
// ordem num carimbo vertical como o nome do chef no menu. Os itens correm em
// linhas pontilhadas e o total fecha com régua dupla, como a conta.
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
  rotulo: [125, 118, 108],     // cinza quente, combina com o papel de arroz
  borda: [214, 208, 198],
  arroz: [250, 246, 238],
};

// Arco por curvas de Bézier, em trechos de até 90°. Ângulos em graus, no
// sentido do papel (y para baixo).
function arco(doc, cx, cy, r, a0, a1) {
  const rad = (g) => (g * Math.PI) / 180;
  const passos = Math.ceil(Math.abs(a1 - a0) / 90);
  const d = (a1 - a0) / passos;
  const segs = [];
  let t0 = rad(a0);
  const x0 = cx + r * Math.cos(t0), y0 = cy + r * Math.sin(t0);
  for (let i = 0; i < passos; i++) {
    const t1 = t0 + rad(d), k = (4 / 3) * Math.tan((t1 - t0) / 4);
    const px = cx + r * Math.cos(t0), py = cy + r * Math.sin(t0);
    const qx = cx + r * Math.cos(t1), qy = cy + r * Math.sin(t1);
    segs.push([-k * r * Math.sin(t0), k * r * Math.cos(t0),
               qx - px + k * r * Math.sin(t1), qy - py - k * r * Math.cos(t1),
               qx - px, qy - py]);
    t0 = t1;
  }
  doc.lines(segs, x0, y0, [1, 1], "S", false);
}

// Ensō: o traço grosso do pincel e uma cauda mais fina onde ele se solta.
function enso(doc, cx, cy, r) {
  doc.setDrawColor(...COR.marca); doc.setLineCap("round");
  doc.setLineWidth(1.9); arco(doc, cx, cy, r, -60, 235);
  doc.setLineWidth(1.1); arco(doc, cx, cy, r, 235, 262);
  doc.setLineWidth(0.5); arco(doc, cx, cy, r, 262, 274);
  doc.setLineCap("butt");
}

function montarPDF(oc, previa) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  const un = oc.unidade || {};
  const forn = oc.fornecedor || {};
  const itens = (oc.itens || []).filter((i) => i.qtd > 0);
  const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);

  // === CAPA: papel de arroz, ensō e carimbo ===
  doc.setFillColor(...COR.arroz); doc.rect(0, 0, 210, 47, "F");
  enso(doc, 33, 23.5, 15);
  if (typeof OC_SIMBOLO_IMG !== "undefined") doc.addImage(OC_SIMBOLO_IMG, "PNG", 23.5, 17, 19, 13.1, undefined, "FAST");

  doc.setTextColor(...COR.tinta); doc.setFont("times", "italic"); doc.setFontSize(25);
  doc.text("Ordem de Compra", 58, 23);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...COR.rotulo);
  doc.text("SUSHI BOULEVARD  ·  SUPRIMENTOS", 58.5, 30, { charSpace: 0.8 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...COR.texto);
  doc.text(pdfVal(un.nome), 58.5, 35.5);

  // carimbo vertical: o número lido de cima para baixo, como no menu
  const num = pdfVal(oc.numero).replace(/\s+/g, "");
  const passo = num.length > 5 ? 4.2 : 5.4;
  const altSelo = 11 + num.length * passo;
  doc.setFillColor(...COR.marca); doc.rect(180, 8, 14, altSelo, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5); doc.text("Nº", 187, 13.5, { align: "center" });
  doc.setFontSize(num.length > 5 ? 9.5 : 12);
  [...num].forEach((c, i) => doc.text(c, 187, 19.5 + i * passo + 2, { align: "center" }));

  // régua dupla que fecha a capa, como o topo de um menu
  doc.setDrawColor(...COR.marca); doc.setLineWidth(0.7); doc.line(15, 47, 195, 47);
  doc.setLineWidth(0.2); doc.line(15, 48.4, 195, 48.4);

  // === datas numa linha só ===
  let y = 56;
  const datas = [["Emissão", oc.dataEmissao], ["Previsão de entrega", oc.dataEntrega],
                 ["Horário de recebimento", oc.horario]];
  datas.forEach(([rot, val], n) => {
    const x = 15 + n * 60;
    doc.setTextColor(...COR.rotulo); doc.setFont("times", "italic"); doc.setFontSize(9);
    doc.text(rot, x, y);
    doc.setTextColor(...COR.tinta); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text(pdfVal(val), x, y + 5);
  });

  // === COMPRADOR e FORNECEDOR ===
  y += 15;
  const titulo = (txt, x, yy, w) => {
    doc.setTextColor(...COR.marca); doc.setFont("times", "italic"); doc.setFontSize(12);
    doc.text(txt, x, yy);
    doc.setDrawColor(...COR.borda); doc.setLineWidth(0.3);
    doc.line(x + doc.getTextWidth(txt) + 3, yy - 1.2, x + w, yy - 1.2);
  };
  const campo = (rot, val, x, yy, w) => {
    doc.setTextColor(...COR.rotulo); doc.setFontSize(6.3); doc.setFont("helvetica", "bold");
    doc.text(rot.toUpperCase(), x, yy, { charSpace: 0.3 });
    doc.setTextColor(...COR.texto); doc.setFontSize(8.3); doc.setFont("helvetica", "normal");
    const linhas = doc.splitTextToSize(pdfVal(val), w);
    doc.text(linhas, x, yy + 4);
    return 4 + linhas.length * 3.5 + 1.8;
  };

  const L = 15, R = 108, W = 87, meia = 41;
  titulo("Comprador", L, y, W);
  titulo("Fornecedor", R, y, W);
  let yl = y + 7, yr = y + 7;
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

  // === ITENS, como linhas de cardápio ===
  doc.autoTable({
    startY: y,
    head: [["#", "Produto / descrição", "Unidade", "Qtd.", "Valor unit.", "Valor total"]],
    body: itens.map((i, n) => [n + 1, pdfVal(i.nome), pdfVal(i.un), fmtBR(i.qtd, 3),
                               "R$ " + fmtBR(i.preco), "R$ " + fmtBR(i.qtd * i.preco)]),
    theme: "plain",
    headStyles: { textColor: COR.rotulo, fontStyle: "bold", fontSize: 6.5,
                  cellPadding: { top: 1.5, bottom: 2, left: 1.8, right: 1.8 } },
    columnStyles: { 0: { halign: "center", cellWidth: 9, textColor: COR.marca, fontStyle: "bold" },
                    1: { halign: "left" },
                    2: { halign: "center", cellWidth: 33 }, 3: { halign: "right", cellWidth: 18 },
                    4: { halign: "right", cellWidth: 25 },
                    5: { halign: "right", cellWidth: 27, fontStyle: "bold", textColor: COR.tinta } },
    styles: { fontSize: 8, textColor: COR.texto, cellPadding: 2.1, valign: "middle" },
    margin: { left: 15, right: 15, top: 18, bottom: 297 - LIMITE },
    didParseCell: (d) => {
      if (d.section === "head") {
        d.cell.text = d.cell.text.map((t) => t.toUpperCase());
        if (d.column.index > 1) d.cell.styles.halign = d.column.index === 2 ? "center" : "right";
      }
    },
    // linha pontilhada entre os itens, como o pontilhado entre prato e preço
    didDrawCell: (d) => {
      const yb = d.cell.y + d.cell.height;
      if (d.section === "head") {
        doc.setDrawColor(...COR.tinta); doc.setLineWidth(0.3);
        doc.line(d.cell.x, yb, d.cell.x + d.cell.width, yb);
      } else {
        doc.setDrawColor(...COR.borda); doc.setLineWidth(0.35);
        doc.setLineDashPattern([0.3, 1.1], 0);
        doc.line(d.cell.x, yb, d.cell.x + d.cell.width, yb);
        doc.setLineDashPattern([], 0);
      }
    },
  });

  let fim = doc.lastAutoTable.finalY + 4;
  if (fim + 16 > LIMITE) { doc.addPage(); fim = 20; }

  // === TOTAL: régua dupla e o valor, como no pé da conta ===
  doc.setDrawColor(...COR.tinta); doc.setLineWidth(0.5); doc.line(115, fim, 195, fim);
  doc.setLineWidth(0.2); doc.line(115, fim + 1.2, 195, fim + 1.2);
  doc.setTextColor(...COR.rotulo); doc.setFont("times", "italic"); doc.setFontSize(11);
  doc.text("Total da ordem", 115, fim + 9);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(itens.length + (itens.length === 1 ? " item" : " itens"), 115, fim + 13);
  doc.setTextColor(...COR.tinta); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text("R$ " + fmtBR(total), 195, fim + 11, { align: "right" });
  fim += 20;

  // === OBSERVAÇÕES ===
  if (oc.obs && oc.obs.trim()) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const linhas = doc.splitTextToSize(oc.obs.toUpperCase(), 172);
    const alt = 10 + linhas.length * 3.8;
    if (fim + alt > LIMITE) { doc.addPage(); fim = 20; }
    doc.setFillColor(...COR.arroz); doc.rect(15, fim, 180, alt, "F");
    doc.setTextColor(...COR.marca); doc.setFont("times", "italic"); doc.setFontSize(10.5);
    doc.text("Observações do comprador", 19, fim + 6);
    doc.setTextColor(...COR.texto); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(linhas, 19, fim + 10.8);
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
    // folha de continuação: faixa de arroz com o número da ordem
    if (p > 1) {
      doc.setFillColor(...COR.arroz); doc.rect(0, 0, 210, 11, "F");
      doc.setDrawColor(...COR.marca); doc.setLineWidth(0.5); doc.line(15, 11, 195, 11);
      doc.setTextColor(...COR.tinta); doc.setFont("times", "italic"); doc.setFontSize(10);
      doc.text("Ordem de Compra nº " + pdfVal(oc.numero), 15, 7.5);
      doc.setTextColor(...COR.rotulo); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text("continuação", 195, 7.5, { align: "right" });
    }
    doc.setDrawColor(...COR.borda); doc.setLineWidth(0.3); doc.line(15, 269, 195, 269);
    AVISOS.forEach(([t, d], k) => {
      const yy = 273 + k * 3.6;
      doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR.marca); doc.text(String(k + 1), 15, yy);
      doc.setTextColor(...COR.tinta); doc.text(t + ":", 18.5, yy);
      const recuo = doc.getTextWidth(t + ": ");      // medido ainda em negrito
      doc.setFont("helvetica", "normal"); doc.setTextColor(...COR.texto);
      doc.text(d, 18.5 + recuo, yy);
    });
    doc.setDrawColor(...COR.marca); doc.setLineWidth(0.5);
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
