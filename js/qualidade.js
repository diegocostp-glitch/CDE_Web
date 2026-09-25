// ============================================================================
// QUALIDADE DO SALMÃO — a tela que recebe o PCQS e devolve o relatório
//
// O caminho é o do Importar OC: arrasta o arquivo, lê, confere na tela e gera o
// documento. A diferença é o que sai — lá nasce uma ordem de compra, aqui nasce
// o Relatório de Recebimento de Salmão, que vai para diretoria, gerência e
// fornecedor resolverem diferença de peso e não conformidade.
//
// O cabeçalho do PCQS é EDITÁVEL nesta tela, de propósito. A leitura acerta o
// que a planilha traz, mas quem assina o relatório é quem responde pelo número:
// custo unitário digitado errado na planilha viraria cobrança errada no
// fornecedor. Editar aqui não mexe na planilha original — o PCQS continua sendo
// o documento de campo; este é o documento de acerto.
//
// As caixas, não: peso, lote, sensorial e validade saem como a gerência
// registrou. Se estiver errado, o lugar de corrigir é a planilha da loja, que é
// onde a assinatura do conferente está.
// ============================================================================

// Mesmo worker do leitor de OC em PDF. A tela carrega o pdf.js pela mesma URL
// do Importar OC: duas versões diferentes de pdf.js no sistema significariam
// dois resultados possíveis para o mesmo arquivo.
const PCQS_PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let CONFS = [];        // conferências lidas do arquivo
let ATUAL = 0;         // qual delas está na tela
let ARQUIVO = null;

// ------------------------------------------------------------------ leitura
async function paginasDoPdf(buffer) {
  if (typeof pdfjsLib === "undefined") throw new Error("Biblioteca de leitura de PDF (pdf.js) não carregou.");
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PCQS_PDF_WORKER;
  }
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const tc = await pagina.getTextContent();
    const largura = pagina.getViewport({ scale: 1 }).width;
    paginas.push({ largura, linhas: pcqsLinhasDeItens(tc.items, largura) });
  }
  return paginas;
}

function paginasDaPlanilha(buffer) {
  if (typeof XLSX === "undefined") throw new Error("Biblioteca de planilha (xlsx) não carregou.");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
  // Cada aba é uma "página": o PCQS costuma ter uma aba por recebimento, e a
  // largura vai zerada porque na planilha não existe margem em pontos.
  return wb.SheetNames.map((nome) => ({
    largura: 0,
    linhas: pcqsLinhasDaPlanilha(
      XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: "" })),
  }));
}

async function lerArquivo() {
  if (!ARQUIVO) return;
  const ehPdf = /\.pdf$/i.test(ARQUIVO.name);
  estado("Lendo " + (ehPdf ? "PDF" : "planilha") + "…");
  try {
    const buffer = await ARQUIVO.arrayBuffer();
    const paginas = ehPdf ? await paginasDoPdf(buffer) : paginasDaPlanilha(buffer);
    CONFS = lerPcqsPaginas(paginas);
    if (!CONFS.length) {
      estado("Nada reconhecido", "erro");
      aviso("O arquivo não tem o desenho do PCQS: não achei nem cabeçalho de recebimento nem caixa com lote.", "mau");
      return;
    }
    CONFS.forEach((c) => {
      c.ajustes = Object.assign({}, PCQS_AJUSTES_PADRAO);
      // O supervisor sai do próprio PCQS (é o "RESPONSÁVEL" da planilha); os dois
      // gerentes que validam não constam lá e vêm da lista por casa, em
      // js/pcqs.js — já preenchidos na tela, e editáveis ali mesmo.
      const g = pcqsGerentesDaLoja(c.cab.loja);
      c.extras = { assSuprimentos: g.suprimentos, assOperacional: g.operacional,
                   obs: "", assManual: false };
    });
    ATUAL = 0;
    estado(CONFS.length > 1 ? CONFS.length + " recebimentos lidos" : "PCQS lido", "ok");
    const caixas = CONFS.reduce((s, c) => s + c.caixas.length, 0);
    aviso("Leitura concluída: " + caixas + (caixas > 1 ? " caixas" : " caixa") +
          " em " + CONFS.length + (CONFS.length > 1 ? " recebimentos." : " recebimento."), "bom");
    $("#cartao-envio").hidden = true;
    desenhar();
  } catch (e) {
    estado("Erro na leitura", "erro");
    aviso("Não deu para ler o arquivo: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ tela
const conf = () => CONFS[ATUAL];
const analisar = () => analisarPcqs(conf(), conf().ajustes);

// Campos do cabeçalho que a tela deixa conferir antes de emitir. A ordem é a
// de leitura do documento, não a alfabética: quem revisa está comparando com o
// papel na mão.
const CAMPOS_CAB = [
  { k: "loja", r: "Loja / unidade", largo: true },
  { k: "fornecedor", r: "Fornecedor", largo: true },
  { k: "nf", r: "Nº da NF" },
  { k: "custoUnitario", r: "Custo unitário (R$/Kg)" },
  { k: "entrega", r: "Data/hora da entrega" },
  { k: "validade", r: "Validade (NF)" },
  { k: "libragem", r: "Libragem contratada" },
  { k: "caixasNF", r: "Total de caixas (NF)" },
  { k: "pesoNF", r: "Peso total da NF (Kg)" },
  { k: "responsavel", r: "Supervisor responsável" },
];

const CAMPOS_AJU = [
  { k: "tolPesoPerc", r: "Tolerância de peso (%)" },
  { k: "tolPesoKg", r: "Tolerância por caixa (Kg)" },
  { k: "validadeMinDias", r: "Validade mínima (dias)" },
];

function desenhar() {
  const a = analisar();
  const c = conf();
  $("#painel").hidden = false;
  $("#seletor").innerHTML = CONFS.length < 2 ? "" :
    '<div class="segmentado">' + CONFS.map((x, i) =>
      '<button data-i="' + i + '" class="' + (i === ATUAL ? "ativa" : "") + '">NF ' +
      esc(x.cab.nf || "?") + " · " + esc(x.cab.fornecedor || "sem fornecedor") +
      "</button>").join("") + "</div>";

  const campo = (def, valor, dados) =>
    '<label class="campo' + (def.largo ? " campo-largo" : "") + '"><span>' + esc(def.r) + "</span>" +
    '<input type="text" data-' + dados + '="' + def.k + '" value="' + esc(valor) + '"></label>';

  $("#form-cab").innerHTML =
    CAMPOS_CAB.map((d) => campo(d, c.cab[d.k] || "", "cab")).join("") +
    CAMPOS_AJU.map((d) => campo(d, String(c.ajustes[d.k]).replace(".", ","), "aju")).join("") +
    '<label class="campo campo-largo"><span>Gerente de suprimentos (assinatura)</span>' +
      '<input type="text" data-ex="assSuprimentos" value="' + esc(c.extras.assSuprimentos) + '"></label>' +
    '<label class="campo campo-largo"><span>Gerente operacional (assinatura)</span>' +
      '<input type="text" data-ex="assOperacional" value="' + esc(c.extras.assOperacional) + '"></label>' +
    '<label class="campo campo-largo"><span>Observações para o relatório</span>' +
      '<textarea data-ex="obs" rows="2" placeholder="tratativa acertada com o fornecedor, ' +
      'número do protocolo, devolução combinada…">' + esc(c.extras.obs) + "</textarea></label>";

  recalcular(a);
}

function desenharResumo(a) {
  const t = a.tot;
  const tom = { aprovado: "bom", ressalva: "aviso", reprovado: "ruim" }[a.veredito.tipo];
  const ficha = (classe, rotulo, valor, pe) =>
    '<div class="ficha estatica ' + classe + '">' +
      '<div class="ficha-vals"><span class="ficha-r">' + esc(rotulo) + "</span>" +
      '<span class="ficha-n">' + esc(valor) + "</span></div>" +
      '<div class="ficha-pe">' + esc(pe) + "</div></div>";

  $("#veredito").className = "veredito " + tom;
  $("#veredito").innerHTML =
    '<span class="vd-selo">' + esc(a.veredito.rotulo) + "</span>" +
    '<div class="vd-txt"><strong>' + esc(a.veredito.resumo) + "</strong>" +
    "<span>" + esc(a.financeiro.rotulo === "SEM ACERTO A FAZER"
      ? "Sem acerto financeiro pendente."
      : a.financeiro.rotulo + " · " + pcqsRs(a.financeiro.valor)) + "</span></div>";

  $("#placar").innerHTML =
    ficha("neutro", "Peso da nota fiscal", pcqsKg(t.pesoNF), "conforme NF") +
    ficha("neutro", "Peso conferido na loja", pcqsKg(t.pesoRecebido),
          t.caixas + (t.caixas > 1 ? " caixas pesadas" : " caixa pesada")) +
    ficha(Math.abs(t.difPeso) > t.tolTotal ? "ruim" : "bom", "Divergência de peso",
          pcqsSinalKg(t.difPeso), pcqsFmt(t.difPesoPerc, 2) + "% · tolerância " +
          pcqsKg(t.tolTotal)) +
    ficha(a.financeiro.valor > 0 ? "aviso" : "bom", "Acerto financeiro",
          pcqsRs(a.financeiro.valor), a.financeiro.rotulo.toLowerCase());

  const linha = (l) => {
    const val = (q) => l.tipo === "texto" ? String(l[q] || "—")
      : l.tipo === "rs" ? pcqsRs(l[q]) : l.tipo === "pcs" ? pcqsPcs(l[q])
      : l.tipo === "qtd" ? pcqsFmt(l[q], 0) : pcqsKg(l[q]);
    const dif = l.tipo === "texto" ? (l.ok ? "—" : "divergente")
      : l.tipo === "rs" ? pcqsSinalRs(l.dif)
      : l.tipo === "pcs" ? pcqsSinalPcs(l.dif)
      : l.tipo === "qtd" ? (l.dif > 0 ? "+" : "") + pcqsFmt(l.dif, 0) : pcqsSinalKg(l.dif);
    return "<tr><td>" + esc(l.indicador) + (l.nota ? '<small class="msg-conv">' +
        esc(l.nota) + "</small>" : "") + "</td>" +
      '<td class="calc">' + esc(val("nf")) + "</td>" +
      '<td class="calc">' + esc(val("rec")) + "</td>" +
      '<td class="calc' + (l.ok ? "" : " neg") + '">' + esc(dif) + "</td>" +
      '<td><span class="selo ' + (l.ok ? "bom" : "ruim") + '">' +
        (l.ok ? "OK" : "DIVERGENTE") + "</span></td></tr>";
  };
  $("#comparativo").innerHTML =
    '<div class="rolagem"><table class="tabela-curta"><thead><tr>' +
      "<th>Indicador</th><th>Nota fiscal / etiquetas</th><th>Conferido na loja</th>" +
      "<th>Diferença</th><th>Situação</th></tr></thead><tbody>" +
      a.comparativo.map(linha).join("") + "</tbody></table></div>";
}

function desenharNCs(a) {
  if (!a.ncs.length) {
    $("#ncs").innerHTML = '<p class="vazio">Nenhuma não conformidade apurada nesta entrega.</p>';
    return;
  }
  $("#ncs").innerHTML = '<div class="nc-lista">' + a.ncs.map((n) => {
    const grave = n.gravidade === "alta";
    return '<div class="nc-item ' + (grave ? "alta" : "media") + '">' +
      '<div class="nc-topo"><strong>' + esc(n.titulo) + "</strong>" +
      '<span class="selo ' + (grave ? "ruim" : "aviso") + '">' +
        (grave ? "Tratativa imediata" : "Ressalva") + "</span></div>" +
      "<p>" + esc(n.detalhe) + "</p>" +
      (n.caixas.length ? '<span class="fonte">Caixas: ' + n.caixas.join(", ") + "</span>" : "") +
      "</div>";
  }).join("") + "</div>";
}

function desenharCaixas(a) {
  const temBruto = a.caixas.some((c) => c.pesoBruto > 0);
  const temMotivo = a.caixas.some((c) => c.motivo);
  const cel = (v, classe) => '<td class="' + (classe || "") + '">' + esc(v) + "</td>";
  // Só o que foge do padrão ganha selo: seis linhas de "REGULAR" com etiqueta
  // colorida em cada célula tirariam a atenção justamente da que importa.
  const marca = (tipo, v) => (tipo === "ruim" || tipo === "duvida")
    ? '<td><span class="selo ' + (tipo === "ruim" ? "ruim" : "aviso") + '">' +
      esc(v || "—") + "</span></td>"
    : "<td>" + esc(v || "—") + "</td>";

  const peso =
    '<div class="rolagem"><table class="tabela-caixas"><thead><tr>' +
      "<th>Cx</th><th>Lote</th><th>Libragem</th><th>Peixes</th>" +
      (temBruto ? "<th>Peso bruto</th>" : "") +
      "<th>Peso etiqueta</th><th>Peso físico</th><th>Diferença</th>" +
      "<th>Peso médio</th><th>Situação</th></tr></thead><tbody>" +
    a.caixas.map((c) => "<tr>" +
      cel(String(c.n).padStart(2, "0")) + cel(c.lote || "—") +
      cel(c.libragemConf || c.libragemEtiqueta || "—", "calc") +
      cel(pcqsFmt(c.peixes, 0), "calc") +
      (temBruto ? cel(c.pesoBruto ? pcqsKg(c.pesoBruto) : "—", "calc") : "") +
      cel(pcqsKg(c.pesoLiquido), "calc") + cel(pcqsKg(c.pesoFisico), "calc") +
      cel(pcqsSinalKg(c.difEtiqueta), "calc" + (c.pesoDivergente ? " neg" : "")) +
      cel(pcqsKg(c.pesoMedio), "calc" + (c.foraDaFaixa ? " neg" : "")) +
      '<td><span class="selo ' + (c.ok ? "bom" : "ruim") + '">' +
        (c.ok ? "OK" : c.reprovada ? "Reprovada" : "Divergente") + "</span></td></tr>").join("") +
    "</tbody><tfoot><tr class=\"linha-total\">" +
      cel("") + cel("Totais") + cel("") + cel(pcqsFmt(a.tot.peixes, 0), "calc") +
      (temBruto ? cel("") : "") +
      cel(pcqsKg(a.tot.pesoEtiquetas), "calc") + cel(pcqsKg(a.tot.pesoRecebido), "calc") +
      cel(pcqsSinalKg(a.tot.pesoEtiquetas ? a.tot.pesoRecebido - a.tot.pesoEtiquetas : 0), "calc") +
      cel(pcqsKg(a.tot.pesoMedioRecebido), "calc") + cel("") +
    "</tr></tfoot></table></div>";

  const sensorial =
    '<div class="rolagem"><table class="tabela-caixas"><thead><tr>' +
      "<th>Cx</th><th>Odor</th><th>Visual</th><th>Fibra</th><th>Gelo</th>" +
      "<th>Validade</th><th>Dias</th><th>Status</th>" +
      (temMotivo ? "<th>Motivo</th>" : "") + "</tr></thead><tbody>" +
    a.caixas.map((c) => "<tr>" +
      cel(String(c.n).padStart(2, "0")) +
      marca(c.odorTipo, c.odor) + marca(c.visualTipo, c.visual) +
      marca(c.fibraTipo, c.fibra) + marca(c.geloTipo, c.gelo) +
      cel(c.validade || "—", "calc") +
      cel(c.diasValidade === null ? "—" : String(c.diasValidade),
          "calc" + (c.validadeCurta ? " neg" : "")) +
      '<td><span class="selo ' + (c.reprovada ? "ruim" : "bom") + '">' +
        esc(c.status || c.veredito || "—") + "</span></td>" +
      (temMotivo ? cel(c.motivo || "—") : "") + "</tr>").join("") +
    "</tbody></table></div>";

  $("#caixas-peso").innerHTML = peso;
  $("#caixas-sensorial").innerHTML = sensorial;
}

// ------------------------------------------------------------------ documento
function gerarDoc() {
  const a = analisar();
  return { doc: pcqsDocumento(a, conf().extras), nome: pcqsNomeArquivo(a.cab) };
}

function baixarPdf() {
  try {
    const { doc, nome } = gerarDoc();
    doc.save(nome + ".pdf");
    estado("Relatório gerado", "ok");
    aviso("Relatório salvo: " + nome + ".pdf", "bom");
  } catch (e) {
    aviso("Não deu para gerar o PDF: " + e.message, "mau");
  }
}

function verPrevia() {
  try {
    const { doc } = gerarDoc();
    window.open(doc.output("bloburl"), "_blank");
  } catch (e) {
    aviso("Não deu para abrir a prévia: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ ligações
function ligarEnvio() {
  const zona = $("#zona"), entrada = $("#arquivo");
  const escolher = (f) => {
    if (!f) return;
    ARQUIVO = f;
    $("#nome-arquivo").textContent = f.name;
    $("#escolhido").hidden = false;
    estado("");
  };
  entrada.addEventListener("change", () => escolher(entrada.files[0]));
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.add("sobre");
  }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.remove("sobre");
  }));
  zona.addEventListener("drop", (e) => escolher(e.dataTransfer.files[0]));
  $("#btn-ler").addEventListener("click", lerArquivo);
  $("#btn-cancelar").addEventListener("click", () => {
    ARQUIVO = null; entrada.value = ""; $("#escolhido").hidden = true; estado("");
  });
}

function ligarTela() {
  // Um ouvinte no painel inteiro: os campos são redesenhados a cada conferência
  // trocada, e ouvinte por campo morreria no redesenho.
  $("#painel").addEventListener("input", (e) => {
    const el = e.target;
    if (!CONFS.length) return;
    const c = conf();
    if (el.dataset.cab) {
      c.cab[el.dataset.cab] = el.value;
      if (el.dataset.cab === "loja") aplicarGerentes(c);
      recalcular();
    } else if (el.dataset.aju) {
      c.ajustes[el.dataset.aju] = pcqsNum(el.value);
      recalcular();
    } else if (el.dataset.ex) {
      c.extras[el.dataset.ex] = el.value;
      // digitou o nome de um gerente: a lista para de mandar nesta conferência
      if (el.dataset.ex === "assSuprimentos" || el.dataset.ex === "assOperacional") {
        c.extras.assManual = true;
      }
    }
  });
  $("#seletor").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    ATUAL = Number(b.dataset.i);
    desenhar();
  });
  $("#btn-pdf").addEventListener("click", baixarPdf);
  $("#btn-previa").addEventListener("click", verPrevia);
  $("#btn-outro").addEventListener("click", () => {
    CONFS = []; ARQUIVO = null;
    $("#arquivo").value = ""; $("#escolhido").hidden = true;
    $("#painel").hidden = true; $("#cartao-envio").hidden = false;
    estado("");
  });
}

// Corrige os dois gerentes quando a loja muda. Escreve direto no valor do
// campo em vez de redesenhar o formulário: quem está digitando a loja não pode
// perder o cursor no meio da palavra. Nome digitado à mão não é tocado —
// corrigir a loja depois disso não apaga o que a pessoa escolheu.
function aplicarGerentes(c) {
  if (c.extras.assManual) return;
  const g = pcqsGerentesDaLoja(c.cab.loja);
  c.extras.assSuprimentos = g.suprimentos;
  c.extras.assOperacional = g.operacional;
  const campoSup = $('[data-ex="assSuprimentos"]');
  const campoOp = $('[data-ex="assOperacional"]');
  if (campoSup) campoSup.value = g.suprimentos;
  if (campoOp) campoOp.value = g.operacional;
}

// Redesenha só o que depende de número, preservando o foco de quem digita: o
// formulário não é refeito, então o cursor não salta do campo a cada tecla.
function recalcular(pronta) {
  const a = pronta || analisar();
  desenharResumo(a);
  desenharNCs(a);
  desenharCaixas(a);
  $("#rodape-doc").textContent =
    "Custo real do quilo recebido: " + pcqsRs(a.tot.custoReal) + "  ·  " +
    "valor da nota " + pcqsRs(a.tot.valorNF) + "  ·  " +
    "valor do que entrou " + pcqsRs(a.tot.valorRecebido);
}

ligarEnvio();
ligarTela();
