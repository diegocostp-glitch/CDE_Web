// ============================================================================
// Geração do PDF da Ordem de Compra — modelo NOREN.
//
// A capa é a cortina da porta do restaurante (noren): laranja com ondas
// seigaiha num tom quase igual, fendas brancas que dividem os painéis e a logo
// direto sobre as ondas. Embaixo, as quatro datas da entrega, comprador e
// fornecedor lado a lado, os itens, o total, as três assinaturas e os avisos no
// rodapé de TODAS as folhas — quem separa uma folha para o estoque também lê o
// aviso de CNPJ.
//
// Os nomes (razão social, produto, unidade, contato, endereço) saem em caixa de
// título — "Filé de Salmão com Pele" —, não em MAIÚSCULAS: numa tabela de doze
// linhas a caixa alta deixa tudo com o mesmo peso e cansa a leitura.
//
// Precisa de js/oc-logo.js (OC_LOGO_IMG) e js/gerentes.js
// (GERENTE_SUPRIMENTOS) carregados antes. O Gerador de OCs tem a sua cópia do
// PDF: para a OC chegar idêntica ao fornecedor, o modelo entra nos dois.
//
// A numeração NÃO é local: vem de /api/ocs/reservar, que grava no mesmo
// Registro_OCs.json do Gerador. Contador separado faria duas OCs diferentes
// nascerem com o mesmo número.
// ============================================================================

// Tudo fica num escopo próprio: a prévia do painel de ações carrega este
// arquivo em qualquer tela, e um nome solto aqui (COR, M, textoPrazo...)
// colidiria com o da tela. Para fora saem só montarPDF e nomeArquivoOC.
(function () {
  "use strict";

  const fmtBR = (n, c = 2) => (isFinite(n) ? n : 0)
    .toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

  // Valor de campo: o vazio vira "-", o resto sai como foi digitado.
  const pdfVal = (v) => {
    const s = (v === null || v === undefined) ? "" : String(v).trim();
    return s !== "" ? s : "-";
  };

  // Caixa de título: maiúscula no começo de cada palavra, menos nas partículas
  // ("de", "do", "com"...). Sigla com ponto (S.A.) e UF depois da barra
  // (Belém/PA) continuam em maiúsculas.
  const OC_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "em"]);
  function caixaTitulo(v) {
    const s = pdfVal(v);
    if (s === "-") return s;
    return s.toLowerCase().split(/\s+/).map((p, k) => {
      if (k && OC_MINUSCULAS.has(p)) return p;
      if (/^([a-zà-ú]\.)+$/.test(p)) return p.toUpperCase();
      return p.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase())
              .replace(/(\p{L}+)\/([a-z]{2})(\W*)$/u, (m, a, uf, fim) => a + "/" + uf.toUpperCase() + fim);
    }).join(" ");
  }

  const COR = {
    marca: [237, 63, 3],        // laranja da capa (#ED3F03)
    onda: [244, 90, 38],        // seigaiha: um passo acima do laranja, só textura
    tinta: [26, 26, 26],
    texto: [51, 51, 51],
    rotulo: [138, 138, 138],
    claro: [170, 170, 170],
    borda: [228, 228, 228],
    zebra: [250, 250, 250],
    nori: [33, 37, 35],         // cabeçalho da tabela: preto esverdeado da alga
    obs: [253, 236, 228],
    caixaTotal: [247, 247, 247],
  };

  const M = 12.7;               // margem lateral (48 px do desenho no Figma)
  const W = 210 - 2 * M;
  const LIMITE = 272;           // o conteúdo para aqui; abaixo são os avisos e o rodapé

  // O charSpace do jsPDF fica no estado do documento: passado uma vez, vale para
  // todo texto seguinte. Toda escrita passa por aqui, com o zero explícito.
  function escrever(doc, t, x, y, opc) {
    doc.text(t, x, y, Object.assign({ charSpace: 0 }, opc));
  }
  // Texto espaçado alinhado à direita: o jsPDF não conta o charSpace ao alinhar.
  function escreverDireita(doc, t, x, y, espaco) {
    const w = doc.getTextWidth(t) + espaco * (t.length - 1);
    escrever(doc, t, x - w, y, { charSpace: espaco });
  }
  function fonte(doc, tam, estilo, cor) {
    doc.setFont("helvetica", estilo || "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...(cor || COR.texto));
  }
  // Rótulo de campo: o menor tipo do documento, em caixa alta espaçada.
  function rotulo(doc, t, x, y) {
    fonte(doc, 5.3, "bold", COR.rotulo);
    escrever(doc, t.toUpperCase(), x, y, { charSpace: 0.35 });
  }

  // Ondas seigaiha: fileiras de escamas, cada uma cobre a metade de baixo da
  // anterior. Desenhadas dentro de um recorte, para não vazar da capa.
  function seigaiha(doc, x0, y0, w, h, r) {
    doc.saveGraphicsState();
    doc.rect(x0, y0, w, h, null); doc.clip(); doc.discardPath();
    doc.setLineWidth(0.26);
    doc.setFillColor(...COR.marca); doc.setDrawColor(...COR.onda);
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

  // dd/mm/aaaa -> Date; qualquer outra coisa -> null
  function lerData(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getDate() === +m[1] ? d : null;
  }
  const dataBR = (d) => d.toLocaleDateString("pt-BR");
  const diaDaSemana = (s) => { const d = lerData(s); return d ? d.toLocaleDateString("pt-BR", { weekday: "long" }) : ""; };

  // Prazo de pagamento em dias corridos a partir do faturamento ("14" ou "14
  // dias"). Prazo parcelado ("14/21/28") ou sem número não vira data: a OC mostra
  // "-" em vez de inventar um vencimento.
  function diasDoPrazo(prazo) {
    const m = /^\s*(\d{1,3})\s*(dias?)?\s*$/i.exec(String(prazo || ""));
    return m ? +m[1] : null;
  }
  function vencimentoPrevisto(oc) {
    const entrega = lerData(oc.dataEntrega);
    const dias = diasDoPrazo(oc.prazoFaturado);
    if (!entrega || dias === null) return "-";
    const v = new Date(entrega); v.setDate(v.getDate() + dias);
    return dataBR(v);
  }
  function textoPrazo(prazo) {
    const dias = diasDoPrazo(prazo);
    if (dias !== null) return dias + (dias === 1 ? " dia" : " dias");
    return pdfVal(prazo);
  }

  function montarPDF(oc, previa) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

    const un = oc.unidade || {};
    const forn = oc.fornecedor || {};
    // a prévia do painel de ações abre em telas sem comum.js: sem o num() de lá,
    // só aceita o que já chega como número
    const paraNum = (v) => typeof num === "function" ? num(v) : (isFinite(+v) ? +v : 0);
    const itens = (oc.itens || [])
      .map((i) => Object.assign({}, i, { qtd: paraNum(i.qtd), preco: paraNum(i.preco) }))
      .filter((i) => i.qtd > 0);
    const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0);
    const ehPrevia = previa || String(oc.numero) === "prévia";

    // === CAPA: a cortina ===
    const altCapa = 46.5;
    doc.setFillColor(...COR.marca); doc.rect(0, 0, 210, altCapa, "F");
    seigaiha(doc, 0, 0, 210, altCapa, 6.9);
    // fendas do noren: a primeira separa o painel da logo; as outras abrem só a
    // borda de baixo da cortina
    doc.setFillColor(255, 255, 255);
    doc.rect(71.4, 9, 1.3, altCapa - 9, "F");
    [117.5, 163.5].forEach((x) => doc.rect(x, 33.9, 1.3, altCapa - 33.9, "F"));
    if (typeof OC_LOGO_IMG !== "undefined") doc.addImage(OC_LOGO_IMG, "PNG", 9.25, 10.75, 52.9, 25, undefined, "FAST");

    fonte(doc, 6.8, "normal", [255, 255, 255]);
    escreverDireita(doc, "SUPRIMENTOS  ·  ORDEM DE COMPRA", 210 - M, 11, 0.55);
    fonte(doc, 34, "bold", [255, 255, 255]);
    escrever(doc, "Nº " + pdfVal(oc.numero), 210 - M, 24.5, { align: "right" });
    fonte(doc, 6.8, "bold", [255, 255, 255]);
    escrever(doc, caixaTitulo(un.nome), 210 - M, 29.5, { align: "right" });

    // selo de situação: a OC gerada sai aprovada; a prévia diz que é prévia,
    // para ninguém mandar ao fornecedor um documento que ainda não é ordem
    const selo = ehPrevia ? "PRÉVIA · NÃO ENVIAR" : "APROVADA";
    fonte(doc, 6, "bold", COR.marca);
    const wSelo = doc.getTextWidth(selo) + 0.3 * (selo.length - 1) + 9;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(210 - M - wSelo, 36.4, wSelo, 5.6, 2.8, 2.8, "F");
    doc.setFillColor(...COR.marca); doc.circle(210 - M - wSelo + 3.6, 39.2, 0.8, "F");
    escrever(doc, selo, 210 - M - wSelo + 5.6, 40.2, { charSpace: 0.3 });

    // === as quatro datas, logo abaixo da cortina ===
    let y = altCapa;
    const pagto = [oc.pagamento || "Boleto", oc.parcelas].filter(Boolean).join(" · ").toLowerCase();
    const datas = [
      ["Emissão", oc.dataEmissao, diaDaSemana(oc.dataEmissao)],
      ["Previsão de entrega", oc.dataEntrega, diaDaSemana(oc.dataEntrega)],
      ["Janela de recebimento", String(oc.horario || "").toLowerCase(), ""],
      ["Vencimento previsto", vencimentoPrevisto(oc), pagto],
    ];
    const colD = W / 4;
    datas.forEach(([r, v, s], n) => {
      const x = M + n * colD + (n ? 3.7 : 0);
      rotulo(doc, r, x, y + 6.6);
      fonte(doc, 10.5, "bold", COR.tinta);
      escrever(doc, pdfVal(v), x, y + 11.8);
      if (s) { fonte(doc, 5.6, "normal", COR.claro); escrever(doc, s, x, y + 14.8); }
      if (n) {
        doc.setDrawColor(...COR.borda); doc.setLineWidth(0.26);
        doc.line(M + n * colD, y, M + n * colD, y + 18.5);
      }
    });
    y += 18.5;
    doc.setDrawColor(...COR.borda); doc.setLineWidth(0.26); doc.line(M, y, M + W, y);

    // === COMPRADOR e FORNECEDOR, lado a lado ===
    y += 7.4;
    const larg = (W - 7.9) / 2, meia = (larg - 4.2) / 2;
    const L = M, R = M + larg + 7.9;
    const titulo = (txt, x) => {
      doc.setFillColor(...COR.marca); doc.rect(x, y - 2.1, 2.1, 2.1, "F");
      fonte(doc, 7.1, "bold", COR.tinta);
      escrever(doc, txt, x + 3.9, y, { charSpace: 0.45 });
      doc.setDrawColor(...COR.borda); doc.line(x, y + 2.2, x + larg, y + 2.2);
    };
    // campo: rótulo em cima, valor embaixo; devolve a altura usada
    const campo = (r, v, x, yy, w) => {
      rotulo(doc, r, x, yy);
      fonte(doc, 7.1, "normal", COR.texto);
      const linhas = doc.splitTextToSize(pdfVal(v), w);
      escrever(doc, linhas, x, yy + 3.6);
      return 3.6 + linhas.length * 3 + 2.6;
    };
    titulo("COMPRADOR", L);
    titulo("FORNECEDOR", R);
    let yl = y + 7.4, yr = y + 7.4;
    yl += campo("Razão social", caixaTitulo(un.nome), L, yl, larg);
    campo("CNPJ", un.cnpj, L, yl, meia); yl += campo("I.E.", un.ie, L + meia + 4.2, yl, meia);
    campo("Contato", caixaTitulo(un.contato), L, yl, meia); yl += campo("Telefone", un.tel, L + meia + 4.2, yl, meia);
    yl += campo("E-mail", String(un.email || "").toLowerCase(), L, yl, larg);
    yl += campo("Endereço de entrega", caixaTitulo(un.end), L, yl, larg);

    yr += campo("Razão social", caixaTitulo(forn.razao || oc.fornecedorNome), R, yr, larg);
    campo("Pagamento", caixaTitulo(oc.pagamento || "Boleto") + (oc.parcelas ? " · " + String(oc.parcelas).toLowerCase() : ""), R, yr, meia);
    yr += campo("Frete", String(oc.frete || "CIF").toUpperCase(), R + meia + 4.2, yr, meia);
    campo("Prazo de pagamento", textoPrazo(oc.prazoFaturado), R, yr, meia);
    yr += campo("Vencimento previsto", vencimentoPrevisto(oc), R + meia + 4.2, yr, meia);
    campo("Prazo de entrega", String(oc.prazoEntrega || "").toLowerCase(), R, yr, meia);
    yr += campo("Transportadora", caixaTitulo(oc.transportadora), R + meia + 4.2, yr, meia);
    y = Math.max(yl, yr) + 1.5;

    // === ITENS ===
    doc.autoTable({
      startY: y,
      head: [["#", "PRODUTO / DESCRIÇÃO", "UNIDADE", "QTD.", "VALOR UNIT.", "VALOR TOTAL", "% OC"]],
      body: itens.map((i, n) => {
        const v = i.qtd * i.preco;
        return [String(n + 1).padStart(2, "0"), caixaTitulo(i.nome), caixaTitulo(i.un), fmtBR(i.qtd, 3),
                "R$ " + fmtBR(i.preco), "R$ " + fmtBR(v), total > 0 ? fmtBR(v / total * 100, 1) + "%" : "-"];
      }),
      theme: "plain",
      headStyles: { fillColor: COR.nori, textColor: [255, 255, 255], fontStyle: "bold",
                    fontSize: 5.8, cellPadding: { top: 2.4, bottom: 2.6, left: 1.6, right: 1.6 } },
      columnStyles: {
        0: { halign: "center", cellWidth: 9, textColor: [154, 154, 154] },
        1: { halign: "left", fontStyle: "bold", textColor: [34, 34, 34] },
        2: { halign: "center", cellWidth: 32 },
        3: { halign: "right", cellWidth: 18 },
        4: { halign: "right", cellWidth: 22 },
        5: { halign: "right", cellWidth: 25, fontStyle: "bold", textColor: COR.tinta },
        6: { halign: "right", cellWidth: 14 },
      },
      styles: { font: "helvetica", fontSize: 6.9, textColor: COR.texto, valign: "middle",
                cellPadding: { top: 2, bottom: 2, left: 1.6, right: 1.6 }, overflow: "linebreak" },
      margin: { left: M, right: M, top: 16, bottom: 297 - LIMITE },
      didParseCell: (d) => {
        if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = "right";
        if (d.section === "head" && d.column.index === 2) d.cell.styles.halign = "center";
        if (d.section === "body" && d.row.index % 2) d.cell.styles.fillColor = COR.zebra;
      },
      didDrawCell: (d) => {
        if (d.column.index !== 0) return;
        if (d.section === "head") {
          // filete laranja embaixo do cabeçalho, como o vivo da cortina
          doc.setFillColor(...COR.marca);
          doc.rect(M, d.cell.y + d.cell.height - 0.8, W, 0.8, "F");
        } else {
          doc.setDrawColor(...COR.borda); doc.setLineWidth(0.26);
          doc.line(M, d.cell.y + d.cell.height, M + W, d.cell.y + d.cell.height);
        }
      },
    });

    // === OBSERVAÇÃO ao lado do TOTAL ===
    let fim = doc.lastAutoTable.finalY + 4.8;
    const wTot = 79.4, wObs = W - wTot - 6.9;
    fonte(doc, 7.1, "normal", COR.texto);
    const obs = String(oc.obs || "").trim();
    const linhasObs = obs ? doc.splitTextToSize(obs, wObs - 8) : [];
    const altFecho = Math.max(16, linhasObs.length ? 10 + linhasObs.length * 3.2 : 16);
    // fecho + assinaturas precisam caber juntos; senão vão para a folha seguinte
    if (fim + altFecho + 22 > LIMITE) { doc.addPage(); fim = 18; }

    if (linhasObs.length) {
      doc.setFillColor(...COR.obs); doc.rect(M, fim, wObs, altFecho, "F");
      doc.setFillColor(...COR.marca); doc.rect(M, fim, 1.06, altFecho, "F");
      fonte(doc, 5.3, "bold", COR.marca);
      escrever(doc, "OBSERVAÇÕES DO COMPRADOR", M + 4.2, fim + 5, { charSpace: 0.35 });
      fonte(doc, 7.1, "normal", COR.texto);
      escrever(doc, linhasObs, M + 4.2, fim + 9.2);
    }
    const xT = M + W - wTot;
    doc.setFillColor(...COR.caixaTotal); doc.rect(xT, fim, wTot, altFecho, "F");
    doc.setFillColor(...COR.marca); doc.rect(xT, fim, 1.06, altFecho, "F");
    const meio = fim + altFecho / 2;
    rotulo(doc, "Total da ordem", xT + 5.3, meio - 0.4);
    fonte(doc, 5.3, "bold", COR.claro);
    escrever(doc, itens.length + (itens.length === 1 ? " ITEM" : " ITENS"), xT + 5.3, meio + 2.8, { charSpace: 0.2 });
    fonte(doc, 18, "bold", COR.tinta);
    escrever(doc, "R$ " + fmtBR(total), M + W - 4.2, meio + 2.3, { align: "right" });
    fim += altFecho + 6.9;

    // === ASSINATURAS ===
    const aprov = [
      ["Emitida por", caixaTitulo(un.contato), "Comprador"],
      ["Aprovada por", GERENTE_SUPRIMENTOS, "Gerente Suprimentos"],
      ["Recebida por", "", "Nome, data e hora"],
    ];
    const wA = (W - 2 * 5.8) / 3;
    aprov.forEach(([r, nome, cargo], n) => {
      const x = M + n * (wA + 5.8);
      rotulo(doc, r, x, fim + 2);
      if (nome && nome !== "-") {
        doc.setFont("times", "italic"); doc.setFontSize(10.5); doc.setTextColor(...COR.texto);
        escrever(doc, nome, x, fim + 9.3);
      }
      doc.setDrawColor(154, 154, 154); doc.setLineWidth(0.26);
      doc.line(x, fim + 10.4, x + wA, fim + 10.4);
      fonte(doc, 5.6, "normal", COR.rotulo);
      escrever(doc, cargo, x + wA / 2, fim + 13.4, { align: "center" });
    });

    rodape(doc, oc);
    if (previa) { window.open(doc.output("bloburl"), "_blank"); return null; }
    return doc;
  }

  // Avisos de todas as folhas. A conferência na entrega saiu da OC: o aviso de
  // CNPJ e o da ANVISA são os que o fornecedor precisa cumprir ANTES de chegar.
  const AVISOS = [
    ["Verificação de CNPJ", "a nota fiscal deverá ser emitida EXATAMENTE para o CNPJ e a razão social do comprador acima."],
    ["RDC 216 ANVISA", "transporte e armazenamento deverão seguir rigorosamente as normas sanitárias vigentes."],
  ];

  function rodape(doc, oc) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      // folha de continuação: uma tira da cortina, para a folha solta dizer de onde é
      if (p > 1) {
        doc.setFillColor(...COR.marca); doc.rect(0, 0, 210, 9, "F");
        fonte(doc, 7, "bold", [255, 255, 255]);
        escrever(doc, "SUSHI BOULEVARD", M, 5.8, { charSpace: 0.4 });
        fonte(doc, 7, "normal", [255, 255, 255]);
        escrever(doc, "Ordem de Compra nº " + pdfVal(oc.numero) + "  ·  continuação", 210 - M, 5.8, { align: "right" });
      }
      doc.setDrawColor(...COR.borda); doc.setLineWidth(0.26); doc.line(M, 277.3, M + W, 277.3);
      AVISOS.forEach(([t, d], k) => {
        const yy = 281.3 + k * 3.2;
        fonte(doc, 5.6, "bold", COR.marca); escrever(doc, String(k + 1), M, yy);
        fonte(doc, 5.6, "bold", COR.tinta); escrever(doc, t + ":", M + 2.9, yy);
        const recuo = doc.getTextWidth(t + ": ");      // medido ainda em negrito
        fonte(doc, 5.6, "normal", [85, 85, 85]); escrever(doc, d, M + 2.9 + recuo, yy);
      });
      // dois traços finos, como hashi apoiados, e a paginação
      doc.setFillColor(...COR.marca);
      doc.rect(M, 291.3, 9, 0.42, "F"); doc.rect(M, 292.5, 6.9, 0.42, "F");
      fonte(doc, 5.6, "normal", COR.rotulo);
      escrever(doc, "Sushi Boulevard  ·  Ordem de Compra nº " + pdfVal(oc.numero), M + 11.6, 292.6);
      escrever(doc, "Página " + p + " de " + n, 210 - M, 292.6, { align: "right" });
    }
  }

  window.montarPDF = montarPDF;
})();

// Mesmo padrão de nome de arquivo do Gerador, para os PDFs continuarem
// ordenando juntos na pasta de quem recebe.
function nomeArquivoOC(numero, unidadeNome, fornecedorNome) {
  const n = String(numero || 0).padStart(3, "0");
  const d = new Date();
  const data = String(d.getDate()).padStart(2, "0") + "." +
               String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  return `OC - ${n} - ${unidadeNome} - ${String(fornecedorNome || "").toUpperCase().trim()} - ${data}`;
}
