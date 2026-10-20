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
//
// A leitura e a análise moram em js/pcqs.js (sem DOM, de propósito: roda no
// node nos testes) e o PDF em js/pcqs-pdf.js; os dois não migram e chegam como
// globais pelos <script> do qualidade.html, junto com xlsx, pdf.js e jsPDF.
// ============================================================================
import { html, useState, useRef } from "../html.js";
import { avisoCompras as aviso, Estado } from "../componentes/Aviso.js";
import { montarTela } from "../montar.js";

// Mesmo worker do leitor de OC em PDF. A tela carrega o pdf.js pela mesma URL
// do Importar OC: duas versões diferentes de pdf.js no sistema significariam
// dois resultados possíveis para o mesmo arquivo.
const PCQS_PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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

// ------------------------------------------------------------------ resumo
const Ficha = ({ classe, rotulo, valor, pe }) => html`<div class=${"ficha estatica " + classe}><div class="ficha-vals"><span class="ficha-r">${rotulo}</span><span class="ficha-n">${valor}</span></div><div class="ficha-pe">${pe}</div></div>`;

function Veredito({ a }) {
  const tom = { aprovado: "bom", ressalva: "aviso", reprovado: "ruim" }[a.veredito.tipo];
  return html`<div class=${"veredito " + tom} id="veredito"><span class="vd-selo">${a.veredito.rotulo}</span><div class="vd-txt"><strong>${a.veredito.resumo}</strong><span>${
    a.financeiro.rotulo === "SEM ACERTO A FAZER"
      ? "Sem acerto financeiro pendente."
      : a.financeiro.rotulo + " · " + pcqsRs(a.financeiro.valor)}</span></div></div>`;
}

function Placar({ a }) {
  const t = a.tot;
  return html`<div class="placar" id="placar">
    <${Ficha} classe="neutro" rotulo="Peso da nota fiscal" valor=${pcqsKg(t.pesoNF)} pe="conforme NF" />
    <${Ficha} classe="neutro" rotulo="Peso conferido na loja" valor=${pcqsKg(t.pesoRecebido)}
      pe=${t.caixas + (t.caixas > 1 ? " caixas pesadas" : " caixa pesada")} />
    <${Ficha} classe=${Math.abs(t.difPeso) > t.tolTotal ? "ruim" : "bom"} rotulo="Divergência de peso"
      valor=${pcqsSinalKg(t.difPeso)} pe=${pcqsFmt(t.difPesoPerc, 2) + "% · tolerância " + pcqsKg(t.tolTotal)} />
    <${Ficha} classe=${a.financeiro.valor > 0 ? "aviso" : "bom"} rotulo="Acerto financeiro"
      valor=${pcqsRs(a.financeiro.valor)} pe=${a.financeiro.rotulo.toLowerCase()} />
  </div>`;
}

function Comparativo({ a }) {
  const linha = (l, i) => {
    const val = (q) => l.tipo === "texto" ? String(l[q] || "—")
      : l.tipo === "rs" ? pcqsRs(l[q]) : l.tipo === "pcs" ? pcqsPcs(l[q])
      : l.tipo === "qtd" ? pcqsFmt(l[q], 0) : pcqsKg(l[q]);
    const dif = l.tipo === "texto" ? (l.ok ? "—" : "divergente")
      : l.tipo === "rs" ? pcqsSinalRs(l.dif)
      : l.tipo === "pcs" ? pcqsSinalPcs(l.dif)
      : l.tipo === "qtd" ? (l.dif > 0 ? "+" : "") + pcqsFmt(l.dif, 0) : pcqsSinalKg(l.dif);
    return html`<tr key=${i}><td>${l.indicador}${l.nota ? html`<small class="msg-conv">${l.nota}</small>` : null}</td><td class="calc">${val("nf")}</td><td class="calc">${val("rec")}</td><td class=${"calc" + (l.ok ? "" : " neg")}>${dif}</td><td><span class=${"selo " + (l.ok ? "bom" : "ruim")}>${l.ok ? "OK" : "DIVERGENTE"}</span></td></tr>`;
  };
  return html`<div id="comparativo"><div class="rolagem"><table class="tabela-curta"><thead><tr><th>Indicador</th><th>Nota fiscal / etiquetas</th><th>Conferido na loja</th><th>Diferença</th><th>Situação</th></tr></thead><tbody>${a.comparativo.map(linha)}</tbody></table></div></div>`;
}

function NaoConformidades({ a }) {
  if (!a.ncs.length) return html`<div id="ncs"><p class="vazio">Nenhuma não conformidade apurada nesta entrega.</p></div>`;
  return html`<div id="ncs"><div class="nc-lista">${a.ncs.map((n, i) => {
    const grave = n.gravidade === "alta";
    return html`<div key=${i} class=${"nc-item " + (grave ? "alta" : "media")}><div class="nc-topo"><strong>${n.titulo}</strong><span class=${"selo " + (grave ? "ruim" : "aviso")}>${grave ? "Tratativa imediata" : "Ressalva"}</span></div><p>${n.detalhe}</p>${n.caixas.length ? html`<span class="fonte">${"Caixas: " + n.caixas.join(", ")}</span>` : null}</div>`;
  })}</div></div>`;
}

// ------------------------------------------------------------------ caixas
const Cel = ({ v, classe }) => html`<td class=${classe || ""}>${v}</td>`;
// Só o que foge do padrão ganha selo: seis linhas de "REGULAR" com etiqueta
// colorida em cada célula tirariam a atenção justamente da que importa.
const Marca = ({ tipo, v }) => (tipo === "ruim" || tipo === "duvida")
  ? html`<td><span class=${"selo " + (tipo === "ruim" ? "ruim" : "aviso")}>${v || "—"}</span></td>`
  : html`<td>${v || "—"}</td>`;
const nCaixa = (c) => String(c.n).padStart(2, "0");

function CaixasPeso({ a }) {
  const temBruto = a.caixas.some((c) => c.pesoBruto > 0);
  return html`<div id="caixas-peso"><div class="rolagem"><table class="tabela-caixas"><thead><tr><th>Cx</th><th>Lote</th><th>Libragem</th><th>Peixes</th>${temBruto ? html`<th>Peso bruto</th>` : null}<th>Peso etiqueta</th><th>Peso físico</th><th>Diferença</th><th>Peso médio</th><th>Situação</th></tr></thead><tbody>${
    a.caixas.map((c, i) => html`<tr key=${i}><${Cel} v=${nCaixa(c)} /><${Cel} v=${c.lote || "—"} /><${Cel} v=${c.libragemConf || c.libragemEtiqueta || "—"} classe="calc" /><${Cel} v=${pcqsFmt(c.peixes, 0)} classe="calc" />${
      temBruto ? html`<${Cel} v=${c.pesoBruto ? pcqsKg(c.pesoBruto) : "—"} classe="calc" />` : null}<${Cel} v=${pcqsKg(c.pesoLiquido)} classe="calc" /><${Cel} v=${pcqsKg(c.pesoFisico)} classe="calc" /><${Cel} v=${pcqsSinalKg(c.difEtiqueta)} classe=${"calc" + (c.pesoDivergente ? " neg" : "")} /><${Cel} v=${pcqsKg(c.pesoMedio)} classe=${"calc" + (c.foraDaFaixa ? " neg" : "")} /><td><span class=${"selo " + (c.ok ? "bom" : "ruim")}>${c.ok ? "OK" : c.reprovada ? "Reprovada" : "Divergente"}</span></td></tr>`)
  }</tbody><tfoot><tr class="linha-total"><${Cel} v="" /><${Cel} v="Totais" /><${Cel} v="" /><${Cel} v=${pcqsFmt(a.tot.peixes, 0)} classe="calc" />${
    temBruto ? html`<${Cel} v="" />` : null}<${Cel} v=${pcqsKg(a.tot.pesoEtiquetas)} classe="calc" /><${Cel} v=${pcqsKg(a.tot.pesoRecebido)} classe="calc" /><${Cel} v=${pcqsSinalKg(a.tot.pesoEtiquetas ? a.tot.pesoRecebido - a.tot.pesoEtiquetas : 0)} classe="calc" /><${Cel} v=${pcqsKg(a.tot.pesoMedioRecebido)} classe="calc" /><${Cel} v="" /></tr></tfoot></table></div></div>`;
}

function CaixasSensorial({ a }) {
  const temMotivo = a.caixas.some((c) => c.motivo);
  return html`<div id="caixas-sensorial"><div class="rolagem"><table class="tabela-caixas"><thead><tr><th>Cx</th><th>Odor</th><th>Visual</th><th>Fibra</th><th>Gelo</th><th>Validade</th><th>Dias</th><th>Status</th>${temMotivo ? html`<th>Motivo</th>` : null}</tr></thead><tbody>${
    a.caixas.map((c, i) => html`<tr key=${i}><${Cel} v=${nCaixa(c)} /><${Marca} tipo=${c.odorTipo} v=${c.odor} /><${Marca} tipo=${c.visualTipo} v=${c.visual} /><${Marca} tipo=${c.fibraTipo} v=${c.fibra} /><${Marca} tipo=${c.geloTipo} v=${c.gelo} /><${Cel} v=${c.validade || "—"} classe="calc" /><${Cel} v=${c.diasValidade === null ? "—" : String(c.diasValidade)} classe=${"calc" + (c.validadeCurta ? " neg" : "")} /><td><span class=${"selo " + (c.reprovada ? "ruim" : "bom")}>${c.status || c.veredito || "—"}</span></td>${
      temMotivo ? html`<${Cel} v=${c.motivo || "—"} />` : null}</tr>`)
  }</tbody></table></div></div>`;
}

// ------------------------------------------------------------------ formulário
// Tolerância: o campo guarda o texto digitado ("0," no meio da digitação) e a
// conta recebe o número lido dele.
function CampoAjuste({ def, valor, aoMudar }) {
  const [texto, setTexto] = useState(() => String(valor).replace(".", ","));
  return html`<label class="campo"><span>${def.r}</span><input type="text" data-aju=${def.k} value=${texto}
    onInput=${(e) => { setTexto(e.target.value); aoMudar(pcqsNum(e.target.value)); }} onChange=${() => {}} /></label>`;
}

function Formulario({ c, mudarCab, mudarAjuste, mudarExtra }) {
  const extra = (k, r) => html`<label class="campo campo-largo"><span>${r}</span><input type="text" data-ex=${k}
    value=${c.extras[k]} onInput=${(e) => mudarExtra(k, e.target.value)} onChange=${() => {}} /></label>`;
  return html`<div class="grade-oc" id="form-cab">${
    CAMPOS_CAB.map((d) => html`<label key=${d.k} class=${"campo" + (d.largo ? " campo-largo" : "")}><span>${d.r}</span><input type="text" data-cab=${d.k}
      value=${String(c.cab[d.k] || "")} onInput=${(e) => mudarCab(d.k, e.target.value)} onChange=${() => {}} /></label>`)}${
    CAMPOS_AJU.map((d) => html`<${CampoAjuste} key=${d.k} def=${d} valor=${c.ajustes[d.k]}
      aoMudar=${(v) => mudarAjuste(d.k, v)} />`)}${
    extra("assSuprimentos", "Gerente de suprimentos (assinatura)")}${
    extra("assOperacional", "Gerente operacional (assinatura)")}<label class="campo campo-largo"><span>Observações para o relatório</span><textarea data-ex="obs" rows="2"
      placeholder="tratativa acertada com o fornecedor, número do protocolo, devolução combinada…"
      value=${c.extras.obs} onInput=${(e) => mudarExtra("obs", e.target.value)} onChange=${() => {}}></textarea></label></div>`;
}

// ------------------------------------------------------------------ tela
function Qualidade() {
  const [arquivo, setArquivo] = useState(null);
  const [sobre, setSobre] = useState(false);
  const [confs, setConfs] = useState([]);     // conferências lidas do arquivo
  const [atual, setAtual] = useState(0);      // qual delas está na tela
  const [lido, setLido] = useState(false);    // painel à vista, envio escondido
  const [leitura, setLeitura] = useState(0);  // muda a cada arquivo lido: o formulário renasce
  const [est, setEst] = useState({ texto: "", classe: "" });
  const entrada = useRef(null);
  const estado = (texto, classe) => setEst({ texto: texto || "", classe: classe || "" });

  const escolher = (f) => {
    if (!f) return;
    setArquivo(f);
    estado("");
  };
  const arrastando = (sim) => (e) => { e.preventDefault(); setSobre(sim); };

  async function lerArquivo() {
    if (!arquivo) return;
    const ehPdf = /\.pdf$/i.test(arquivo.name);
    estado("Lendo " + (ehPdf ? "PDF" : "planilha") + "…");
    try {
      const buffer = await arquivo.arrayBuffer();
      const paginas = ehPdf ? await paginasDoPdf(buffer) : paginasDaPlanilha(buffer);
      const lidas = lerPcqsPaginas(paginas);
      if (!lidas.length) {
        setConfs(lidas);
        estado("Nada reconhecido", "erro");
        aviso("O arquivo não tem o desenho do PCQS: não achei nem cabeçalho de recebimento nem caixa com lote.", "mau");
        return;
      }
      lidas.forEach((c) => {
        c.ajustes = Object.assign({}, PCQS_AJUSTES_PADRAO);
        // O supervisor sai do próprio PCQS (é o "RESPONSÁVEL" da planilha); os dois
        // gerentes que validam não constam lá e vêm da lista por casa, em
        // js/pcqs.js — já preenchidos na tela, e editáveis ali mesmo.
        const g = pcqsGerentesDaLoja(c.cab.loja);
        c.extras = { assSuprimentos: g.suprimentos, assOperacional: g.operacional,
                     obs: "", assManual: false };
      });
      setConfs(lidas);
      setAtual(0);
      setLeitura((n) => n + 1);
      estado(lidas.length > 1 ? lidas.length + " recebimentos lidos" : "PCQS lido", "ok");
      const caixas = lidas.reduce((s, c) => s + c.caixas.length, 0);
      aviso("Leitura concluída: " + caixas + (caixas > 1 ? " caixas" : " caixa") +
            " em " + lidas.length + (lidas.length > 1 ? " recebimentos." : " recebimento."), "bom");
      setLido(true);
    } catch (e) {
      estado("Erro na leitura", "erro");
      aviso("Não deu para ler o arquivo: " + e.message, "mau");
    }
  }

  const cancelar = () => {
    setArquivo(null);
    if (entrada.current) entrada.current.value = "";
    estado("");
  };
  const lerOutro = () => {
    setConfs([]);
    cancelar();
    setLido(false);
  };

  // ---- edição da conferência na tela
  const mudarConf = (fn) => setConfs((cs) => cs.map((c, i) => i === atual ? fn(c) : c));
  const mudarCab = (k, v) => mudarConf((c) => {
    const novo = { ...c, cab: { ...c.cab, [k]: v } };
    // Trocar a loja corrige os dois gerentes — sem refazer o formulário, quem
    // está digitando a loja não perde o cursor. Nome digitado à mão não é
    // tocado: corrigir a loja depois disso não apaga o que a pessoa escolheu.
    if (k === "loja" && !c.extras.assManual) {
      const g = pcqsGerentesDaLoja(v);
      novo.extras = { ...c.extras, assSuprimentos: g.suprimentos, assOperacional: g.operacional };
    }
    return novo;
  });
  const mudarAjuste = (k, v) => mudarConf((c) => ({ ...c, ajustes: { ...c.ajustes, [k]: v } }));
  const mudarExtra = (k, v) => mudarConf((c) => ({ ...c, extras: { ...c.extras, [k]: v,
    // digitou o nome de um gerente: a lista para de mandar nesta conferência
    assManual: c.extras.assManual || k === "assSuprimentos" || k === "assOperacional" } }));

  const c = lido ? confs[atual] : null;
  const a = c ? analisarPcqs(c, c.ajustes) : null;

  // ---- documento
  const gerarDoc = () => ({ doc: pcqsDocumento(a, c.extras), nome: pcqsNomeArquivo(a.cab) });
  const baixarPdf = () => {
    try {
      const { doc, nome } = gerarDoc();
      doc.save(nome + ".pdf");
      estado("Relatório gerado", "ok");
      aviso("Relatório salvo: " + nome + ".pdf", "bom");
    } catch (e) {
      aviso("Não deu para gerar o PDF: " + e.message, "mau");
    }
  };
  const verPrevia = () => {
    try {
      const { doc } = gerarDoc();
      window.open(doc.output("bloburl"), "_blank");
    } catch (e) {
      aviso("Não deu para abrir a prévia: " + e.message, "mau");
    }
  };

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Qualidade do Salmão</h1>
        <p>Leia o PCQS — planilha ou PDF — e emita o Relatório de Recebimento de
           Salmão: divergência de peso, não conformidades e o valor a acertar com o
           fornecedor.</p>
      </div>
      <div class="header-acoes">
        <${Estado} texto=${est.texto} classe=${est.classe} />
      </div>
    </div>

    <section class="cartao" id="cartao-envio" hidden=${lido}>
      <div class=${"zona-envio" + (sobre ? " sobre" : "")} id="zona"
           onDragEnter=${arrastando(true)} onDragOver=${arrastando(true)}
           onDragLeave=${arrastando(false)}
           onDrop=${(e) => { arrastando(false)(e); escolher(e.dataTransfer.files[0]); }}>
        <input type="file" id="arquivo" accept=".xlsx,.xlsm,.csv,.pdf" ref=${entrada}
               onChange=${(e) => escolher(e.target.files[0])} />
        <div class="zona-ico">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l7 3v5c0 4.5-3 7.6-7 10-4-2.4-7-5.5-7-10V6z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </div>
        <div class="zona-txt">Arraste o PCQS (.xlsx) ou o PDF da planilha — ou clique para escolher</div>
        <div class="fonte" style=${{ marginTop: "6px" }}>
          Planilha Controle de Qualidade Salmão, preenchida pela gerência no recebimento
        </div>
      </div>

      <div class="arquivo-escolhido" id="escolhido" hidden=${!arquivo}>
        <strong id="nome-arquivo">${arquivo ? arquivo.name : ""}</strong>
        <span style=${{ flex: 1 }}></span>
        <button class="botao primario" id="btn-ler" onClick=${lerArquivo}>Ler arquivo</button>
        <button class="botao" id="btn-cancelar" onClick=${cancelar}>Cancelar</button>
      </div>
    </section>

    <div id="painel" hidden=${!lido}>${!a ? null : html`
      <div class="barra" id="barra-acoes">
        <div id="seletor">${confs.length < 2 ? null : html`<div class="segmentado">${confs.map((x, i) =>
          html`<button key=${i} data-i=${i} class=${i === atual ? "ativa" : ""} onClick=${() => setAtual(i)}>${
            "NF " + (x.cab.nf || "?") + " · " + (x.cab.fornecedor || "sem fornecedor")}</button>`)}</div>`}</div>
        <span style=${{ flex: 1 }}></span>
        <button class="botao" id="btn-outro" onClick=${lerOutro}>Ler outro arquivo</button>
        <button class="botao" id="btn-previa" onClick=${verPrevia}>Ver prévia</button>
        <button class="botao primario" id="btn-pdf" onClick=${baixarPdf}>Baixar relatório em PDF</button>
      </div>

      <${Veredito} a=${a} />

      <section class="cartao">
        <div class="cabeca">
          <h2>Conferência do recebimento</h2>
          <span class="fonte">peso da nota contra o peso medido na loja</span>
        </div>
        <${Placar} a=${a} />
        <${Comparativo} a=${a} />
      </section>

      <section class="cartao">
        <div class="cabeca">
          <h2>Não conformidades</h2>
          <span class="fonte">o que o relatório leva para tratativa</span>
        </div>
        <${NaoConformidades} a=${a} />
      </section>

      <section class="cartao">
        <div class="cabeca">
          <h2>Caixa a caixa — peso</h2>
          <span class="fonte">etiqueta do fornecedor contra a balança da loja</span>
        </div>
        <${CaixasPeso} a=${a} />
      </section>

      <section class="cartao">
        <div class="cabeca">
          <h2>Caixa a caixa — sensorial, gelo e validade</h2>
          <span class="fonte">como a gerência registrou na abertura das caixas</span>
        </div>
        <${CaixasSensorial} a=${a} />
      </section>

      <section class="cartao">
        <div class="cabeca">
          <h2>Dados do documento</h2>
          <span class="fonte">confira antes de emitir — vale o que estiver aqui</span>
        </div>
        <p class="fonte" style=${{ marginBottom: "14px" }}>
          A leitura preenche estes campos com o que a planilha traz. Corrigir aqui
          muda o relatório emitido, não o PCQS da loja. Peso, lote, sensorial e
          validade de cada caixa saem como a gerência registrou.
        </p>
        <${Formulario} key=${leitura + "-" + atual} c=${c}
          mudarCab=${mudarCab} mudarAjuste=${mudarAjuste} mudarExtra=${mudarExtra} />
        <p class="fonte" id="rodape-doc" style=${{ marginTop: "16px" }}>${
          "Custo real do quilo recebido: " + pcqsRs(a.tot.custoReal) + "  ·  " +
          "valor da nota " + pcqsRs(a.tot.valorNF) + "  ·  " +
          "valor do que entrou " + pcqsRs(a.tot.valorRecebido)}</p>
      </section>`}
    </div>
  </main>`;
}

montarTela("qualidade", Qualidade);
