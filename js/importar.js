// ============================================================================
// Importar OC — a terceira porta de entrada da fila de ordens.
//
// Duas fontes, o mesmo formato interno:
//   planilha .xlsx  — a solicitação da equipe, uma aba por fornecedor;
//   PDF da OC       — a ordem emitida pela planilha do gerente (leitura em
//                     js/importar-pdf.js).
//
// O que muda em relação ao Gerador de OCs: lá a importação ia direto para o
// PDF. Aqui ela desce para Ordens de Compras como ordem PENDENTE. Assim toda
// OC emitida, não importa por qual porta entrou, fica registrada em um lugar só
// — antes, o que era importado não deixava rastro no sistema depois do download.
//
// Gerar o lote direto continua possível (o botão do .zip), e nesse caminho as
// ordens são gravadas já como geradas, com o número que cada uma recebeu.
// ============================================================================
let ARQUIVO = null;
let LIDOS = [];          // [{ fornecedor, fornecedorPdf, cadastro, itens[], oc{} }]
let RECADO = "";
const ABERTOS = new Set();

// ------------------------------------------------------------------ início
async function iniciar() {
  estado("Carregando cadastro…");
  try {
    await carregarBase();
  } catch (e) {
    $("#recado").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  estado("");
  $("#unidade").innerHTML = BASE.unidades.map((u) =>
    `<option value="${esc(u.chave)}">${esc(u.chave)}</option>`).join("");
  $("#unidade").onchange = () => { mostrarProximo(); desenhar(); };
  mostrarProximo();

  const zona = $("#zona");
  $("#arquivo").onchange = (e) => escolher(e.target.files[0]);
  // Arrastar o arquivo é como a planilha chega na prática: baixada do e-mail e
  // solta na tela, sem passar pelo seletor.
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.add("sobre");
  }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.remove("sobre");
  }));
  zona.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) escolher(e.dataTransfer.files[0]);
  });
  $("#btn-ler").onclick = ler;
  $("#btn-cancelar").onclick = limpar;
}

async function mostrarProximo() {
  const n = await proximoNumeroOC($("#unidade").value);
  $("#dica-numero").textContent = n
    ? "Em branco = automático. Próxima OC desta unidade: " + n + "."
    : "Em branco = automático.";
}

const ehPDF = () => !!ARQUIVO && /\.pdf$/i.test(ARQUIVO.name);

function escolher(arq) {
  if (!arq) return;
  ARQUIVO = arq;
  $("#nome-arquivo").textContent = arq.name;
  $("#escolhido").hidden = false;
  $("#btn-ler").textContent = ehPDF() ? "Ler PDF" : "Ler planilha";
}

function limpar() {
  ARQUIVO = null; LIDOS = []; RECADO = ""; ABERTOS.clear();
  $("#arquivo").value = "";
  $("#escolhido").hidden = true;
  $("#recado").innerHTML = "";
  $("#resultado").innerHTML = "";
}

function ler() {
  if (!ARQUIVO) return;
  estado("Lendo…");
  if (ehPDF()) lerPDF(); else lerPlanilha();
}

// ============================================================================
// PLANILHA — uma aba por fornecedor, no modelo da solicitação da equipe
// ============================================================================
function lerPlanilha() {
  const leitor = new FileReader();
  leitor.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      LIDOS = lerAbas(wb);
      RECADO = "";
      if (!LIDOS.length) {
        estado("");
        aviso("Nenhuma aba com itens. Confira se é a planilha de solicitação de compras.", "mau");
        return;
      }
      enriquecer();
      estado("");
      desenhar();
      aviso(`Planilha lida: ${LIDOS.length} fornecedor(es).`, "bom");
    } catch (err) {
      estado("Falha na leitura", "erro");
      aviso("Não consegui ler a planilha: " + err.message, "mau");
    }
  };
  leitor.readAsBinaryString(ARQUIVO);
}

// Percorre as abas procurando o cabeçalho da tabela de itens ("Descrição" +
// "Quantidade"); o que vem antes dele é metadado do pedido.
function lerAbas(wb) {
  const fora = [];
  wb.SheetNames.forEach((aba) => {
    if (chave(aba) === "base") return;
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: "" });
    const meta = { orderDate: hojeBR(), deliveryDate: "", horario: "", obs: "",
                   pagamento: "", prazoPagamento: "" };
    const itens = [];
    let naTabela = false;

    // valor imediatamente à direita de um rótulo, na mesma linha
    const apos = (linha, termo) => {
      const i = linha.findIndex((c) => busca(c).includes(termo));
      if (i === -1) return "";
      for (let k = i + 1; k < linha.length; k++) {
        if (String(linha[k]).trim() !== "") return String(linha[k]).trim();
      }
      return "";
    };

    linhas.forEach((linha) => {
      const txt = busca(linha.join(" "));

      if (!naTabela && txt.includes("descricao") && txt.includes("quantidade")) {
        naTabela = true; return;
      }
      if (naTabela) {
        const nome = limpaNome(linha[1]);
        // Linhas de instrução do próprio modelo ("Colocar Nome e Sobrenome -
        // Ex.: ...") não são produto: entrariam na OC como item fantasma.
        const molde = /^colocar\b/i.test(nome) || /ex\.:/i.test(nome) || /^-+$/.test(nome);
        if (nome && !molde && !busca(nome).includes("observ") && !busca(nome).includes("total")) {
          itens.push({ nome, un: limpaNome(linha[2]), qtd: num(linha[3]), preco: 0 });
        }
        return;
      }

      if (txt.includes("data da oc") || (txt.includes("data") && txt.includes("oc"))) {
        const v = dataDoExcel(apos(linha, "data")); if (v) meta.orderDate = v;
      }
      if (txt.includes("previsao de entrega")) {
        const v = dataDoExcel(apos(linha, "entrega")); if (v) meta.deliveryDate = v;
      }
      if (txt.includes("horario de recebimento")) meta.horario = apos(linha, "recebimento");
      if (txt.includes("forma de pagamento")) meta.pagamento = apos(linha, "pagamento");
      if (txt.includes("prazo de pagamento") || (txt.includes("prazo") && !txt.includes("entrega"))) {
        const v = apos(linha, "prazo"); if (v) meta.prazoPagamento = v;
      }
      if (txt.includes("observa")) { const v = apos(linha, "observa"); if (v) meta.obs = v; }
    });

    if (itens.length) fora.push({ fornecedorPdf: aba, fornecedor: aba, itens, meta });
  });
  return fora;
}

// ============================================================================
// PDF da OC
// ============================================================================
function lerPDF() {
  const leitor = new FileReader();
  leitor.onload = async (e) => {
    let lido;
    try {
      lido = await readOcPdf(e.target.result);
    } catch (err) {
      estado("Falha na leitura", "erro");
      aviso("Não consegui ler este PDF. Confira se é a OC gerada pela planilha.", "mau");
      return;
    }
    const ocs = lido.ocs.filter((o) => o.items.length);
    if (!ocs.length) {
      estado("");
      aviso("Nenhum item encontrado no PDF — confira se o arquivo é a OC da planilha.", "mau");
      return;
    }

    const alertas = [];
    // A unidade compradora está no bloco do canto superior direito do PDF.
    const uni = casarUnidade(lido.loja);
    if (uni) $("#unidade").value = uni.chave;
    else if (lido.loja.nome || lido.loja.cnpj) {
      alertas.push(`a loja do PDF (${lido.loja.nome || lido.loja.cnpj}) não corresponde a ` +
                   "nenhuma unidade cadastrada — escolha a unidade acima");
    }

    LIDOS = ocs.map((oc) => ({
      fornecedorPdf: oc.pdfSupplierName,
      fornecedor: oc.pdfSupplierName,
      itens: oc.items.map((i) => ({ nome: i.product, un: i.unit, qtd: i.qty, preco: 0 })),
      meta: { orderDate: oc.orderDate || hojeBR(), deliveryDate: oc.deliveryDate,
              horario: oc.horarioReceb, obs: oc.obs, pagamento: oc.paymentForm,
              prazoPagamento: oc.prazoPagamento },
    }));
    enriquecer();
    LIDOS.forEach((l) => {
      if (!l.cadastro) alertas.push(`o fornecedor "${l.fornecedorPdf || "sem nome no PDF"}" ` +
        "não foi encontrado no cadastro");
    });

    const totItens = LIDOS.reduce((s, l) => s + l.itens.length, 0);
    const partes = [];
    if (uni) partes.push(`unidade <strong>${esc(uni.chave)}</strong>`);
    if (ocs[0].orderDatePdf) partes.push(`data da OC <strong>${esc(ocs[0].orderDatePdf)}</strong>` +
      ` + 1 dia = <strong>${esc(ocs[0].orderDate)}</strong>`);
    if (ocs[0].deliveryDate) partes.push(`entrega <strong>${esc(ocs[0].deliveryDate)}</strong>`);
    partes.push(`<strong>${totItens}</strong> ${totItens === 1 ? "item" : "itens"}`);
    RECADO = `<p class="nota-info">Lido do PDF: ${partes.join(" · ")}.</p>` +
      (alertas.length ? `<p class="nota-aviso">Confira: ${esc(alertas.join(" · "))}.</p>` : "");

    estado("");
    desenhar();
    aviso("PDF lido — confira os preços antes de enviar.", "bom");
  };
  leitor.readAsArrayBuffer(ARQUIVO);
}

// ============================================================================
// Completa o que vem do cadastro: apelido, preço do catálogo, prazos, obs fixa
// ============================================================================
function enriquecer() {
  LIDOS.forEach((l) => {
    const cad = casarFornecedor(l.fornecedorPdf);
    l.cadastro = cad ? cad.chave : null;
    if (cad) l.fornecedor = cad.chave;

    // O preço vem do catálogo do fornecedor. O nome no arquivo raramente vem
    // igual ao cadastrado, então o casamento é pela chave normalizada.
    const catalogo = cad ? produtosDoFornecedor(cad.chave) : [];
    l.itens.forEach((i) => {
      const p = catalogo.find((c) => chave(c.produto) === chave(i.nome));
      if (p) {
        if (!num(i.preco)) i.preco = num(p.preco);
        if (!limpaNome(i.un)) i.un = p.un;
        i.doCatalogo = true;
      } else { i.doCatalogo = false; }
    });

    l.oc = {
      dataEmissao: l.meta.orderDate || hojeBR(),
      dataEntrega: l.meta.deliveryDate || "",
      horario: l.meta.horario || "",
      pagamento: normalizarPagamento(l.meta.pagamento),
      parcelas: "1x",
      frete: "CIF",
      prazoFaturado: (cad && cad.prazoFat) || l.meta.prazoPagamento || "",
      prazoEntrega: (cad && cad.prazoEntrega) || "",
      transportadora: "",
    };
    l.obs = l.meta.obs || "";
  });
}

const PAGAMENTOS = ["Boleto", "Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Bonificação"];
const FRETES = ["CIF", "FOB", "-"];
const PARCELAS = Array.from({ length: 24 }, (_, i) => (i + 1) + "x");

// A forma de pagamento lida do arquivo precisa bater com uma das opções — senão
// a OC sai com um texto que a outra ponta não reconhece.
function normalizarPagamento(v) {
  const q = chave(v);
  if (!q) return "Boleto";
  return PAGAMENTOS.find((m) => chave(m) === q)
      || PAGAMENTOS.find((m) => q.includes(chave(m)) || chave(m).includes(q))
      || "Boleto";
}

// ============================================================================
// Tela de conferência
// ============================================================================
function desenhar() {
  $("#recado").innerHTML = RECADO;
  if (!LIDOS.length) { $("#resultado").innerHTML = ""; return; }

  LIDOS.forEach((l) => {
    l.pendencias = pendenciasDaOC(l.cadastro, l.itens);
    l.temPedido = l.itens.some((i) => num(i.qtd) > 0);
  });
  // Ordem: pronto para gerar, depois o que precisa de ajuste, depois o zerado.
  const peso = (l) => l.pendencias.length ? 1 : (l.temPedido ? 0 : 2);
  const ordem = LIDOS.map((_, i) => i).sort((a, b) =>
    peso(LIDOS[a]) - peso(LIDOS[b]) ||
    LIDOS[a].fornecedor.localeCompare(LIDOS[b].fornecedor, "pt-BR"));

  const prontos = LIDOS.filter((l) => l.temPedido && !l.pendencias.length).length;
  const travados = LIDOS.filter((l) => l.temPedido && l.pendencias.length).length;
  const vazios = LIDOS.filter((l) => !l.temPedido).length;
  const total = LIDOS.reduce((s, l) => s + l.itens.reduce((t, i) => t + num(i.qtd) * num(i.preco), 0), 0);

  $("#resultado").innerHTML = `
    <div class="placar">
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Prontas</span></div>
        <span class="ficha-n">${prontos}</span><span class="fonte">Com pedido e sem pendência</span></div>
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Precisam de ajuste</span></div>
        <span class="ficha-n ${travados ? "ficha-r" : ""}">${travados}</span>
        <span class="fonte">Falta preço ou cadastro</span></div>
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Sem pedido</span></div>
        <span class="ficha-n">${vazios}</span><span class="fonte">Nenhuma quantidade</span></div>
      <div class="ficha"><div class="ficha-topo"><span class="fonte">Valor total</span></div>
        <span class="ficha-n">R$ ${fmt(total)}</span></div>
    </div>

    <section class="barra">
      <span class="fonte">Conferido? Envie para a fila de ordens — o número da OC só é
        reservado quando cada ordem for gerada.</span>
      <span style="flex:1"></span>
      <button class="botao" id="btn-zip">Gerar todas agora (.zip)</button>
      <button class="botao primario" id="btn-enviar">Enviar para Ordens</button>
    </section>

    ${ordem.map((i) => cartaoImportado(LIDOS[i], i)).join("")}`;

  ordem.forEach((i) => ligarCartao(i));
  $("#btn-enviar").onclick = enviarParaOrdens;
  $("#btn-zip").onclick = gerarLoteZip;
}

function cartaoImportado(l, i) {
  const aberto = ABERTOS.has(i);
  const total = l.itens.reduce((s, x) => s + num(x.qtd) * num(x.preco), 0);
  const selo = l.pendencias.length
    ? `<span class="selo ruim" title="${esc(l.pendencias.join(" · "))}">precisa de ajuste</span>`
    : (l.temPedido ? '<span class="selo bom">Pronta</span>'
                   : '<span class="selo aviso">Sem pedido</span>');
  const opts = '<option value="">— sem cadastro —</option>' + BASE.fornecedores.map((f) =>
    `<option value="${esc(f.chave)}"${chave(f.chave) === chave(l.cadastro) ? " selected" : ""}>${esc(f.chave)} — ${esc(f.razao)}</option>`).join("");

  return `<section class="cartao ordem" data-i="${i}">
    <div class="cabeca ordem-cabeca" data-abrir="${i}">
      <div class="ordem-tit">
        <h2>${esc(l.fornecedor || "(sem nome)")}</h2>
        <span class="fonte">${esc(l.fornecedorPdf !== l.fornecedor ? "no arquivo: " + l.fornecedorPdf + " · " : "")}${l.itens.length} item(ns)</span>
      </div>
      <div class="ficha-vals ordem-total">
        <span class="ficha-n">${total > 0 ? "R$ " + fmt(total) : "—"}</span>
        <span class="fonte">${total > 0 ? "valor" : "sem preços"}</span>
      </div>
      ${selo}
      <span class="ordem-chev">${aberto ? "▾" : "▸"}</span>
    </div>
    ${aberto ? `<div class="ordem-corpo">
      ${l.pendencias.length ? `<p class="nota-aviso">Não dá para gerar esta OC ainda:
        falta ${esc(l.pendencias.join(" · "))}.</p>` : ""}

      <div class="barra barra-interna">
        <label class="campo campo-largo"><span>Fornecedor no cadastro</span>
          <select data-c="cadastro">${opts}</select></label>
        <label class="campo campo-largo"><span>Observação da ordem</span>
          <input data-c="obs" type="text" value="${esc(l.obs || "")}"></label>
      </div>

      <div class="rolagem"><table class="tabela-itens">
        <thead><tr><th>Item</th><th>Un.</th><th>Quantidade</th><th>Preço unit.</th>
          <th>Subtotal</th><th></th></tr></thead>
        <tbody>${l.itens.map((it, n) => `
          <tr data-n="${n}">
            <td><input data-k="nome" value="${esc(it.nome)}" style="width:100%">
              ${it.doCatalogo ? '<span class="selo-mini" title="Preço veio do catálogo deste fornecedor">catálogo</span>' : ""}</td>
            <td><input data-k="un" value="${esc(it.un || "")}" style="width:74px"></td>
            <td><input data-k="qtd" inputmode="decimal" value="${fmt(num(it.qtd), 3)}" style="width:90px"></td>
            <td><input data-k="preco" inputmode="decimal" value="${fmt(num(it.preco))}" style="width:96px"
                class="${num(it.qtd) > 0 && !num(it.preco) ? "campo-ruim" : ""}"></td>
            <td class="calc sub">${num(it.qtd) * num(it.preco) > 0 ? "R$ " + fmt(num(it.qtd) * num(it.preco)) : "—"}</td>
            <td><button class="botao-mini tira" title="Remover item">&#10005;</button></td>
          </tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="4" class="calc"><strong>Total</strong></td>
          <td class="calc total-cartao"><strong>${total > 0 ? "R$ " + fmt(total) : "—"}</strong></td>
          <td></td></tr></tfoot>
      </table></div>

      ${camposOC(l)}

      <div class="ordem-acoes">
        <span style="flex:1"></span>
        <button class="botao previa">Ver PDF</button>
      </div>
    </div>` : ""}
  </section>`;
}

function camposOC(l) {
  const d = l.oc;
  const opc = (lista, atual) => lista.map((v) =>
    `<option${v === atual ? " selected" : ""}>${esc(v)}</option>`).join("");
  return `<details class="bloco-oc">
    <summary>Dados da Ordem de Compra</summary>
    <div class="grade-oc">
      <label class="campo"><span>Data de emissão</span><input data-oc="dataEmissao" value="${esc(d.dataEmissao)}"></label>
      <label class="campo"><span>Previsão de entrega</span><input data-oc="dataEntrega" value="${esc(d.dataEntrega)}" placeholder="dd/mm/aaaa"></label>
      <label class="campo"><span>Horário de recebimento</span><input data-oc="horario" value="${esc(d.horario)}"></label>
      <label class="campo"><span>Forma de pagamento</span>
        <select data-oc="pagamento">${opc(PAGAMENTOS, d.pagamento)}</select></label>
      <label class="campo"><span>Nº de parcelas</span>
        <select data-oc="parcelas">${opc(PARCELAS, d.parcelas)}</select></label>
      <label class="campo"><span>Frete</span><select data-oc="frete">${opc(FRETES, d.frete)}</select></label>
      <label class="campo"><span>Prazo (faturado)</span><input data-oc="prazoFaturado" value="${esc(d.prazoFaturado)}"></label>
      <label class="campo"><span>Prazo de entrega</span><input data-oc="prazoEntrega" value="${esc(d.prazoEntrega)}"></label>
      <label class="campo"><span>Entrega na transportadora</span><input data-oc="transportadora" value="${esc(d.transportadora)}" placeholder="dd/mm/aaaa"></label>
    </div>
  </details>`;
}

function ligarCartao(i) {
  const cart = document.querySelector(`.ordem[data-i="${i}"]`);
  if (!cart) return;
  const l = LIDOS[i];
  cart.querySelector("[data-abrir]").onclick = () => {
    if (ABERTOS.has(i)) ABERTOS.delete(i); else ABERTOS.add(i);
    desenhar();
  };
  const corpo = cart.querySelector(".ordem-corpo");
  if (!corpo) return;

  // As edições vão direto para o objeto: o cartão é a fonte do que será criado,
  // e reler do DOM na hora de enviar perderia o que estivesse recolhido.
  corpo.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    const k = e.target.dataset.k;
    if (tr && k) {
      const it = l.itens[Number(tr.dataset.n)];
      it[k] = (k === "qtd" || k === "preco") ? num(e.target.value) : e.target.value;
      const s = num(it.qtd) * num(it.preco);
      tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
      const tot = l.itens.reduce((a, x) => a + num(x.qtd) * num(x.preco), 0);
      cart.querySelector(".total-cartao").innerHTML = "<strong>" + (tot > 0 ? "R$ " + fmt(tot) : "—") + "</strong>";
    }
    if (e.target.dataset.oc) l.oc[e.target.dataset.oc] = e.target.value;
    if (e.target.dataset.c === "obs") l.obs = e.target.value;
  });
  corpo.addEventListener("change", (e) => {
    if (e.target.dataset.oc) l.oc[e.target.dataset.oc] = e.target.value;
    if (e.target.dataset.c === "cadastro") {
      l.cadastro = e.target.value || null;
      if (l.cadastro) l.fornecedor = l.cadastro;
      // Trocar o cadastro troca o catálogo: os preços são recarregados.
      const cat = produtosDoFornecedor(l.cadastro);
      l.itens.forEach((it) => {
        const p = cat.find((c) => chave(c.produto) === chave(it.nome));
        it.doCatalogo = !!p;
        if (p && !num(it.preco)) it.preco = num(p.preco);
      });
      desenhar();
    }
  });
  corpo.querySelectorAll(".tira").forEach((b) => {
    b.onclick = () => {
      l.itens.splice(Number(b.closest("tr").dataset.n), 1);
      desenhar();
    };
  });
  corpo.querySelector(".previa").onclick = () => {
    const itens = l.itens.filter((it) => num(it.qtd) > 0);
    if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
    montarPDF(dadosDoPDF(l, "prévia"), true);
  };
}

function dadosDoPDF(l, numero) {
  const uni = unidadePorChave($("#unidade").value) || {};
  const forn = fornecedorPorChave(l.cadastro) || {};
  const obs = [obsDoFornecedor(l.cadastro), l.obs].filter(Boolean).join(" | ");
  return Object.assign({}, l.oc, {
    numero, unidade: uni, fornecedor: forn, fornecedorNome: l.fornecedor,
    obs, itens: l.itens.filter((i) => num(i.qtd) > 0),
  });
}

// ============================================================================
// Enviar para a fila / gerar o lote
// ============================================================================
function paraEnviar() {
  return LIDOS.filter((l) => l.itens.some((i) => num(i.qtd) > 0));
}

function corpoDaOrdem(l) {
  return {
    unidade_oc: $("#unidade").value,
    fornecedor: l.fornecedor, fornecedor_base: l.cadastro,
    data: hojeISO(), origem: "importada",
    obs: l.obs || "",
    oc: Object.assign({}, l.oc, { numero_manual: "" }),
    itens: l.itens.filter((i) => num(i.qtd) > 0)
      .map((i) => ({ nome: i.nome, un: i.un, qtd: num(i.qtd), preco: num(i.preco) })),
  };
}

async function enviarParaOrdens() {
  const lista = paraEnviar();
  if (!lista.length) { aviso("Nenhum fornecedor com quantidade preenchida.", "mau"); return; }
  const semCad = lista.filter((l) => !l.cadastro).length;
  if (semCad && !confirm(`${semCad} fornecedor(es) sem cadastro vinculado.\n` +
      "As ordens serão criadas, mas a OC só sai depois de vincular o cadastro. Continuar?")) return;

  estado("Criando ordens…");
  try {
    const r = await (await fetch("/api/ordens/lote", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordens: lista.map(corpoDaOrdem) }) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");
    estado("");
    if (r.recusadas.length) {
      aviso(`${r.criadas.length} ordem(ns) criada(s). Recusadas: ` +
        r.recusadas.map((x) => `${x.fornecedor} (${x.motivo})`).join(" · "), "mau");
    } else {
      aviso(`${r.criadas.length} ordem(ns) criada(s) em Ordens de Compras.`, "bom");
      setTimeout(() => { location.href = "ordens.html"; }, 1200);
    }
  } catch (e) {
    estado("Falha ao criar", "erro");
    aviso("Não consegui criar as ordens: " + e.message, "mau");
  }
}

// Gera o lote inteiro de uma vez. Reserva os números numa única ida ao servidor,
// com a quantidade exata — reservar um por um queimaria número de fornecedor que
// ficou de fora por pendência.
async function gerarLoteZip() {
  const lista = paraEnviar();
  if (!lista.length) { aviso("Nenhum fornecedor com quantidade preenchida.", "mau"); return; }
  const gerar = lista.filter((l) => !pendenciasDaOC(l.cadastro, l.itens).length);
  const travados = lista.length - gerar.length;
  if (!gerar.length) {
    aviso("Nenhuma ordem está pronta: resolva as pendências de preço e cadastro.", "mau");
    return;
  }
  if (!confirm(`Gerar ${gerar.length} OC(s) agora?` +
      (travados ? `\n${travados} ficam de fora por pendência e podem ser enviadas para Ordens.` : "") +
      "\nOs números serão reservados e as ordens ficam registradas como geradas.")) return;

  estado("Reservando números…");
  try {
    const unidade = $("#unidade").value;
    const numeros = await reservarNumerosOC(unidade,
      gerar.map((l) => ({ fornecedor: l.fornecedor, data: l.oc.dataEmissao })),
      $("#numero").value.trim());

    const zip = new JSZip();
    gerar.forEach((l, i) => {
      const doc = montarPDF(dadosDoPDF(l, numeros[i]), false);
      zip.file(nomeArquivoOC(numeros[i], unidade, l.fornecedor) + ".pdf", doc.output("blob"));
    });

    // Grava as ordens já como geradas: OC no mundo sem registro no sistema é
    // exatamente o que este merge veio resolver.
    estado("Registrando as ordens…");
    const r = await (await fetch("/api/ordens/lote", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordens: gerar.map((l, i) => Object.assign(corpoDaOrdem(l), {
        situacao_inicial: "gerada", numero_oc: numeros[i],
      })) }) })).json();
    if (!r.ok) throw new Error(r.erro || "erro ao registrar as ordens");

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OCs - ${unidade} - ${hojePonto()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    $("#numero").value = "";
    mostrarProximo();
    estado("");
    aviso(`${gerar.length} OC(s) geradas (nº ${numeros[0]} a ${numeros[numeros.length - 1]}) e registradas.`, "bom");
  } catch (e) {
    estado("Falha ao gerar", "erro");
    aviso("Não consegui gerar o lote: " + e.message, "mau");
  }
}

iniciar();
