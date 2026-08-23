// ============================================================================
// Ordens de compra — o módulo completo de geração de OCs.
//
// Três portas de entrada, uma única fila:
//   avulsa    — montada aqui, pelo catálogo do fornecedor (o caminho principal);
//   projecao  — criada ao salvar o pedido na Projeção de Compras;
//   importada — lida de uma planilha ou do PDF da OC em Importar OC.
//
// A Projeção calcula quanto comprar dos 14 insumos que o CDE controla. Ela
// nunca soube de embalagem, gás, material de limpeza ou manutenção — e nem
// deveria, porque não existe contagem diária desses itens para projetar. Por
// isso ela é uma FONTE da fila, não a entrada dela: antes, sem pedido salvo na
// Projeção, não havia como emitir OC nenhuma.
//
// A origem de cada item fica gravada: item da projeção é recalculado se o
// pedido for salvo de novo; item incluído à mão sobrevive.
//
// Helpers ($, num, fmt, esc, aviso, estado, base de cadastros, numeração)
// vivem em js/comum.js — compartilhados com Cadastros e Importar OC.
// ============================================================================
let ORDENS = [], ABERTA = null;
const NOVA = { fornecedor: null, itens: [] };   // rascunho do painel de nova ordem

// ------------------------------------------------------------------ carregar
async function carregar() {
  estado("Carregando…");
  try {
    const sit = $("#filtro-situacao").value;
    const [r] = await Promise.all([
      fetch("/api/ordens" + (sit ? "?situacao=" + sit : "")).then((x) => x.json()),
      carregarBase(),
    ]);
    ORDENS = r.ordens || [];
  } catch (e) {
    $("#lista").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    estado(""); return;
  }
  estado("");
  if (BASE.erro) aviso("Cadastro indisponível: " + BASE.erro, "mau");
  montarFiltroUnidade();
  desenhar();
}

function montarFiltroUnidade() {
  const sel = $("#filtro-unidade");
  if (sel.options.length) return;
  sel.innerHTML = '<option value="">Todas</option>' + BASE.unidades.map((u) =>
    `<option value="${esc(u.chave)}">${esc(u.chave)}</option>`).join("");
  sel.onchange = desenhar;
}

function visiveis() {
  const uni = $("#filtro-unidade").value;
  const org = $("#filtro-origem").value;
  const q = busca($("#filtro-busca").value.trim());
  return ORDENS.filter((o) => {
    if (uni && chave(o.unidade_oc) !== chave(uni)) return false;
    if (org && (o.origem || "projecao") !== org) return false;
    if (q && !busca(o.fornecedor).includes(q) &&
        !o.itens.some((i) => busca(i.nome).includes(q))) return false;
    return true;
  });
}

// ------------------------------------------------------------------ lista
const SELO_ORIGEM = {
  avulsa: '<span class="selo neutro" title="Montada direto nesta tela">Avulsa</span>',
  projecao: '<span class="selo info" title="Veio do pedido salvo na Projeção de Compras">Projeção</span>',
  importada: '<span class="selo info" title="Lida de planilha ou do PDF da OC">Importada</span>',
};

function desenhar() {
  const lista = visiveis();
  const totItens = lista.reduce((s, o) => s + o.itens.length, 0);
  const valor = lista.reduce((s, o) => s + o.itens.reduce((t, i) => t + num(i.qtd) * num(i.preco), 0), 0);
  const semCad = lista.filter((o) => o.sem_cadastro).length;
  $("#resumo").textContent = lista.length
    ? `${lista.length} ordem(ns) · ${totItens} item(ns)` +
      (valor > 0 ? ` · R$ ${fmt(valor)}` : "") +
      (semCad ? ` · ${semCad} sem cadastro de fornecedor` : "")
    : "";

  if (!lista.length) {
    $("#lista").innerHTML = '<p class="vazio">Nenhuma ordem nesta situação.<br>' +
      'Use <strong>+ Nova ordem</strong> para montar uma agora, ou traga o pedido da ' +
      '<a href="compras.html">Projeção de Compras</a> ou de <a href="importar.html">Importar OC</a>.</p>';
    return;
  }
  $("#lista").innerHTML = lista.map(cartao).join("");
  lista.forEach((o) => ligar(o.id));
}

function cartao(o) {
  const aberta = ABERTA === o.id;
  const total = o.itens.reduce((s, i) => s + num(i.qtd) * num(i.preco), 0);
  const selo = o.situacao === "gerada"
    ? '<span class="selo bom">Gerada</span>'
    : '<span class="selo aviso">Pendente</span>';
  return `<section class="cartao ordem" data-id="${esc(o.id)}">
    <div class="cabeca ordem-cabeca" data-abrir="${esc(o.id)}">
      <div class="ordem-tit">
        <h2>${esc(o.fornecedor)}</h2>
        <span class="fonte">${esc(o.casa_nome)} · pedido de ${brDate(o.data)} · ${o.itens.length} item(ns)</span>
      </div>
      <div class="ficha-vals ordem-total">
        <span class="ficha-n">${total > 0 ? "R$ " + fmt(total) : "—"}</span>
        <span class="fonte">${total > 0 ? "valor estimado" : "sem preços"}</span>
      </div>
      ${SELO_ORIGEM[o.origem || "projecao"] || ""}
      ${selo}
      ${o.sem_cadastro ? '<span class="selo ruim" title="Este fornecedor não está vinculado a um cadastro">Sem cadastro</span>' : ""}
      <span class="ordem-chev">${aberta ? "▾" : "▸"}</span>
    </div>
    ${aberta ? corpo(o) : ""}
  </section>`;
}

function corpo(o) {
  const opts = '<option value="">— escolher cadastro —</option>' + BASE.fornecedores.map((f) =>
    `<option value="${esc(f.chave)}"${chave(f.chave) === chave(o.fornecedor_base) ? " selected" : ""}>${esc(f.chave)} — ${esc(f.razao)}</option>`).join("");
  const obsFixa = obsDoFornecedor(o.fornecedor_base);

  const linhas = o.itens.map((i, n) => `
    <tr data-n="${n}">
      <td>${i.origem === "projecao"
        ? `${esc(i.nome)} <span class="selo-mini" title="Veio do cálculo da Projeção — será recalculado se o pedido for salvo de novo">Projeção</span>`
        : `<input data-c="nome" type="text" value="${esc(i.nome)}" style="width:100%">`}</td>
      <td><input data-c="un" type="text" value="${esc(i.un)}" style="width:74px"></td>
      <td><input data-c="qtd" type="text" inputmode="decimal" value="${fmt(num(i.qtd), 3)}" style="width:90px"></td>
      <td><input data-c="preco" type="text" inputmode="decimal" value="${fmt(num(i.preco))}" style="width:96px"></td>
      <td class="calc sub"></td>
      <td><button class="botao-mini remover" title="Remover item">&#10005;</button></td>
    </tr>`).join("");

  return `<div class="ordem-corpo">
    <div class="barra barra-interna">
      <label class="campo"><span>Fornecedor no cadastro</span><select data-c="fornecedor_base">${opts}</select></label>
      <label class="campo campo-largo"><span>Observação da ordem</span>
        <input data-c="obs" type="text" value="${esc(o.obs || "")}" placeholder="prazo, condição de pagamento, instrução de entrega…"></label>
    </div>
    ${o.sem_cadastro ? `<p class="nota-aviso">O nome <strong>${esc(o.fornecedor)}</strong> não está vinculado a
      nenhum cadastro. Escolha acima para a ordem sair com CNPJ e endereço — sem isso a OC não pode ser gerada.</p>` : ""}
    ${obsFixa ? `<p class="nota-info"><strong>Observação fixa deste fornecedor:</strong> ${esc(obsFixa)}
      <span class="fonte"> — entra na OC automaticamente</span></p>` : ""}

    <div class="rolagem"><table class="tabela-itens">
      <thead><tr><th>Item</th><th>Un.</th><th>Quantidade</th><th>Preço unit.</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="4" class="calc"><strong>Total</strong></td>
        <td class="calc total-geral"></td><td></td></tr></tfoot>
    </table></div>

    <div class="add-item">
      <label class="campo campo-largo"><span>Incluir item deste fornecedor</span>
        <input type="text" class="busca-item" list="cat-${esc(o.id)}" placeholder="digite para buscar no catálogo, ou escreva um item novo">
        <datalist id="cat-${esc(o.id)}">${produtosDoFornecedor(o.fornecedor_base).map((p) =>
          `<option value="${esc(p.produto)}">${esc(p.un)} · R$ ${fmt(p.preco)}</option>`).join("")}</datalist>
      </label>
      <button class="botao add">Incluir</button>
      <span class="fonte">${produtosDoFornecedor(o.fornecedor_base).length} produto(s) no catálogo deste fornecedor</span>
    </div>

    ${camposOC(o)}

    <div class="ordem-acoes">
      <button class="botao excluir">Excluir ordem</button>
      <span style="flex:1"></span>
      <button class="botao salvar">Salvar alterações</button>
      ${o.situacao === "pendente"
        ? '<button class="botao previa">Ver PDF</button>' +
          '<button class="botao primario gerar">Gerar OC</button>'
        : '<button class="botao previa">Ver PDF</button>' +
          '<button class="botao reabrir">Reabrir</button>'}
    </div>
  </div>`;
}

// Formas de pagamento e frete: as mesmas opções do Gerador de OCs, para a OC
// não sair com uma condição que a outra ponta não reconhece.
const PAGAMENTOS = ["Boleto", "Cartão de Crédito", "Cartão de Débito", "Pix", "Dinheiro", "Bonificação"];
const FRETES = ["CIF", "FOB", "-"];
const PARCELAS = Array.from({ length: 24 }, (_, i) => (i + 1) + "x");

// Campos que só a Ordem de Compra usa. Ficam recolhidos porque, no dia a dia,
// os padrões (Boleto, 1x, CIF, prazos do cadastro) resolvem a maioria.
function camposOC(o) {
  const f = fornecedorPorChave(o.fornecedor_base) || {};
  const d = o.oc || {};
  const opc = (lista, atual) => lista.map((v) =>
    `<option${v === atual ? " selected" : ""}>${esc(v)}</option>`).join("");
  return `<details class="bloco-oc"${o.situacao === "gerada" ? "" : " open"}>
    <summary>Dados da Ordem de Compra${o.numero_oc
      ? ` <span class="selo bom">Nº ${esc(o.numero_oc)}</span>` : ""}</summary>
    <div class="grade-oc">
      <label class="campo"><span>Data de emissão</span>
        <input data-oc="dataEmissao" type="text" value="${esc(d.dataEmissao || hojeBR())}"></label>
      <label class="campo"><span>Previsão de entrega</span>
        <input data-oc="dataEntrega" type="text" placeholder="dd/mm/aaaa" value="${esc(d.dataEntrega || "")}"></label>
      <label class="campo"><span>Horário de recebimento</span>
        <input data-oc="horario" type="text" placeholder="Ex: 08h às 11h" value="${esc(d.horario || "")}"></label>
      <label class="campo"><span>Forma de pagamento</span>
        <select data-oc="pagamento">${opc(PAGAMENTOS, d.pagamento || "Boleto")}</select></label>
      <label class="campo"><span>Nº de parcelas</span>
        <select data-oc="parcelas">${opc(PARCELAS, d.parcelas || "1x")}</select></label>
      <label class="campo"><span>Frete</span>
        <select data-oc="frete">${opc(FRETES, d.frete || "CIF")}</select></label>
      <label class="campo"><span>Prazo (faturado)</span>
        <input data-oc="prazoFaturado" type="text" value="${esc(d.prazoFaturado ?? f.prazoFat ?? "")}"></label>
      <label class="campo"><span>Prazo de entrega</span>
        <input data-oc="prazoEntrega" type="text" value="${esc(d.prazoEntrega ?? f.prazoEntrega ?? "")}"></label>
      <label class="campo"><span>Entrega na transportadora</span>
        <input data-oc="transportadora" type="text" placeholder="dd/mm/aaaa" value="${esc(d.transportadora || "")}"></label>
      <label class="campo"><span>Nº da OC (vazio = automático)</span>
        <input data-oc="numero_manual" type="number" min="1" placeholder="automático"
               value="${esc(d.numero_manual || "")}"></label>
    </div>
  </details>`;
}

// ------------------------------------------------------------------ eventos
function ligar(id) {
  const cart = document.querySelector(`.ordem[data-id="${CSS.escape(id)}"]`);
  if (!cart) return;
  cart.querySelector("[data-abrir]").onclick = () => {
    ABERTA = ABERTA === id ? null : id; desenhar();
  };
  const corpoEl = cart.querySelector(".ordem-corpo");
  if (!corpoEl) return;

  const o = ORDENS.find((x) => x.id === id);
  corpoEl.addEventListener("input", (e) => {
    if (e.target.matches('[data-c="qtd"],[data-c="preco"]')) somar(cart);
  });
  corpoEl.querySelector('[data-c="fornecedor_base"]').onchange = (e) => {
    o.fornecedor_base = e.target.value || null;
    o.sem_cadastro = !o.fornecedor_base;
    desenhar();                      // o catálogo do datalist depende disso
  };
  corpoEl.querySelectorAll(".remover").forEach((b) => {
    b.onclick = () => { b.closest("tr").remove(); somar(cart); };
  });
  corpoEl.querySelector(".add").onclick = () => incluir(cart, o);
  corpoEl.querySelector(".busca-item").onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); incluir(cart, o); }
  };
  corpoEl.querySelector(".salvar").onclick = () => salvar(cart, o, {});
  corpoEl.querySelector(".previa").onclick = () => verPDF(cart, o);
  const gerar = corpoEl.querySelector(".gerar");
  if (gerar) gerar.onclick = () => gerarOC(cart, o);
  const reabrir = corpoEl.querySelector(".reabrir");
  if (reabrir) reabrir.onclick = () => salvar(cart, o, { situacao: "pendente" });
  corpoEl.querySelector(".excluir").onclick = () => excluir(o);
  somar(cart);
}

function incluir(cart, o) {
  const campo = cart.querySelector(".busca-item");
  const nome = limpaNome(campo.value);
  if (!nome) { campo.focus(); return; }
  const achado = produtosDoFornecedor(o.fornecedor_base)
    .find((p) => chave(p.produto) === chave(nome));
  const tbody = cart.querySelector(".tabela-itens tbody");
  const n = tbody.children.length;
  tbody.insertAdjacentHTML("beforeend", `
    <tr data-n="${n}">
      <td><input data-c="nome" type="text" value="${esc(achado ? achado.produto : nome)}" style="width:100%"></td>
      <td><input data-c="un" type="text" value="${esc(achado ? achado.un : "Un")}" style="width:74px"></td>
      <td><input data-c="qtd" type="text" inputmode="decimal" value="1,000" style="width:90px"></td>
      <td><input data-c="preco" type="text" inputmode="decimal" value="${fmt(achado ? achado.preco : 0)}" style="width:96px"></td>
      <td class="calc sub"></td>
      <td><button class="botao-mini remover" title="Remover item">&#10005;</button></td>
    </tr>`);
  const tr = tbody.lastElementChild;
  tr.querySelector(".remover").onclick = () => { tr.remove(); somar(cart); };
  campo.value = ""; campo.focus();
  somar(cart);
  if (!achado && o.fornecedor_base)
    aviso("Item fora do catálogo — confira o preço antes de gerar.", "");
}

function somar(cart) {
  let total = 0;
  cart.querySelectorAll(".tabela-itens tbody tr").forEach((tr) => {
    const q = num(tr.querySelector('[data-c="qtd"]').value);
    const p = num(tr.querySelector('[data-c="preco"]').value);
    const s = q * p;
    total += s;
    tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
  });
  const alvo = cart.querySelector(".total-geral");
  if (alvo) alvo.innerHTML = total > 0 ? "<strong>R$ " + fmt(total) + "</strong>" : "—";
}

function lerItens(cart, o) {
  return [...cart.querySelectorAll(".tabela-itens tbody tr")].map((tr, n) => {
    const campo = (c) => { const el = tr.querySelector(`[data-c="${c}"]`); return el ? el.value : ""; };
    const antigo = o.itens[Number(tr.dataset.n)];
    const daProjecao = antigo && antigo.origem === "projecao" && !tr.querySelector('[data-c="nome"]');
    return {
      chave: daProjecao ? antigo.chave : (antigo ? antigo.chave : "manual_" + n),
      nome: daProjecao ? antigo.nome : limpaNome(campo("nome")),
      un: campo("un"), qtd: num(campo("qtd")), preco: num(campo("preco")),
      origem: daProjecao ? "projecao" : "manual",
    };
  });
}

// ------------------------------------------------------------------ ordem de compra
function lerOC(cart) {
  const d = {};
  cart.querySelectorAll("[data-oc]").forEach((el) => { d[el.dataset.oc] = el.value.trim(); });
  return d;
}

// Monta o objeto que o PDF consome. A unidade vem do cadastro pela chave
// gravada na ordem; o fornecedor, do cadastro escolhido nela.
function dadosDoPDF(cart, o, numero) {
  const uni = unidadePorChave(o.unidade_oc) || {};
  const forn = fornecedorPorChave(o.fornecedor_base) || {};
  const d = lerOC(cart);
  // A observação fixa do fornecedor entra sempre; a da ordem vem depois dela.
  const obs = [obsDoFornecedor(o.fornecedor_base),
               cart.querySelector('[data-c="obs"]').value.trim()].filter(Boolean).join(" | ");
  return Object.assign({}, d, {
    numero: numero,
    unidade: uni,
    fornecedor: forn,
    fornecedorNome: o.fornecedor,
    obs: obs,
    itens: lerItens(cart, o),
  });
}

function verPDF(cart, o) {
  const itens = lerItens(cart, o).filter((i) => i.qtd > 0);
  if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }
  // prévia não reserva número: mostra o próximo só para conferência
  montarPDF(dadosDoPDF(cart, o, o.numero_oc || "prévia"), true);
}

async function gerarOC(cart, o) {
  const itens = lerItens(cart, o).filter((i) => i.qtd > 0);
  if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }

  // Mesma trava do Gerador de OCs: OC sem CNPJ válido é nota recusada na
  // portaria, e item sem preço é conferência impossível na entrega.
  const pend = pendenciasDaOC(cart.querySelector('[data-c="fornecedor_base"]').value, itens);
  if (pend.length) {
    aviso("Não é possível gerar a OC — falta: " + pend.join(" · ") + ".", "mau");
    return;
  }
  if (!o.unidade_oc) { aviso("Ordem sem unidade compradora definida.", "mau"); return; }

  const d = lerOC(cart);
  estado("Reservando número…");
  try {
    // O número vem do registro compartilhado com o Gerador: é o mesmo contador,
    // então a OC daqui não repete a numeração de lá.
    const numeros = await reservarNumerosOC(o.unidade_oc,
      [{ fornecedor: o.fornecedor, data: d.dataEmissao }], d.numero_manual);
    const numero = numeros[0];

    const doc = montarPDF(dadosDoPDF(cart, o, numero), false);
    doc.save(nomeArquivoOC(numero, o.unidade_oc, o.fornecedor) + ".pdf");

    await persistirPrazos(cart.querySelector('[data-c="fornecedor_base"]').value, d);
    await salvar(cart, o, { situacao: "gerada", numero_oc: numero });
    aviso("OC nº " + numero + " gerada e baixada.", "bom");
  } catch (e) {
    estado("Falha ao gerar", "erro");
    aviso("Não consegui gerar a OC: " + e.message, "mau");
  }
}

// Prazo digitado na OC volta para o cadastro do fornecedor — é dado dele, não
// desta ordem. Só grava quando mudou, para não reescrever a planilha à toa.
async function persistirPrazos(chaveForn, d) {
  const f = fornecedorPorChave(chaveForn);
  if (!f) return;
  let mudou = false;
  if (d.prazoFaturado !== undefined && (f.prazoFat || "") !== d.prazoFaturado) {
    f.prazoFat = d.prazoFaturado; mudou = true;
  }
  if (d.prazoEntrega !== undefined && (f.prazoEntrega || "") !== d.prazoEntrega) {
    f.prazoEntrega = d.prazoEntrega; mudou = true;
  }
  if (mudou) {
    try { await salvarBase(); } catch (e) { console.warn("prazo não gravado no cadastro:", e); }
  }
}

// ------------------------------------------------------------------ gravar
async function salvar(cart, o, extra) {
  const corpoReq = Object.assign({
    id: o.id, itens: lerItens(cart, o),
    fornecedor_base: cart.querySelector('[data-c="fornecedor_base"]').value || null,
    obs: cart.querySelector('[data-c="obs"]').value,
    oc: lerOC(cart),
  }, extra);

  estado("Salvando…");
  try {
    const r = await (await fetch("/api/ordem", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoReq) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");
    estado("Salvo", "ok");
    if (extra.situacao !== "gerada") aviso("Alterações salvas.", "bom");
    await carregar();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar: " + e.message, "mau");
  }
}

async function excluir(o) {
  const daProjecao = (o.origem || "projecao") === "projecao";
  if (!confirm(`Excluir a ordem de ${o.fornecedor} (${o.casa_nome}, ${brDate(o.data)})?\n` +
      (daProjecao
        ? "Os itens incluídos à mão serão perdidos. Salvar o pedido na Projeção recria a ordem só com os itens calculados."
        : "Esta ordem não vem da Projeção — não há como recriá-la automaticamente."))) return;
  try {
    const r = await (await fetch("/api/ordem", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, excluir: true }) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");
    ABERTA = null;
    aviso("Ordem excluída.", "bom");
    await carregar();
  } catch (e) { aviso("Não consegui excluir: " + e.message, "mau"); }
}

// ============================================================================
// NOVA ORDEM — o caminho que faltava. Fornecedor, catálogo dele, quantidades.
// Nasce como ordem pendente igual às outras: daí para frente o fluxo é o mesmo
// cartão, o mesmo PDF e a mesma numeração compartilhada.
// ============================================================================
function abrirNova(mostrar) {
  const p = $("#painel-nova");
  p.hidden = !mostrar;
  if (!mostrar) return;
  if (!$("#nova-unidade").options.length) {
    $("#nova-unidade").innerHTML = BASE.unidades.map((u) =>
      `<option value="${esc(u.chave)}">${esc(u.chave)}</option>`).join("");
    $("#nova-data").value = hojeISO();
    $("#slot-forn").innerHTML = comboBusca("nova-forn",
      BASE.fornecedores.map((f) => ({ valor: f.chave, rotulo: f.razao })), "",
      "digite as primeiras letras do fornecedor");
    $("#nova-forn").oninput = () => escolherFornecedor($("#nova-forn").value);
    $("#nova-unidade").onchange = mostrarProximoNumero;
  }
  mostrarProximoNumero();
  desenharCatalogo();
  p.scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("#nova-forn").focus();
}

async function mostrarProximoNumero() {
  const n = await proximoNumeroOC($("#nova-unidade").value);
  $("#nova-numero").placeholder = n ? "automático (próximo: " + n + ")" : "automático";
}

// Fornecedor digitado no combo. Aceita apelido ou razão social — quem digita
// "hortifruti" não precisa saber que o apelido cadastrado é outro.
function escolherFornecedor(texto) {
  const f = fornecedorPorChave(texto) || casarFornecedor(texto);
  NOVA.fornecedor = (limpaNome(texto) && f) ? f : null;
  NOVA.itens = [];
  desenharCatalogo();
}

// Quantidades e preços do catálogo moram no DOM porque são trezentas linhas e
// guardar tudo em memória a cada tecla não paga. Mas qualquer redesenho da tela
// (incluir item fora do catálogo, remover um) apagaria o que já foi digitado —
// por isso o valor de cada linha é fotografado antes e devolvido depois.
function fotoDoCatalogo() {
  const foto = {};
  $$(".tabela-catalogo tbody tr").forEach((tr) => {
    const q = tr.querySelector('[data-k="qtd"]').value;
    const p = tr.querySelector('[data-k="preco"]').value;
    const u = tr.querySelector('[data-k="un"]').value;
    if (num(q) > 0) foto[tr.querySelector(".nome-prod").textContent] = { q, p, u };
  });
  return foto;
}

function restaurarCatalogo(foto) {
  if (!foto) return;
  $$(".tabela-catalogo tbody tr").forEach((tr) => {
    const v = foto[tr.querySelector(".nome-prod").textContent];
    if (!v) return;
    tr.querySelector('[data-k="qtd"]').value = v.q;
    tr.querySelector('[data-k="preco"]').value = v.p;
    tr.querySelector('[data-k="un"]').value = v.u;
    tr.querySelector(".marca").checked = true;
  });
}

// `foto` vem preenchida quando o redesenho é só de layout (mesmo fornecedor).
// Trocar de fornecedor troca o catálogo inteiro: aí não há o que restaurar.
function desenharCatalogo(foto) {
  const alvo = $("#nova-catalogo");
  const f = NOVA.fornecedor;
  if (!f) {
    alvo.innerHTML = '<p class="vazio">Escolha um fornecedor do cadastro para ver o catálogo dele.<br>' +
      '<span class="fonte">Fornecedor novo? Cadastre em <a href="cadastros.html">Cadastros</a> — ' +
      'a OC precisa de CNPJ e razão social para valer.</span></p>';
    return;
  }
  const produtos = produtosDoFornecedor(f.chave);
  const obsFixa = obsDoFornecedor(f.chave);
  const pend = [];
  if (!limpaNome(f.razao)) pend.push("razão social");
  if (!cnpjValido(f.cnpj)) pend.push("CNPJ válido");

  alvo.innerHTML = `
    ${pend.length ? `<p class="nota-aviso">O cadastro de <strong>${esc(f.chave)}</strong> está incompleto:
      falta ${esc(pend.join(" e "))}. Dá para montar a ordem, mas a OC só sai depois de
      completar em <a href="cadastros.html">Cadastros</a>.</p>` : ""}
    ${obsFixa ? `<p class="nota-info"><strong>Observação fixa:</strong> ${esc(obsFixa)}</p>` : ""}

    <div class="barra barra-interna">
      <label class="campo campo-largo"><span>Buscar produto</span>
        <input type="text" id="nova-busca" placeholder="parte do nome do produto"></label>
      <span class="fonte" id="nova-contagem"></span>
      <span style="flex:1"></span>
      <button class="botao" id="nova-limpar">Limpar quantidades</button>
    </div>

    ${produtos.length ? `<div class="rolagem"><table class="tabela-itens tabela-catalogo">
      <thead><tr><th style="width:34px"></th><th>Produto</th><th>Un.</th>
        <th>Preço unit.</th><th>Quantidade</th><th>Subtotal</th></tr></thead>
      <tbody>${produtos.map((p, n) => `
        <tr data-p="${n}">
          <td><input type="checkbox" class="marca"></td>
          <td class="nome-prod">${esc(p.produto)}</td>
          <td><input data-k="un" type="text" value="${esc(p.un)}" style="width:110px"></td>
          <td><input data-k="preco" type="text" inputmode="decimal" value="${fmt(p.preco)}" style="width:96px"></td>
          <td><input data-k="qtd" type="text" inputmode="decimal" placeholder="0" style="width:90px"></td>
          <td class="calc sub">—</td>
        </tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5" class="calc"><strong>Total da ordem</strong></td>
        <td class="calc total-nova">—</td></tr></tfoot>
    </table></div>`
    : `<p class="vazio">${esc(f.chave)} ainda não tem produto no catálogo.<br>
        <span class="fonte">Cadastre os produtos em <a href="cadastros.html">Cadastros</a>,
        ou inclua os itens à mão abaixo.</span></p>`}

    ${NOVA.itens.length ? `<div class="rolagem"><table class="tabela-itens tabela-extras">
      <thead><tr><th>Item fora do catálogo</th><th>Un.</th><th>Quantidade</th>
        <th>Preço unit.</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${NOVA.itens.map((i, n) => `
        <tr><td>${esc(i.nome)}</td><td>${esc(i.un)}</td><td>${fmt(i.qtd, 3)}</td>
        <td>R$ ${fmt(i.preco)}</td><td class="calc">${i.qtd * i.preco > 0 ? "R$ " + fmt(i.qtd * i.preco) : "—"}</td>
        <td><button class="botao-mini tira-extra" data-n="${n}" title="Remover">&#10005;</button></td></tr>`).join("")}
      </tbody></table></div>` : ""}

    <div class="add-item">
      <label class="campo campo-largo"><span>Incluir item fora do catálogo</span>
        <input type="text" id="nova-extra" placeholder="nome do item"></label>
      <label class="campo"><span>Un.</span><input type="text" id="nova-extra-un" value="Un" style="width:80px"></label>
      <label class="campo"><span>Qtd.</span><input type="text" id="nova-extra-qtd" inputmode="decimal" value="1,000" style="width:90px"></label>
      <label class="campo"><span>Preço</span><input type="text" id="nova-extra-preco" inputmode="decimal" value="0,00" style="width:96px"></label>
      <button class="botao" id="nova-add">Incluir</button>
    </div>

    <div class="ordem-acoes">
      <span class="fonte" id="nova-status"></span>
      <span style="flex:1"></span>
      <button class="botao" id="nova-cancelar">Cancelar</button>
      <button class="botao primario" id="nova-criar">Criar ordem</button>
    </div>`;

  restaurarCatalogo(foto);
  ligarCatalogo();
}

function ligarCatalogo() {
  const tabela = $(".tabela-catalogo");
  if (tabela) {
    // Marcar a linha e digitar quantidade são o mesmo gesto: quem digita
    // quantidade quer o item, e quem marca vai querer quantidade 1.
    tabela.addEventListener("input", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
      if (e.target.matches('[data-k="qtd"]')) {
        tr.querySelector(".marca").checked = num(e.target.value) > 0;
      }
      somarNova();
    });
    tabela.addEventListener("change", (e) => {
      if (!e.target.matches(".marca")) return;
      const tr = e.target.closest("tr");
      const q = tr.querySelector('[data-k="qtd"]');
      if (e.target.checked && !num(q.value)) { q.value = "1,000"; q.focus(); q.select(); }
      if (!e.target.checked) q.value = "";
      somarNova();
    });
    $("#nova-busca").oninput = filtrarCatalogo;
    $("#nova-limpar").onclick = () => {
      $$('.tabela-catalogo [data-k="qtd"]').forEach((i) => { i.value = ""; });
      $$(".tabela-catalogo .marca").forEach((c) => { c.checked = false; });
      somarNova();
    };
    filtrarCatalogo();
  }
  $$(".tira-extra").forEach((b) => {
    b.onclick = () => {
      const foto = fotoDoCatalogo();
      NOVA.itens.splice(Number(b.dataset.n), 1);
      desenharCatalogo(foto);
    };
  });
  $("#nova-add").onclick = incluirExtra;
  $("#nova-extra").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); incluirExtra(); } };
  $("#nova-cancelar").onclick = () => { NOVA.fornecedor = null; NOVA.itens = []; abrirNova(false); };
  $("#nova-criar").onclick = criarOrdem;
  somarNova();
}

function filtrarCatalogo() {
  const q = busca($("#nova-busca").value.trim());
  let vis = 0;
  $$(".tabela-catalogo tbody tr").forEach((tr) => {
    const casa = !q || busca(tr.querySelector(".nome-prod").textContent).includes(q);
    // linha com quantidade nunca é escondida pelo filtro: esconder o que já foi
    // pedido é o caminho mais curto para emitir OC sem um item
    const pedida = num(tr.querySelector('[data-k="qtd"]').value) > 0;
    tr.hidden = !(casa || pedida);
    if (!tr.hidden) vis++;
  });
  const c = $("#nova-contagem");
  if (c) c.textContent = vis + " produto(s) à vista";
}

// Itens fora do catálogo ficam numa tabela à parte: são poucos e precisam ficar
// visíveis, senão somem no meio de trezentos produtos.
function incluirExtra() {
  const nome = limpaNome($("#nova-extra").value);
  if (!nome) { $("#nova-extra").focus(); return; }
  const foto = fotoDoCatalogo();
  NOVA.itens.push({ nome, un: $("#nova-extra-un").value.trim() || "Un",
                    qtd: num($("#nova-extra-qtd").value), preco: num($("#nova-extra-preco").value) });
  desenharCatalogo(foto);
  aviso("Item incluído fora do catálogo — confira o preço.", "");
}

function itensDaNova() {
  const fora = [];
  $$(".tabela-catalogo tbody tr").forEach((tr) => {
    const q = num(tr.querySelector('[data-k="qtd"]').value);
    if (q <= 0) return;
    fora.push({ nome: tr.querySelector(".nome-prod").textContent,
                un: tr.querySelector('[data-k="un"]').value,
                qtd: q, preco: num(tr.querySelector('[data-k="preco"]').value) });
  });
  return NOVA.itens.concat(fora);
}

function somarNova() {
  let total = 0;
  $$(".tabela-catalogo tbody tr").forEach((tr) => {
    const s = num(tr.querySelector('[data-k="qtd"]').value) * num(tr.querySelector('[data-k="preco"]').value);
    total += s;
    tr.querySelector(".sub").textContent = s > 0 ? "R$ " + fmt(s) : "—";
  });
  NOVA.itens.forEach((i) => { total += i.qtd * i.preco; });
  const alvo = $(".total-nova");
  if (alvo) alvo.innerHTML = total > 0 ? "<strong>R$ " + fmt(total) + "</strong>" : "—";
  const st = $("#nova-status");
  if (st) {
    const n = itensDaNova().length;
    st.textContent = n
      ? `${n} item(ns) · R$ ${fmt(total)}` + (NOVA.itens.length ? ` · ${NOVA.itens.length} fora do catálogo` : "")
      : "marque os itens ou preencha as quantidades";
  }
}

async function criarOrdem() {
  const f = NOVA.fornecedor;
  const itens = itensDaNova();
  if (!f) { aviso("Escolha o fornecedor.", "mau"); return; }
  if (!itens.length) { aviso("Nenhum item com quantidade preenchida.", "mau"); return; }

  estado("Criando ordem…");
  try {
    const r = await (await fetch("/api/ordem/nova", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unidade_oc: $("#nova-unidade").value,
        fornecedor: f.chave, fornecedor_base: f.chave,
        data: $("#nova-data").value || hojeISO(),
        origem: "avulsa",
        oc: { dataEmissao: hojeBR(), numero_manual: $("#nova-numero").value.trim(),
              prazoFaturado: f.prazoFat || "", prazoEntrega: f.prazoEntrega || "" },
        itens,
      }) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");

    NOVA.fornecedor = null; NOVA.itens = [];
    $("#nova-forn").value = ""; $("#nova-numero").value = "";
    abrirNova(false);
    // A ordem já abre: quem acabou de montar quer conferir os dados da OC e gerar.
    ABERTA = r.id;
    $("#filtro-situacao").value = "pendente";
    await carregar();
    aviso("Ordem criada. Confira os dados da OC e gere o PDF.", "bom");
    const cart = document.querySelector(`.ordem[data-id="${CSS.escape(r.id)}"]`);
    if (cart) cart.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    estado("Falha ao criar", "erro");
    aviso("Não consegui criar a ordem: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ início
// A Projeção manda "?f=Fornecedor" ao clicar em Editar OC. Se houver uma
// ordem pendente desse fornecedor, ela já abre — quem clicou lá quer editar
// esta ordem, não procurar de novo numa lista.
function abrirDoLink() {
  const p = new URLSearchParams(location.search);
  if (p.get("nova") !== null) { abrirNova(true); history.replaceState(null, "", "ordens.html"); return; }
  const alvo = p.get("f");
  if (!alvo) return;
  const achada = ORDENS.find((o) => chave(o.fornecedor) === chave(alvo));
  if (achada) ABERTA = achada.id;
  else aviso(`Nenhuma ordem pendente de ${alvo}. Salve o pedido na Projeção.`, "");
  history.replaceState(null, "", "ordens.html");   // não reabre no F5
}

(function iniciar() {
  $("#filtro-situacao").onchange = () => { ABERTA = null; carregar(); };
  $("#filtro-origem").onchange = desenhar;
  $("#filtro-busca").oninput = desenhar;
  $("#btn-nova").onclick = () => abrirNova($("#painel-nova").hidden);
  $("#fechar-nova").onclick = () => abrirNova(false);
  carregar().then(() => { abrirDoLink(); if (ABERTA) desenhar(); });
})();
