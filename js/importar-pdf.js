// ============================================================================
// LEITURA DE OC EM PDF
// O PDF vem da planilha de ordens de compras (modelo "ORDEM DE COMPRA
// (GERÊNTE E SUPERVISOR)"). O pdf.js devolve cada pedaço de texto com a sua
// posição na página; aqui remontamos as linhas para achar os rótulos do
// cabeçalho e as colunas da tabela de itens.
//
// Cópia fiel do leitor do Gerador de OCs — só os nomes dos helpers mudaram
// (chave/limpaNome/formatarCNPJ vêm de js/comum.js). O reconhecimento de
// coluna por posição foi calibrado no modelo real da planilha; reescrever
// significaria recalibrar, então foi copiado como está.

const PDFJS_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Junta os pedaços de texto em linhas (mesmo y, com folga de 2,5 pt: no modelo
// alguns valores ficam meio ponto acima do próprio rótulo) e ordena da esquerda
// para a direita. cx = centro horizontal, usado para identificar a coluna.
function pdfLinesFromItems(items) {
  const pieces = items
    .filter(it => it.str && it.str.trim() !== '')
    .map(it => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, str: it.str.replace(/\s+/g, ' ').trim() }))
    .map(p => ({ ...p, cx: p.x + p.w / 2 }))
    .sort((a, b) => b.y - a.y);

  const lines = [];
  pieces.forEach(p => {
    const line = lines.find(l => Math.abs(l.y - p.y) <= 2.5);
    if (line) line.pieces.push(p);
    else lines.push({ y: p.y, pieces: [p] });
  });
  lines.forEach(l => {
    l.pieces.sort((a, b) => a.x - b.x);
    l.text = l.pieces.map(p => p.str).join(' ');
    l.norm = chave(l.text);
  });
  return lines;
}

// Valor à direita de um rótulo na mesma linha. Emenda pedaços vizinhos (o pdf.js
// às vezes quebra um mesmo valor em dois) e para no próximo rótulo.
function pdfValorApos(line, termo) {
  const idx = line.pieces.findIndex(p => chave(p.str).includes(termo));
  if (idx === -1) return '';
  const partes = [];
  for (let k = idx + 1; k < line.pieces.length; k++) {
    const p = line.pieces[k];
    if (p.str.endsWith(':')) break;                       // começou outro rótulo
    const ant = line.pieces[k - 1];
    if (partes.length && p.x - (ant.x + ant.w) > 6) break; // salto grande = outra coluna
    partes.push(p.str);
  }
  return limpaNome(partes.join(' '));
}

// "26.07.2026", "26/07/26" ou "26-07-2026" -> Date (meio-dia, para não escorregar de fuso)
function parsePdfDate(str) {
  const m = String(str || '').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  y = Number(y); if (y < 100) y += 2000;
  const dt = new Date(y, Number(mo) - 1, Number(d), 12);
  return isNaN(dt.getTime()) ? null : dt;
}

function dateToBR(dt) {
  return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear();
}

// Data da OC do PDF + N dias. O PDF é emitido no dia anterior ao da compra:
// a OC gerada aqui sai com a data do dia seguinte (26/07 no PDF -> 27/07).
function pdfDatePlusDays(str, days) {
  const dt = parsePdfDate(str);
  if (!dt) return limpaNome(str);
  dt.setDate(dt.getDate() + days);
  return dateToBR(dt);
}

// Data mantida como está, só padronizando o separador para dd/mm/aaaa.
function pdfDateAsIs(str) {
  const dt = parsePdfDate(str);
  return dt ? dateToBR(dt) : limpaNome(str);
}

// Quantidade no formato pt-BR ("1.234,56" -> 1234.56)
function parseQtyBR(str) {
  const s = String(str || '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

// Centros das colunas da tabela de itens, tirados da própria linha de cabeçalho
// (o texto é centralizado na célula). Sem cabeçalho legível, usa proporções da página.
function pdfItemColumns(lines, hdrIdx, pageWidth) {
  const cols = {};
  const alvos = [
    ['item', /^item$/],
    ['desc', /^descri/],
    ['unit', /^unidade/],
    ['qty', /^\(?o\.?c\.?\)?$/],
    ['rec', /recebida/],
    ['status', /^status$/]
  ];
  for (let i = Math.max(0, hdrIdx - 2); i <= Math.min(lines.length - 1, hdrIdx + 2); i++) {
    lines[i].pieces.forEach(p => {
      const n = chave(p.str);
      alvos.forEach(([nome, re]) => { if (cols[nome] === undefined && re.test(n)) cols[nome] = p.cx; });
    });
  }
  // "Quantidade / Quantidade" (O.C e Recebida) ficam numa linha própria: se o
  // "(O.C)" não apareceu, usa a 1ª "Quantidade" como coluna da quantidade pedida.
  if (cols.qty === undefined) {
    const qs = [];
    for (let i = Math.max(0, hdrIdx - 2); i <= Math.min(lines.length - 1, hdrIdx + 2); i++) {
      lines[i].pieces.forEach(p => { if (/^quantidade/.test(chave(p.str))) qs.push(p.cx); });
    }
    qs.sort((a, b) => a - b);
    if (qs[0] !== undefined) cols.qty = qs[0];
    if (cols.rec === undefined && qs[1] !== undefined) cols.rec = qs[1];
  }
  const padrao = { item: 0.09, desc: 0.31, unit: 0.53, qty: 0.645, rec: 0.74, status: 0.855 };
  Object.keys(padrao).forEach(k => { if (cols[k] === undefined) cols[k] = padrao[k] * pageWidth; });
  return cols;
}

// A qual coluna pertence o pedaço de texto: a de centro mais próximo.
function pdfColunaDoPedaco(cx, cols) {
  let melhor = '', dist = Infinity;
  Object.keys(cols).forEach(k => {
    const d = Math.abs(cols[k] - cx);
    if (d < dist) { dist = d; melhor = k; }
  });
  return melhor;
}

// Fim da tabela de itens (rodapé/assinaturas do modelo)
function pdfEhFimDaTabela(norm) {
  return /^(total|totais)\b/.test(norm) || /^observ/.test(norm) || /assinatura/.test(norm) ||
         /^conferido/.test(norm) || /^recebido por/.test(norm);
}

// Dados da loja no canto superior direito: razão social, CNPJ e endereço.
// O bloco fica acima do primeiro título encostado na margem esquerda
// ("ORDEM DE COMPRA (GERÊNTE E SUPERVISOR)").
function pdfLojaDoCabecalho(lines, limiteIdx, pageWidth) {
  const loja = { nome: '', cnpj: '', end: '' };
  const enderecos = [];
  const primeiroTitulo = lines.findIndex(l => l.pieces.some(p => p.x < pageWidth * 0.15));
  const fim = primeiroTitulo === -1 ? limiteIdx : Math.min(limiteIdx, primeiroTitulo);
  for (let i = 0; i < fim; i++) {
    const l = lines[i];
    if (!l.pieces.every(p => p.x > pageWidth * 0.45)) continue; // só o bloco da direita
    if (/^ordem de compra$/.test(l.norm)) continue;             // título
    const cnpj = l.text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    if (cnpj && !loja.cnpj) { loja.cnpj = formatarCNPJ(cnpj[1]); continue; }
    if (!loja.nome && /[a-z]{3}/i.test(l.text)) { loja.nome = limpaNome(l.text); continue; }
    enderecos.push(limpaNome(l.text));
  }
  loja.end = enderecos.join(' - ');
  return loja;
}

// Lê uma página: devolve os metadados encontrados e os itens da tabela.
// `temCabecalho` diz se a página abre uma OC nova (tem "Data da OC"/"Fornecedor")
// ou se é continuação da tabela da página anterior.
function parseOcPdfPage(page) {
  const { lines, width } = page;
  const meta = {};
  let hdrIdx = -1;

  lines.forEach((l, i) => {
    if (hdrIdx === -1 && /descri/.test(l.norm) && (/quantidade/.test(l.norm) || /unidade/.test(l.norm) || /^item/.test(l.norm))) {
      hdrIdx = i;
    }
  });
  const fimMeta = hdrIdx === -1 ? lines.length : hdrIdx;

  for (let i = 0; i < fimMeta; i++) {
    const l = lines[i];
    if (/data da oc/.test(l.norm) && !meta.orderDate) meta.orderDate = pdfValorApos(l, 'data da oc');
    if (/previsao de entrega/.test(l.norm) && !meta.deliveryDate) meta.deliveryDate = pdfValorApos(l, 'previsao de entrega');
    if (/fornecedor/.test(l.norm) && !meta.supplierName) meta.supplierName = pdfValorApos(l, 'fornecedor');
    if (/horario de recebimento/.test(l.norm) && !meta.horarioReceb) meta.horarioReceb = pdfValorApos(l, 'horario de recebimento');
    if (/responsavel/.test(l.norm) && !meta.responsavel) meta.responsavel = pdfValorApos(l, 'responsavel');
    if (/contato/.test(l.norm) && !meta.contato) meta.contato = pdfValorApos(l, 'contato');
    if (/forma de pagamento/.test(l.norm) && !meta.paymentForm) meta.paymentForm = pdfValorApos(l, 'forma de pagamento');
    if (/prazo de pagamento/.test(l.norm) && !meta.prazoPagamento) meta.prazoPagamento = pdfValorApos(l, 'prazo de pagamento');
    if (/observ/.test(l.norm) && !meta.obs) meta.obs = pdfValorApos(l, 'observ');
  }

  const loja = pdfLojaDoCabecalho(lines, fimMeta, width);
  const items = [];

  if (hdrIdx !== -1) {
    const cols = pdfItemColumns(lines, hdrIdx, width);
    for (let i = hdrIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (pdfEhFimDaTabela(l.norm)) break;
      // Ainda no bloco do cabeçalho ("Quantidade", "(O.C)", "(Recebida)")
      if (/^(\(?o\.?c\.?\)?|quantidade|\(recebida\)|status|item)$/.test(l.norm)) continue;

      const cel = { item: [], desc: [], unit: [], qty: [], rec: [], status: [] };
      l.pieces.forEach(p => cel[pdfColunaDoPedaco(p.cx, cols)].push(p.str));

      const product = limpaNome(cel.desc.join(' '));
      const qtyStr = cel.qty.join(' ');
      const numItem = limpaNome(cel.item.join(''));

      if (!product) continue;
      // Linha sem nº e sem quantidade = continuação da descrição de cima
      if (!numItem && !qtyStr && items.length) {
        items[items.length - 1].product = limpaNome(items[items.length - 1].product + ' ' + product);
        continue;
      }
      items.push({ product, unit: limpaNome(cel.unit.join(' ')), qty: parseQtyBR(qtyStr) });
    }
  }

  const temCabecalho = !!(meta.orderDate || meta.supplierName);
  return { meta, loja, items, temCabecalho };
}

// Monta a lista de OCs a partir das páginas. Cada página com cabeçalho começa
// uma OC; páginas sem cabeçalho continuam a tabela da anterior. O mesmo
// fornecedor repetido em páginas diferentes tem os itens juntados.
function parseOcPdfPages(pages) {
  const ocs = [];
  let loja = null;

  pages.forEach(page => {
    const { meta, loja: lojaPag, items, temCabecalho } = parseOcPdfPage(page);
    if (!loja && (lojaPag.nome || lojaPag.cnpj)) loja = lojaPag;

    if (!temCabecalho && ocs.length) {
      ocs[ocs.length - 1].items.push(...items);
      return;
    }
    const nome = limpaNome(meta.supplierName || '');
    const existente = nome && ocs.find(o => chave(o.pdfSupplierName) === chave(nome));
    if (existente) { existente.items.push(...items); return; }

    ocs.push({
      pdfSupplierName: nome,
      orderDate: meta.orderDate ? pdfDatePlusDays(meta.orderDate, 1) : '',
      orderDatePdf: limpaNome(meta.orderDate || ''),
      deliveryDate: pdfDateAsIs(meta.deliveryDate || ''),
      horarioReceb: limpaNome(meta.horarioReceb || ''),
      responsavel: limpaNome(meta.responsavel || ''),
      contato: limpaNome(meta.contato || ''),
      paymentForm: limpaNome(meta.paymentForm || ''),
      prazoPagamento: limpaNome(meta.prazoPagamento || ''),
      obs: limpaNome(meta.obs || ''),
      items: items.slice()
    });
  });

  return { loja: loja || { nome: '', cnpj: '', end: '' }, ocs };
}

// Extrai o texto posicionado de cada página com o pdf.js.
async function pdfTextPages(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') throw new Error('Biblioteca de leitura de PDF (pdf.js) não carregou.');
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push({ width: page.getViewport({ scale: 1 }).width, lines: pdfLinesFromItems(tc.items) });
  }
  return pages;
}

async function readOcPdf(arrayBuffer) {
  return parseOcPdfPages(await pdfTextPages(arrayBuffer));
}

// Para testes fora do navegador
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { pdfLinesFromItems, parseOcPdfPage, parseOcPdfPages, parsePdfDate, pdfDatePlusDays, parseQtyBR };
}
