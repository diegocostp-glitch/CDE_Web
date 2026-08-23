// ============================================================================
// Geração do PDF da Ordem de Compra — mesmo documento do Gerador de OCs.
//
// É uma cópia deliberada: o layout, os blocos, as cores e os avisos
// institucionais são os mesmos, para que a OC emitida aqui e a emitida lá
// cheguem idênticas ao fornecedor. Só mudou a origem dos dados — aqui eles
// vêm da ordem pendente e da base do CDE Web.
//
// A numeração NÃO é local: vem de /api/ocs/reservar, que grava no mesmo
// Registro_OCs.json do Gerador. Contador separado faria duas OCs diferentes
// nascerem com o mesmo número.
// ============================================================================

const fmtBR = (n, c = 2) => (isFinite(n) ? n : 0)
  .toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

// Os dados saem em MAIÚSCULAS e o vazio vira "-"; os rótulos do documento
// mantêm a grafia original.
const pdfVal = (v) => {
  const s = (v === null || v === undefined) ? "" : String(v).trim();
  return s !== "" ? s.toUpperCase() : "-";
};

function montarPDF(oc, previa) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const un = oc.unidade || {};
  const forn = oc.fornecedor || {};
  const itens = (oc.itens || []).filter((i) => i.qtd > 0);
  const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);

  const laranja = [243, 111, 29];
  const preto = [26, 26, 26];
  const cinzaTexto = [55, 55, 55];
  const cinzaClaro = [248, 248, 248];
  const cinzaBorda = [225, 225, 225];

  // === CABEÇALHO ===
  const capa = (typeof DEFAULT_HEADER_IMG !== "undefined") ? DEFAULT_HEADER_IMG : null;
  if (capa) {
    const formato = /image\/jpe?g/.test(capa) ? "JPEG" : "PNG";
    doc.addImage(capa, formato, 0, 0, 210, 45);
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text("RESTAURANTE • COMIDA JAPONESA", 55, 37, { align: "center" });
  } else {
    doc.setFillColor(...laranja); doc.rect(0, 0, 210, 45, "F");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("OC - ORDEM DE COMPRA", 202, 16, { align: "right" });
  doc.setFontSize(10);
  doc.text("Nº OC: " + pdfVal(oc.numero), 202, 24, { align: "right" });
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text("Data da Emissão: " + pdfVal(oc.dataEmissao), 202, 31, { align: "right" });
  doc.text("Previsão de Entrega: " + pdfVal(oc.dataEntrega), 202, 37, { align: "right" });
  doc.text("Horário de Recebimento: " + pdfVal(oc.horario), 202, 43, { align: "right" });

  let y = 54;
  const col1 = 19, col2 = 118;
  const par = (rot, val, x, yy, recuo) => {
    doc.setFont("helvetica", "bold"); doc.text(rot, x, yy);
    doc.setFont("helvetica", "normal"); doc.text(pdfVal(val), x + recuo, yy);
  };
  const caixa = (titulo, altura) => {
    doc.setDrawColor(...cinzaBorda); doc.setFillColor(...cinzaClaro);
    doc.roundedRect(15, y, 180, altura, 2, 2, "FD");
    doc.setTextColor(...laranja); doc.setFontSize(10.5); doc.setFont("helvetica", "bold");
    doc.text(titulo, 19, y + 7);
    doc.setDrawColor(...cinzaBorda); doc.setLineWidth(0.3); doc.line(19, y + 9.5, 191, y + 9.5);
    doc.setTextColor(...cinzaTexto); doc.setFontSize(8);
  };

  // === DADOS DO COMPRADOR ===
  caixa("DADOS DO COMPRADOR", 38);
  const razao = doc.splitTextToSize(pdfVal(un.nome), 78)[0];
  doc.setFont("helvetica", "bold"); doc.text("Razão Social:", col1, y + 15);
  doc.setFont("helvetica", "normal"); doc.text(razao, col1 + 20, y + 15);
  par("Contato:", un.contato, col2, y + 15, 14);
  par("CNPJ:", un.cnpj, col1, y + 21, 10);
  par("Telefone:", un.tel, col2, y + 21, 15);
  par("I.E.:", un.ie, col1, y + 27, 7);
  par("E-mail:", un.email, col2, y + 27, 12);
  par("Endereço:", un.end, col1, y + 33, 16);
  y += 44;

  // === DADOS DO FORNECEDOR ===
  caixa("DADOS DO FORNECEDOR", 38);
  par("Fornecedor:", forn.razao || oc.fornecedorNome, col1, y + 15, 18);
  par("Condição Pagto.:", oc.pagamento || "Boleto", col1, y + 21, 26);
  par("Nº Parcelas:", oc.parcelas, col2, y + 21, 19);
  par("Frete:", oc.frete || "CIF", col1, y + 27, 10);
  par("Prazo (faturado):", oc.prazoFaturado, col2, y + 27, 26);
  par("Prazo de Entrega:", oc.prazoEntrega, col1, y + 33, 27);
  par("Entrega Transp.:", oc.transportadora, col2, y + 33, 26);
  y += 44;

  // === ITENS ===
  doc.autoTable({
    startY: y,
    head: [["#", "Produto / Descrição", "Unidade", "Qtd.", "Valor Unit.", "Valor Total"]],
    body: itens.map((i, n) => [n + 1, pdfVal(i.nome), pdfVal(i.un), fmtBR(i.qtd, 3),
                               "R$ " + fmtBR(i.preco), "R$ " + fmtBR(i.qtd * i.preco)]),
    theme: "grid",
    headStyles: { fillColor: preto, textColor: [255, 255, 255], fontStyle: "bold",
                  halign: "center", fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { halign: "center", cellWidth: 10 }, 1: { halign: "left" },
                    2: { halign: "center", cellWidth: 22 }, 3: { halign: "center", cellWidth: 20 },
                    4: { halign: "right", cellWidth: 25 },
                    5: { halign: "right", cellWidth: 25, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    styles: { fontSize: 8, textColor: cinzaTexto, lineColor: cinzaBorda,
              cellPadding: 2.5, valign: "middle" },
    margin: { left: 15, right: 15 },
  });

  let fim = doc.lastAutoTable.finalY + 12;

  // === TOTAL ===
  doc.setFillColor(...preto);
  doc.roundedRect(120, fim, 75, 15, 2, 2, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", 126, fim + 9.5);
  doc.setTextColor(...laranja); doc.setFontSize(14);
  doc.text("R$ " + fmtBR(total), 190, fim + 9.5, { align: "right" });
  fim += 24;

  // === OBSERVAÇÕES ===
  if (oc.obs && oc.obs.trim()) {
    if (fim > 245) { doc.addPage(); fim = 20; }
    const linhas = doc.splitTextToSize(oc.obs.toUpperCase(), 168);
    const alt = 8 + linhas.length * 4;
    doc.setFillColor(255, 243, 224); doc.rect(15, fim, 180, alt, "F");
    doc.setFillColor(...laranja); doc.rect(15, fim, 1.2, alt, "F");
    doc.setTextColor(...laranja); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES DO COMPRADOR:", 20, fim + 5);
    doc.setTextColor(...cinzaTexto); doc.setFont("helvetica", "normal");
    doc.text(linhas, 20, fim + 10);
    fim += alt + 8;
  }

  // === AVISOS INSTITUCIONAIS ===
  if (fim > 250) { doc.addPage(); fim = 20; }
  doc.setFillColor(245, 245, 245); doc.rect(15, fim, 180, 27, "F");
  doc.setFillColor(...laranja); doc.rect(15, fim, 1.2, 27, "F");
  doc.setTextColor(...preto); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text("AVISOS E OBSERVAÇÕES INSTITUCIONAIS:", 20, fim + 6);
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
  doc.text("1. Verificação de CNPJ: A nota fiscal deverá ser emitida EXATAMENTE para o CNPJ e Razão Social informados nos Dados do Comprador acima.", 20, fim + 12);
  doc.text("2. RDC 216 ANVISA: O transporte e armazenamento dos produtos deverão seguir rigorosamente as normas sanitárias vigentes.", 20, fim + 17);
  doc.text("3. Conferência de Produtos: A conferência das mercadorias será realizada no ato da entrega. Divergências resultarão em devolução imediata.", 20, fim + 22);

  if (previa) { window.open(doc.output("bloburl"), "_blank"); return null; }
  return doc;
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
