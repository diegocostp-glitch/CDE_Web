// ============================================================================
// MODELO A — NOREN
//
// A faixa laranja da capa vira a cortina da porta de um restaurante japonês
// (noren): fendas na borda de baixo e, ao fundo, o padrão de ondas seigaiha
// num tom quase igual ao laranja — aparece de perto, some de longe. O total
// leva um carimbo quadrado no lugar do hanko de quem aprova.
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
  marca: [237, 63, 3],        // laranja da capa (#ED3F03), o mesmo do bloco do logo
  onda: [242, 86, 34],        // seigaiha: um passo acima do laranja, só textura
  tinta: [26, 26, 26],
  texto: [55, 55, 55],
  rotulo: [120, 120, 120],
  borda: [225, 225, 225],
  fundo: [247, 247, 247],
  nori: [33, 37, 35],         // cabeçalho da tabela: preto esverdeado da alga
};

// Ondas seigaiha: fileiras de escamas, cada uma cobre a metade de baixo da
// fileira anterior. Desenhadas dentro de um recorte, para não vazar da faixa.
function seigaiha(doc, x0, y0, w, h, r) {
  doc.saveGraphicsState();
  doc.rect(x0, y0, w, h, null); doc.clip(); doc.discardPath();
  doc.setLineWidth(0.3);
  for (let lin = 0, y = y0 - r / 2; y < y0 + h + r; lin++, y += r / 2) {
    const desloc = lin % 2 ? r : 0;
    for (let x = x0 - 2 * r + desloc; x < x0 + w + 2 * r; x += 2 * r) {
      doc.setFillColor(...COR.marca); doc.setDrawColor(...COR.onda);
      doc.circle(x, y, r, "FD");
      doc.circle(x, y, r * 0.7, "S");
      doc.circle(x, y, r * 0.4, "S");
    }
  }
  doc.restoreGraphicsState();
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

  // === CAPA: a cortina ===
  doc.setFillColor(...COR.marca); doc.rect(0, 0, 210, 42, "F");
  // as ondas começam depois do logo: o bloco do logo tem fundo liso e, sobre
  // a textura, apareceria recortado
  seigaiha(doc, 70, 0, 140, 42, 6);
  // fendas do noren: a cortina se abre em painéis. A primeira separa o painel
  // liso do logo dos painéis com ondas; as outras abrem só a borda de baixo.
  doc.setFillColor(255, 255, 255);
  doc.rect(70 - 0.7, 9, 1.4, 33.5, "F");
  [116, 162].forEach((x) => doc.rect(x - 0.7, 31, 1.4, 11.5, "F"));
  if (typeof OC_MARCA_IMG !== "undefined") doc.addImage(OC_MARCA_IMG, "PNG", 8, 4, 52, 26, undefined, "FAST");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  textoDireita(doc, "SUPRIMENTOS  ·  ORDEM DE COMPRA", 198, 10.5, 0.4);
  doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text("Nº " + pdfVal(oc.numero), 198, 22.5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(pdfVal(un.nome), 198, 28.5, { align: "right" });

  // === faixa das datas, logo abaixo da cortina ===
  let y = 49;
  const datas = [["EMISSÃO", oc.dataEmissao], ["PREVISÃO DE ENTREGA", oc.dataEntrega],
                 ["HORÁRIO DE RECEBIMENTO", oc.horario]];
  datas.forEach(([rot, val], n) => {
    const x = 15 + n * 60;
    doc.setTextColor(...COR.rotulo); doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
    doc.text(rot, x, y, { charSpace: 0.3 });
    doc.setTextColor(...COR.tinta); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(pdfVal(val), x, y + 5.5);
  });
  doc.setDrawColor(...COR.borda); doc.setLineWidth(0.3); doc.line(15, y + 9.5, 195, y + 9.5);

  // === COMPRADOR e FORNECEDOR, lado a lado ===
  y += 15;
  const titulo = (txt, x, yy, w) => {
    doc.setFillColor(...COR.marca); doc.rect(x, yy - 2.6, 2.4, 2.4, "F");
    doc.setTextColor(...COR.tinta); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(txt, x + 4.2, yy, { charSpace: 0.3 });
    doc.setDrawColor(...COR.borda); doc.line(x, yy + 2.2, x + w, yy + 2.2);
  };
  // campo: rótulo pequeno em cima, valor embaixo; devolve a altura usada
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

  // === ITENS ===
  doc.autoTable({
    startY: y,
    head: [["#", "Produto / descrição", "Unidade", "Qtd.", "Valor unit.", "Valor total"]],
    body: itens.map((i, n) => [n + 1, pdfVal(i.nome), pdfVal(i.un), fmtBR(i.qtd, 3),
                               "R$ " + fmtBR(i.preco), "R$ " + fmtBR(i.qtd * i.preco)]),
    theme: "grid",
    headStyles: { fillColor: COR.nori, textColor: [255, 255, 255], fontStyle: "bold",
                  halign: "center", fontSize: 8, cellPadding: 2.2, lineWidth: 0 },
    columnStyles: { 0: { halign: "center", cellWidth: 9, textColor: COR.rotulo },
                    1: { halign: "left" },
                    2: { halign: "center", cellWidth: 33 }, 3: { halign: "right", cellWidth: 18 },
                    4: { halign: "right", cellWidth: 25 },
                    5: { halign: "right", cellWidth: 27, fontStyle: "bold", textColor: COR.tinta } },
    alternateRowStyles: { fillColor: [251, 251, 251] },
    styles: { fontSize: 8, textColor: COR.texto, lineColor: COR.borda, lineWidth: 0.2,
              cellPadding: 1.9, valign: "middle" },
    margin: { left: 15, right: 15, top: 18, bottom: 297 - LIMITE },
    // filete laranja embaixo do cabeçalho, como o vivo da cortina
    didDrawCell: (d) => {
      if (d.section === "head" && d.column.index === 0) {
        doc.setFillColor(...COR.marca);
        doc.rect(15, d.cell.y + d.cell.height - 0.8, 180, 0.8, "F");
      }
    },
  });

  let fim = doc.lastAutoTable.finalY + 6;
  if (fim + 18 > LIMITE) { doc.addPage(); fim = 20; }

  // === TOTAL, com o carimbo ===
  // carimbo: quadrado de borda dupla, como o hanko que aprova o documento
  doc.setDrawColor(...COR.marca); doc.setLineWidth(0.7); doc.rect(15, fim, 18, 18, "S");
  doc.setLineWidth(0.25); doc.rect(16.2, fim + 1.2, 15.6, 15.6, "S");
  doc.setTextColor(...COR.marca); doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2); doc.text("ORDEM", 24, fim + 5.8, { align: "center", charSpace: 0.3 });
  doc.setFontSize(9.5); doc.text(pdfVal(oc.numero), 24, fim + 10.8, { align: "center" });
  doc.setFontSize(3.7); doc.text("SUSHI BOULEVARD", 24, fim + 14.6, { align: "center" });

  doc.setFillColor(...COR.fundo); doc.rect(115, fim, 80, 18, "F");
  doc.setFillColor(...COR.marca); doc.rect(115, fim, 1.4, 18, "F");
  doc.setTextColor(...COR.rotulo); doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("TOTAL DA ORDEM", 121, fim + 6.5, { charSpace: 0.3 });
  doc.text(itens.length + (itens.length === 1 ? " ITEM" : " ITENS"), 121, fim + 11);
  doc.setTextColor(...COR.tinta); doc.setFontSize(17);
  doc.text("R$ " + fmtBR(total), 191, fim + 12, { align: "right" });
  fim += 24;

  // === OBSERVAÇÕES ===
  if (oc.obs && oc.obs.trim()) {
    // a largura da quebra depende da fonte: definir antes de medir
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const linhas = doc.splitTextToSize(oc.obs.toUpperCase(), 168);
    const alt = 10 + linhas.length * 3.8;
    if (fim + alt > LIMITE) { doc.addPage(); fim = 20; }
    doc.setFillColor(253, 236, 228); doc.rect(15, fim, 180, alt, "F");
    doc.setFillColor(...COR.marca); doc.rect(15, fim, 1.4, alt, "F");
    doc.setTextColor(...COR.marca); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES DO COMPRADOR", 21, fim + 5.5, { charSpace: 0.3 });
    doc.setTextColor(...COR.texto); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(linhas, 21, fim + 10.5);
    fim += alt + 6;
  }

  rodape(doc, oc);
  if (previa) { window.open(doc.output("bloburl"), "_blank"); return null; }
  return doc;
}

// Rodapé de todas as folhas. Os avisos institucionais moram aqui, e não no fim
// do documento: numa OC cheia eles caíam sozinhos na última folha, e quem
// separa uma folha para o estoque também precisa ler o aviso de CNPJ. Embaixo,
// dois traços finos como hashi apoiados e a paginação.
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
    // folha de continuação: uma tira da cortina, para a folha solta dizer de onde é
    if (p > 1) {
      doc.setFillColor(...COR.marca); doc.rect(0, 0, 210, 9, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
      doc.text("SUSHI BOULEVARD", 15, 5.8, { charSpace: 0.4 });
      doc.setFont("helvetica", "normal");
      doc.text("Ordem de Compra nº " + pdfVal(oc.numero) + "  ·  continuação", 195, 5.8, { align: "right" });
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
