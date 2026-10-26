// ============================================================================
// Movimentações — o extrato do estoque.
//
// O lançamento diário guarda o dia inteiro num registro só, por casa. Aqui esse
// registro é aberto em uma linha por movimento, que é como a pergunta chega:
// "quando chegou camarão na Duque?", "quanto saiu daqui para o delivery?",
// "quanto se perdeu de anchova na semana passada?".
//
// O servidor faz o recorte (/api/movimentacoes) porque são oito meses de
// lançamento: filtrar no navegador significaria baixar o histórico inteiro a
// cada troca de filtro.
// ============================================================================
let DADOS = null;
// Filtro de insumo com mais de uma escolha: guarda as chaves MARCADAS; lista
// vazia e "todos", que e como a tela abre. INS_ENVIADO e o que o servidor ja
// recebeu — a consulta so e refeita quando a lista fecha com escolha diferente,
// senao marcar camarao G, M e P custaria tres buscas no historico inteiro.
let INS_SEL = [], INS_ENVIADO = "";
let CFG = null;          // casas e insumos de /api/config, para o quadro de notas

const $ = (s) => document.querySelector(s);
const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Mesma regra do js/app.js e do js/comum.js: só a vírgula distingue o ponto de
// milhar do ponto decimal. "69,86" -> 69.86 · "1.234,56" -> 1234.56
const num = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
function aviso(texto, tipo) {
  const el = $("#aviso");
  if (!el) return;
  el.textContent = texto;
  el.className = "aviso-flut " + (tipo || "");
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, 3400);
}

const COR_CASA = { SL: "var(--casa-sl)", DC: "var(--casa-dc)",
                   DLU: "var(--casa-dlu)", DLCN: "var(--casa-dlcn)" };
const corCasa = (ck) => COR_CASA[ck] || "var(--tinta-3)";
const SELO = { entrada: "bom", transferencia: "info", desperdicio: "ruim", consumo: "neutro" };
// Quem recebe cadastro de preço. Desperdício aparece no extrato mas não entra:
// o produto perdido foi pago na linha da chegada dele.
const TEM_PRECO = ["entrada", "transferencia"];
// ICO_MOV, e nao ICO: navegacao.js ja declara um ICO global com os icones do
// menu, e dois `const` de mesmo nome no escopo global derrubam a pagina inteira
// antes de qualquer linha rodar.
const ICO_MOV = {
  entrada: '<polyline points="19 12 12 19 5 12"/><line x1="12" y1="5" x2="12" y2="19"/>',
  transferencia: '<polyline points="5 12 12 5 19 12"/><line x1="12" y1="19" x2="12" y2="5"/>',
  desperdicio: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  consumo: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
};
const svgIco = (t) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  (ICO_MOV[t] || "") + "</svg>";

function estado(t, c) { const e = $("#estado"); e.textContent = t || ""; e.className = "estado " + (c || ""); }

function primeiroDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ carregar
async function carregar() {
  estado("Carregando…");
  const q = new URLSearchParams();
  if ($("#inicio").value) q.set("inicio", $("#inicio").value);
  if ($("#fim").value) q.set("fim", $("#fim").value);
  if ($("#f-casa").value) q.set("casa", $("#f-casa").value);
  if (INS_SEL.length) q.set("insumo", INS_SEL.join(","));
  if ($("#f-tipo").value) q.set("tipo", $("#f-tipo").value);
  if ($("#f-preco").value) q.set("sem_preco", "1");
  q.set("limite", "600");
  try {
    DADOS = await (await fetch("/api/movimentacoes?" + q.toString(), { cache: "no-store" })).json();
  } catch (e) {
    $("#tabela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    estado("");
    return;
  }
  estado("");
  INS_ENVIADO = INS_SEL.join(",");
  $("#inicio").value = DADOS.inicio;
  $("#fim").value = DADOS.fim;
  // esperado de proposito: as fichas do placar escrevem no filtro de tipo, e
  // escrever num <select> ainda sem opcoes nao guarda valor nenhum.
  await montarFiltros();
  desenhar();
}

// Casas e insumos vêm da configuração, não do resultado: uma lista que encolhe
// conforme o filtro esconde justamente a opção que a pessoa quer escolher.
async function montarFiltros() {
  if (!$("#f-casa").options.length) {
    const cfg = CFG = await (await fetch("/api/config")).json();
    montarNota();
    $("#f-casa").innerHTML = '<option value="">Todas</option>' +
      cfg.casas.map((c) => `<option value="${c.chave}">${esc(c.nome)}</option>`).join("");
    // Linha derivada fica fora: o equivalente 08/10 e a soma das libragens,
    // que ja estao na lista uma por uma (o servidor tambem nao o lista).
    montarMultiInsumo(cfg.insumos.filter((i) => !i.derivado));
    $("#f-casa").onchange = carregar;
  }
  if (!$("#f-tipo").options.length) {
    $("#f-tipo").innerHTML = '<option value="">Todos</option>' +
      Object.entries(DADOS.tipos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    $("#f-tipo").onchange = carregar;
  }
}

// ----------------------------------------------- filtro de vários insumos
// Um <select> comum respondia "qual insumo?" e a pergunta de quem confere é
// quase sempre um CONJUNTO: os três camarões, as quatro libragens de salmão, os
// dois lados de um processado. Antes isso era uma consulta por item e uma soma
// à mão — e o placar, que resume o período, nunca mostrava o grupo.
//
// A lista repete o agrupamento do lançamento diário (Salmão, Camarão, Peixe e
// frutos do mar, secos) porque é nessa ordem que a pessoa procura.
function montarMultiInsumo(insumos) {
  const grupos = [];
  insumos.forEach((i) => {
    let g = grupos.find((x) => x.nome === i.grupo);
    if (!g) { g = { nome: i.grupo, itens: [] }; grupos.push(g); }
    g.itens.push(i);
  });
  $("#f-insumo-lista").innerHTML = `
    <div class="multi-topo">
      <span class="multi-conta" id="f-insumo-conta"></span>
      <button type="button" class="multi-acao" id="f-insumo-limpar">Limpar</button>
    </div>` + grupos.map((g) => `
    <div class="multi-grupo">${esc(g.nome)}</div>` + g.itens.map((i) => `
    <label class="multi-item"><input type="checkbox" value="${esc(i.chave)}"
        data-nome="${esc(i.nome)}">
      <span>${esc(i.nome)} <span class="un">${esc(i.un)}</span></span></label>`).join("")).join("");

  $("#f-insumo-botao").onclick = () => abrirMulti(!aberta());
  $("#f-insumo-limpar").onclick = () => {
    $("#f-insumo-lista").querySelectorAll("input:checked").forEach((c) => { c.checked = false; });
    lerMultiInsumo();
  };
  $("#f-insumo-lista").addEventListener("change", lerMultiInsumo);
  // Clicar fora fecha: o painel cobre parte da barra, e deixá-lo aberto
  // esconderia justamente o filtro seguinte.
  document.addEventListener("click", (e) => {
    if (aberta() && !e.target.closest("#f-insumo")) abrirMulti(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aberta()) abrirMulti(false);
  });
  lerMultiInsumo();
}

const aberta = () => !$("#f-insumo-lista").hidden;

function abrirMulti(abrir) {
  $("#f-insumo-lista").hidden = !abrir;
  $("#f-insumo-botao").setAttribute("aria-expanded", abrir ? "true" : "false");
  if (!abrir) aplicarInsumos();
}

// Uma consulta por clique faria três buscas no histórico para marcar três
// camarões; esperar só o fechamento do painel deixaria a tela parada enquanto
// a pessoa marca. Então: meio segundo depois do último clique, ou na hora, se
// o painel fechar antes disso.
function aplicarInsumos() {
  clearTimeout(lerMultiInsumo._t);
  if (INS_SEL.join(",") !== INS_ENVIADO) carregar();
}

function lerMultiInsumo() {
  const marcados = Array.from($("#f-insumo-lista").querySelectorAll("input:checked"));
  INS_SEL = marcados.map((c) => c.value);
  const total = $("#f-insumo-lista").querySelectorAll("input").length;
  // Um insumo marcado mostra o nome dele no botao; varios viram a contagem,
  // porque tres nomes inteiros nao caberiam na barra de filtros.
  $("#f-insumo-rotulo").textContent = !INS_SEL.length ? "Todos"
    : INS_SEL.length === 1 ? marcados[0].dataset.nome : INS_SEL.length + " insumos";
  $("#f-insumo-conta").textContent = !INS_SEL.length
    ? "Todos os " + total + " insumos" : INS_SEL.length + " de " + total + " marcados";
  $("#f-insumo-limpar").disabled = !INS_SEL.length;
  clearTimeout(lerMultiInsumo._t);
  lerMultiInsumo._t = setTimeout(aplicarInsumos, 500);
}

// ------------------------------------------------------------------ desenhar
function desenhar() {
  desenharPlacar();
  desenharTabela();
}

function desenharPlacar() {
  const r = DADOS.resumo || {};
  $("#placar").innerHTML = Object.entries(DADOS.tipos).map(([t, nome]) => `
    <button class="ficha ${SELO[t] === "neutro" ? "" : SELO[t]}${$("#f-tipo").value === t ? " ativa" : ""}"
            data-t="${t}">
      <span class="ficha-topo">
        <span class="ficha-vals">
          <span class="ficha-n">${fmt((r[t] || {}).qtd, 1)}</span>
          <span class="ficha-r">${esc(nome)}</span>
        </span>
        <span class="ficha-ico">${svgIco(t)}</span>
      </span>
      <span class="ficha-meio">${TEM_PRECO.includes(t)
        ? ((r[t] || {}).valor ? "R$ " + fmt((r[t] || {}).valor) + " cadastrado"
                              : "sem preço cadastrado")
        : ((r[t] || {}).valor_perdido ? "R$ " + fmt((r[t] || {}).valor_perdido) + " perdido"
                                      : "sem custo para valorizar")}</span>
      <span class="ficha-pe">${(r[t] || {}).n || 0} lançamento(s) no período${
        (r[t] || {}).sem_preco ? ` · ${(r[t] || {}).sem_preco} sem preço` : ""}${
        (r[t] || {}).sem_custo ? ` · ${(r[t] || {}).sem_custo} sem custo` : ""}${
        (r[t] || {}).alerta ? ` · ${(r[t] || {}).alerta} abaixo do lançamento` : ""}</span>
    </button>`).join("");
  document.querySelectorAll("#placar .ficha").forEach((b) => {
    b.onclick = () => {
      $("#f-tipo").value = $("#f-tipo").value === b.dataset.t ? "" : b.dataset.t;
      carregar();
    };
  });
}

function desenharTabela() {
  $("#contagem").textContent = `${DADOS.total} movimento(s) no período`;
  $("#nota").textContent = DADOS.total > DADOS.movimentos.length
    ? `Mostrando os ${DADOS.movimentos.length} mais recentes de ${DADOS.total} — aperte o filtro para ver o resto`
    : `${brDate(DADOS.inicio)} a ${brDate(DADOS.fim)}`;

  if (!DADOS.movimentos.length) {
    $("#tabela").innerHTML = '<p class="vazio">Nenhum movimento com esses filtros.</p>';
    return;
  }
  // As colunas de kg só aparecem quando a lista tem entrada de salmão por
  // libragem: nos outros insumos elas seriam duas colunas sempre vazias.
  const temKg = DADOS.movimentos.some((m) => m.pesavel);
  $("#tabela").innerHTML = `<table class="tabela-extrato">
    <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th>
      <th>Fornecedor / destino</th><th>Nº NF</th>
      <th>Quantidade</th><th>Lançamento diário</th><th>Preço unit. (R$)</th><th>Valor total</th>
      ${temKg ? "<th>Quantidade Kg NF</th><th>Preço Unit. Kg</th>" : ""}
      <th>Origem do dado</th><th></th></tr></thead>
    <tbody>${DADOS.movimentos.map((m, i) => m.notas.length ? linhasDeNotas(m, i, temKg) : `
      <tr data-i="${i}" class="${m.precificavel && m.preco === null ? "sem-preco" : ""}${
           m.alerta ? " alerta-qtd" : ""}"${m.alerta ? ` title="${esc(tituloAlerta(m))}"` : ""}>
        <td class="fonte">${brDate(m.data)}</td>
        <td><span class="ponto" style="background:${corCasa(m.casa)}"></span>${esc(m.casa_nome)}</td>
        <td>${esc(m.insumo)}</td>
        <td><span class="selo ${SELO[m.tipo] || "neutro"}">${esc(m.tipo_nome)}</span></td>
        ${celulasInfo(m, m.parceiro, m.nf)}
        <td class="calc"><input class="qtd" type="text" inputmode="decimal" value="${fmtQ(m.qtd)}"
               title="Quantidade de Movimentações — corrigi-la não muda o lançamento diário.">
          <span class="un">${esc(m.un)}</span></td>
        <td class="calc lancamento" title="${esc(tituloLancamento(m))}">${
          m.qtd_lancamento ? fmtQ(m.qtd_lancamento) : "—"}</td>
        ${m.precificavel
          ? `<td class="calc unitario" title="${tituloUnitario(m.preco)}">${
               m.preco === null ? "—" : "R$ " + fmtPreco(m.preco)}</td>
             <td><input class="preco" type="text" inputmode="decimal"
               value="${m.valor_total === null ? "" : fmtCentavos(m.valor_total)}"
               placeholder="—" title="${TITULO_TOTAL}"></td>`
          : `<td class="calc nao-precifica"
               title="Desperdício não recebe preço: não se paga para jogar fora. O valor vem do último preço pago por este insumo até a data — da própria casa, ou da rede quando a casa ainda não o tinha comprado${
                 m.custo_un === null ? ". Aqui não há compra precificada dele em casa nenhuma antes desta data, então não há custo para aplicar." : "."}"
             >${m.custo_un === null ? "—" : "R$ " + fmt(m.custo_un)}</td>
             <td class="calc total perda">${m.valor_perdido === null ? "—" : "R$ " + fmt(m.valor_perdido)}</td>`}
        ${!temKg ? "" : !m.pesavel ? "<td></td><td></td>"
          : `<td class="calc"><input class="kg" type="text" inputmode="decimal" placeholder="—"
                    value="${m.kg ? fmtQ(m.kg) : ""}"
                    title="${m.tipo === "transferencia" ? "Kg enviados para a outra casa" : "Kg faturados na nota fiscal"}. Em branco apaga."> <span class="un">kg</span></td>
             <td class="calc preco-kg" title="Calculado: valor total ÷ kg da nota">${precoKgTexto(m)}</td>`}
        <td class="fonte origem" title="${TITULO_ORIGEM[m.origem] || ""}">${esc(m.origem)}</td>
        <td class="acoes">${m.precificavel ? `<button type="button" class="botao-mini abrir-nota"
              title="Abrir no quadro de notas fiscais (dividir em notas, fornecedor, NF, valores)">Editar</button>` : ""}${
          temDadoProprio(m) ? `<button type="button" class="botao-mini excluir" title="${esc(tituloExcluir(m))}">Excluir</button>` : ""}</td>
      </tr>`).join("")}</tbody></table>`;

  // (linhasDeNotas logo abaixo desenha os movimentos detalhados por nota)

  // Grava ao sair do campo (e no Enter). Salvar a cada tecla mandaria um POST
  // por dígito; salvar só num botão "Salvar tudo" faria perder o cadastro de
  // quem troca de filtro no meio — o valor é digitado linha a linha.
  // Com o foco, o campo perde o separador de milhar, para editar sem tropeçar
  // no ponto; depois do Tab ou Enter volta formatado.
  // Liga uma vez só: o #tabela sobrevive às recargas, e ligar a cada desenho
  // empilhava ouvintes — um Tab mandava o mesmo POST tantas vezes quantas a
  // lista tinha sido recarregada.
  if (desenharTabela.ligado) return;
  desenharTabela.ligado = true;
  $("#tabela").addEventListener("click", (e) => {
    const b = e.target.closest(".abrir-nota");
    if (b) abrirNota(linhaDo(b));
    const x = e.target.closest(".excluir");
    if (x) excluirLinha(x);
  });
  // fornecedor e NF: o select grava na troca, os campos de texto ao sair
  $("#tabela").addEventListener("change", (e) => {
    if (e.target.matches("select.info-parceiro")) gravarInfo(e.target);
  });
  $("#tabela").addEventListener("focusin", (e) => {
    if (!e.target.classList.contains("preco") || e.target.readOnly) return;
    const m = linhaDo(e.target);
    if (m) e.target.value = m.valor_total === null ? "" : fmtCheio(m.valor_total);
  });
  $("#tabela").addEventListener("focusout", (e) => {
    if (e.target.classList.contains("preco") && !e.target.readOnly) gravarTotal(e.target);
    if (e.target.classList.contains("qtd")) gravarQtd(e.target);
    if (e.target.classList.contains("kg")) gravarKg(e.target);
    if (e.target.matches("input.info-parceiro, input.info-nf")) gravarInfo(e.target);
  });
  $("#tabela").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.target.classList.contains("preco")
                              || e.target.classList.contains("qtd")
                              || e.target.classList.contains("kg")
                              || e.target.matches("input.info-parceiro, input.info-nf"))) e.target.blur();
  });
}

// ------------------------------------------------- uma linha por nota fiscal
// Movimento que chegou em mais de uma nota (5 pacotes de nori da Nippobraz e
// 210 da Damerlin, no mesmo dia) aparece no extrato como uma linha POR NOTA,
// com fornecedor, quantidade, preço e valor de cada uma — e não somado numa
// linha só. O lançamento diário é um número para o dia inteiro, então ocupa
// uma célula só para o grupo; o alerta (notas abaixo do lançamento) pinta o
// grupo todo. As linhas de nota não se editam aqui: o botão de notas abre o
// quadro, onde elas são corrigidas juntas.
function linhasDeNotas(m, i, temKg) {
  const k = m.notas.length;
  return m.notas.map((n, j) => `
      <tr data-i="${i}" data-nota="${j}" class="linha-nota${j === 0 ? " nota-primeira" : ""}${j === k - 1 ? " nota-ultima" : ""}${
           m.alerta ? " alerta-qtd" : ""}"${m.alerta ? ` title="${esc(tituloAlerta(m))}"` : ""}>
        <td class="fonte">${brDate(m.data)}</td>
        <td><span class="ponto" style="background:${corCasa(m.casa)}"></span>${esc(m.casa_nome)}</td>
        <td>${esc(m.insumo)}${j === 0 && k > 1 ? ` <span class="un">${k} notas</span>` : ""}</td>
        <td><span class="selo ${SELO[m.tipo] || "neutro"}">${esc(m.tipo_nome)}</span></td>
        ${celulasInfo(m, n.parceiro, n.nf, n)}
        <td class="calc" title="Quantidade desta nota — corrija pelo botão de notas">${fmtQ(n.qtd)}
          <span class="un">${esc(m.un)}</span></td>
        ${j === 0 ? `<td class="calc lancamento" rowspan="${k}" title="${esc(tituloLancamento(m))}">${
          m.qtd_lancamento ? fmtQ(m.qtd_lancamento) : "—"}${k > 1
            ? `<small class="nota-soma">notas: ${fmtQ(m.qtd)}</small>` : ""}</td>` : ""}
        <td class="calc">${n.qtd > 0 ? "R$ " + fmtPreco(n.total / n.qtd) : "—"}</td>
        <td class="calc">R$ ${fmt(n.total)}</td>
        ${!temKg ? "" : !m.pesavel ? "<td></td><td></td>"
          : `<td class="calc">${n.kg ? fmtQ(n.kg) + ' <span class="un">kg</span>' : "—"}</td>
             <td class="calc">${n.kg > 0 ? "R$ " + fmtPreco(n.total / n.kg) : "—"}</td>`}
        <td class="fonte origem" title="${TITULO_ORIGEM[n.origem === "transferencia" ? "Transferência" : "Nota fiscal"]}">${
          n.origem === "transferencia" ? "Transferência" : "Nota fiscal"}</td>
        <td class="acoes"><button type="button" class="botao-mini abrir-nota"
              title="${esc(resumoNotas(m))}">Editar</button><button type="button"
              class="botao-mini excluir" title="Excluir esta nota">Excluir</button></td>
      </tr>`).join("");
}

// ------------------------------------------------- fornecedor, NF e exclusão
// Os lançamentos antigos chegaram da planilha sem fornecedor e sem número de
// nota. As duas colunas se editam na própria linha: numa linha de nota mudam
// aquela nota; numa linha sem nota guardam só os dois dados, sem mexer em
// quantidade ou preço. Desperdício não tem fornecedor nem nota.
function celulasInfo(m, parceiro, nf, nota) {
  if (!m.precificavel) return "<td></td><td></td>";
  const campoParceiro = m.tipo === "transferencia" || (nota && nota.origem === "transferencia")
    ? `<select class="info-parceiro"><option value="">—</option>${
        (CFG ? CFG.casas : []).filter((c) => c.chave !== m.casa).map((c) =>
          `<option value="${esc(c.chave)}"${c.chave === parceiro ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>`
    : `<input class="info-parceiro" list="nf-fornecedores" value="${esc(parceiro)}" placeholder="—">`;
  return `<td>${campoParceiro}</td>
        <td><input class="info-nf" value="${esc(nf)}" placeholder="—"></td>`;
}

// Só há o que excluir quando Movimentações acrescentou algo ao lançamento
// diário (nota, correção, preço, kg, fornecedor/NF) ou quando o movimento só
// existe aqui. Linha que apenas espelha o lançamento diário se exclui lá.
const temDadoProprio = (m) => m.propria || m.preco !== null || !!m.kg || !!m.parceiro
  || !!m.nf || !m.qtd_lancamento;
const tituloExcluir = (m) => m.qtd_lancamento
  ? "Apagar o que foi informado em Movimentações (quantidade corrigida, valor, kg, fornecedor, NF). O lançamento diário continua."
  : "Excluir este movimento — ele só existe em Movimentações";

async function gravarInfo(campo) {
  const tr = campo.closest("tr");
  const m = linhaDo(campo);
  if (!m) return;
  const j = tr.dataset.nota === undefined ? null : Number(tr.dataset.nota);
  const parceiro = tr.querySelector(".info-parceiro").value.trim();
  const nf = tr.querySelector(".info-nf").value.trim();
  const antes = j === null ? m : m.notas[j];
  if ((antes.parceiro || "") === parceiro && (antes.nf || "") === nf) return;
  if (j !== null && !parceiro) {
    aviso("A nota precisa de " + (m.tipo === "transferencia" || m.notas[j].origem === "transferencia"
      ? "casa" : "fornecedor"), "mau");
    tr.querySelector(".info-parceiro").value = antes.parceiro || "";
    return;
  }
  estado("Salvando…");
  try {
    const r = await fetch("/api/movimento/info", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, nota: j, parceiro, nf }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    antes.parceiro = d.parceiro;
    antes.nf = d.nf;
    estado("Salvo", "ok");
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar: " + e.message, "mau");
    tr.querySelector(".info-parceiro").value = antes.parceiro || "";
    tr.querySelector(".info-nf").value = antes.nf || "";
  }
}

async function excluirLinha(botao) {
  const tr = botao.closest("tr");
  const m = linhaDo(botao);
  if (!m) return;
  const j = tr.dataset.nota === undefined ? null : Number(tr.dataset.nota);
  const oque = j !== null
    ? `${m.notas[j].origem === "transferencia" ? "a transferência de " + nomeCasaNF(m.notas[j].parceiro)
         : "a nota de " + (m.notas[j].parceiro || "fornecedor não informado")} (${fmtQ(m.notas[j].qtd)} ${m.un})`
    : m.qtd_lancamento ? `o que foi informado em Movimentações para ${m.insumo}`
    : `o movimento de ${m.insumo}`;
  if (!confirm(`Excluir ${oque} de ${brDate(m.data)} em ${m.casa_nome}?` +
               (j === null && m.qtd_lancamento ? "\n\nO lançamento diário continua." : ""))) return;
  estado("Excluindo…");
  try {
    const r = await fetch("/api/movimento/excluir", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, nota: j }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    estado("Excluído", "ok");
    aviso(j !== null ? "Nota excluída" : d.sobrou
      ? "Informações de Movimentações apagadas — o lançamento diário continua" : "Movimento excluído", "ok");
    carregar();
  } catch (e) {
    estado("Falha ao excluir", "erro");
    aviso("Não consegui excluir: " + e.message, "mau");
  }
}

// Digita-se o VALOR TOTAL da nota — é o número que vem impresso nela — e o
// preço unitário sai sozinho: total ÷ quantidade, dividido no servidor com a
// quantidade gravada. O cadastro guarda esse unitário com até dez casas, para
// quantidade × preço voltar ao centavo digitado. A coluna mostra até quatro
// casas, e o CSV também. Só grava se o número mudou.
const fmtPreco = (n) => (n === null || n === undefined || !isFinite(n)) ? ""
  : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Digitar segue livre ("1020", "1.020,50", "R$ 1020,5"); o total vai ao
// centavo, que é como a nota o traz.
const centavos = (n) => Math.round(n * 100) / 100;
const fmtCentavos = (n) => (n === null || n === undefined || !isFinite(n)) ? ""
  : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCheio = (n) => (n === null || n === undefined || !isFinite(n)) ? ""
  : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 10,
                                useGrouping: false });
const TITULO_TOTAL = "Valor total pago pela linha, como está na nota. "
  + "O preço unitário é calculado sozinho. Em branco apaga o cadastro.";
const tituloUnitario = (p) => "Calculado: valor total ÷ quantidade."
  + (p === null || p === undefined ? "" : " Valor gravado: R$ " + fmtCheio(p) + ".");
const linhaDo = (campo) => DADOS.movimentos[Number(campo.closest("tr").dataset.i)];

function mostrarUnitario(tr, preco) {
  const td = tr.querySelector(".unitario");
  td.textContent = preco === null ? "—" : "R$ " + fmtPreco(preco);
  td.title = tituloUnitario(preco);
}

async function gravarTotal(campo) {
  const tr = campo.closest("tr");
  const m = linhaDo(campo);
  if (!m) return;
  const bruto = campo.value.trim();
  const total = bruto === "" ? null : centavos(num(bruto));
  // Sair do campo sem mudar o número não grava nada: regravar o mesmo valor só
  // marcaria a linha como editada.
  if (total === m.valor_total || (total !== null && m.valor_total !== null
                                  && Math.abs(total - m.valor_total) < 0.005)) {
    campo.value = total === null ? "" : fmtCentavos(m.valor_total);
    return;
  }
  // Assenta o campo e o unitário na hora, sem esperar a resposta: quem digita
  // em sequência com o Tab já está duas linhas abaixo quando o POST volta
  // (o lancamentos.json tem 3 MB e mora no OneDrive, que às vezes segura o
  // arquivo). A resposta confirma os dois números.
  campo.value = total === null ? "" : fmtCentavos(total);
  mostrarUnitario(tr, total === null || !m.qtd ? null : total / m.qtd);
  campo.disabled = true;
  estado("Salvando valor…");
  try {
    const r = await fetch("/api/preco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, total }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    m.preco = d.preco;
    m.valor_total = d.valor_total;
    campo.value = d.valor_total === null ? "" : fmtCentavos(d.valor_total);
    mostrarUnitario(tr, d.preco);
    mostrarPrecoKg(tr, m);
    tr.classList.toggle("sem-preco", d.preco === null);
    estado("Valor salvo", "ok");
    atualizarPlacar();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar o valor: " + e.message, "mau");
    campo.value = m.valor_total === null ? "" : fmtCentavos(m.valor_total);
    mostrarUnitario(tr, m.preco);
  } finally {
    campo.disabled = false;
  }
}

// ---------------------------------------------------------------- kg da nota
// O salmão é contado em peças por faixa e faturado em kg. A entrada de cada
// libragem guarda os kg da nota (para o relatório mensal), e o preço por kg é
// calculado — valor total ÷ kg —, como o unitário: nunca desmente o total.
const precoKgTexto = (m) => m.kg > 0 && m.valor_total !== null
  ? "R$ " + fmtPreco(m.valor_total / m.kg) : "—";

function mostrarPrecoKg(tr, m) {
  const td = tr.querySelector(".preco-kg");
  if (td) td.textContent = precoKgTexto(m);
}

async function gravarKg(campo) {
  const tr = campo.closest("tr");
  const m = linhaDo(campo);
  if (!m) return;
  const bruto = campo.value.trim();
  const kg = bruto === "" ? null : Math.round(num(bruto) * 1000) / 1000;
  if (kg === (m.kg || null) || (kg !== null && m.kg && Math.abs(kg - m.kg) < 0.0005)) {
    campo.value = m.kg ? fmtQ(m.kg) : "";
    return;
  }
  if (kg !== null && kg <= 0) {
    aviso("Informe kg maior que zero — em branco apaga", "mau");
    campo.value = m.kg ? fmtQ(m.kg) : "";
    return;
  }
  campo.disabled = true;
  estado("Salvando kg…");
  try {
    const r = await fetch("/api/kg", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, kg }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    m.kg = d.kg;
    estado("Kg salvo", "ok");
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar os kg: " + e.message, "mau");
  } finally {
    campo.value = m.kg ? fmtQ(m.kg) : "";
    mostrarPrecoKg(tr, m);
    campo.disabled = false;
  }
}

// ------------------------------------------------------- correção de quantidade
// O lançamento que veio da planilha pode ser corrigido aqui: o número digitado
// SUBSTITUI o lançado (não soma, como o botão de ação). O valor total pago fica
// — é o da nota —, e o preço unitário se refaz sobre a quantidade nova. O
// registro passa a "Editado", e a sincronização deixa de voltá-lo ao número da
// planilha. Zero apaga o movimento.
const TITULO_ORIGEM = {
  Planilha: "Veio da planilha da casa, pela sincronização",
  Digitado: "Digitado na tela de lançamento",
  Editado: "Corrigido na tela de lançamento — a sincronização da planilha não muda mais este número",
  "Movimentações": "Quantidade informada em Movimentações (correção ou notas fiscais), independente do lançamento diário",
  "Nota fiscal": "Lançada no quadro de notas fiscais — independente do lançamento diário",
  "Transferência": "Parte da entrada que veio de outra casa — lançada no quadro de notas fiscais e transferências",
};
const tituloLancamento = (m) => m.qtd_lancamento
  ? `Lançamento diário (${m.origem_lancamento || "—"}) — não muda por Movimentações`
  : "Sem lançamento diário neste dia — o movimento existe só em Movimentações";
const tituloAlerta = (m) => `Movimentações tem ${fmtQ(m.qtd)} ${m.un}, menos que os ` +
  `${fmtQ(m.qtd_lancamento)} ${m.un} do lançamento diário — confira as notas ou a contagem`;

// Pinta a linha conforme a resposta do servidor, sem recarregar a lista.
function aplicarAlerta(tr, m) {
  tr.classList.toggle("alerta-qtd", !!m.alerta);
  tr.title = m.alerta ? tituloAlerta(m) : "";
}

async function gravarQtd(campo) {
  const tr = campo.closest("tr");
  const m = linhaDo(campo);
  if (!m) return;
  const bruto = campo.value.trim();
  const nova = bruto === "" ? m.qtd : Math.round(num(bruto) * 10000) / 10000;
  if (Math.abs(nova - m.qtd) <= 0.0005) { campo.value = fmtQ(m.qtd); return; }
  campo.disabled = true;
  estado("Salvando quantidade…");
  try {
    const r = await fetch("/api/movimento/editar", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, qtd: nova }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    estado("Quantidade salva", "ok");
    if (d.qtd <= 0.0005 && d.qtd_lancamento <= 0.0005) {
      // movimento que só existia em Movimentações: zero o apaga
      aviso(`${m.insumo} de ${brDate(m.data)} apagado`, "ok");
      carregar();
      return;
    }
    const r0 = (DADOS.resumo || {})[m.tipo];
    if (r0) {
      r0.qtd = Math.round((r0.qtd + d.qtd - m.qtd) * 1000) / 1000;
      r0.alerta = (r0.alerta || 0) + (d.alerta ? 1 : 0) - (m.alerta ? 1 : 0);
    }
    m.qtd = d.qtd;
    m.origem = d.origem;
    m.alerta = d.alerta;
    m.propria = d.propria;
    aplicarAlerta(tr, m);
    if (d.alerta) {
      aviso(`${m.insumo}: ${fmtQ(d.qtd)} em Movimentações, abaixo dos ${fmtQ(d.qtd_lancamento)} ` +
            `do lançamento diário`, "mau");
    }
    campo.value = fmtQ(m.qtd);
    tr.querySelector(".origem").textContent = m.origem;
    tr.querySelector(".origem").title = TITULO_ORIGEM[m.origem] || "";
    if (m.precificavel) {
      m.preco = d.preco;
      m.valor_total = d.valor_total;
      mostrarUnitario(tr, m.preco);
      mostrarPrecoKg(tr, m);
    } else {
      m.valor_perdido = m.custo_un === null ? null : Math.round(m.qtd * m.custo_un * 100) / 100;
      tr.querySelector(".total").textContent =
        m.valor_perdido === null ? "—" : "R$ " + fmt(m.valor_perdido);
    }
    desenharPlacar();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar a quantidade: " + e.message, "mau");
    campo.value = fmtQ(m.qtd);
  } finally {
    campo.disabled = false;
  }
}

// Recalcula o placar com o que está na tela, sem ir ao servidor de novo: o
// resumo do servidor cobre o período inteiro, e recarregar tudo a cada preço
// digitado jogaria o foco fora do campo seguinte.
function atualizarPlacar() {
  Object.keys(DADOS.tipos).filter((t) => TEM_PRECO.includes(t)).forEach((t) => {
    const linhas = DADOS.movimentos.filter((m) => m.tipo === t);
    const r = DADOS.resumo[t];
    if (!r || !linhas.length) return;
    const ficha = document.querySelector(`#placar .ficha[data-t="${t}"] .ficha-pe`);
    const sem = linhas.filter((m) => m.preco === null).length;
    if (ficha) {
      ficha.textContent = `${r.n} lançamento(s) no período` +
        (sem ? ` · ${sem} sem preço nesta lista` : " · todos com preço nesta lista");
    }
  });
}

// ------------------------------------------------- notas fiscais e transferências
// Um movimento do dia pode ter vindo em mais de uma nota: 215 pacotes de nori
// na Senador Lemos, 5 de um fornecedor e 210 de outro, cada um com seu preço.
// O quadro abre o movimento escolhido (data, casa, tipo, insumo), mostra o que
// já está lançado — normalmente vindo da planilha — e deixa detalhá-lo por
// nota. O preço da linha do extrato vira a média ponderada das notas.
//
// Se as notas somam diferente do lançado, a tela pede confirmação explícita
// para trocar a quantidade; se nada foi lançado ainda, a nota cria o movimento.
// Na transferência, o "parceiro" é a casa de destino.
let NOTA = null;   // { lancado, origem, preco, linhas: [{parceiro, nf, qtd, total}] }

// Quantidade sem zeros sobrando: "215 Pct", "12,5 Kg", "0,375 Kg".
const fmtQ = (n) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const resumoNotas = (m) => m.notas.map((n) =>
  `${n.parceiro}${n.nf ? " · NF " + n.nf : ""}: ${fmtQ(n.qtd)} ${m.un} por R$ ${fmt(n.total)}`).join("\n");
const insumoNF = () => (CFG ? CFG.insumos.find((i) => i.chave === $("#nf-insumo").value) : null) || {};
const nomeCasaNF = (ck) => ((CFG ? CFG.casas.find((c) => c.chave === ck) : null) || {}).nome || ck;
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function montarNota() {
  $("#nf-data").value = hojeISO();
  $("#nf-casa").innerHTML = CFG.casas.map((c) =>
    `<option value="${esc(c.chave)}">${esc(c.nome)}</option>`).join("");
  // Agrupado como no lançamento diário; a linha derivada (equivalente) não
  // recebe nota — chegada de salmão se lança na libragem que chegou.
  const grupos = [];
  CFG.insumos.filter((i) => !i.derivado).forEach((i) => {
    let g = grupos.find((x) => x.nome === i.grupo);
    if (!g) { g = { nome: i.grupo, itens: [] }; grupos.push(g); }
    g.itens.push(i);
  });
  $("#nf-insumo").innerHTML = grupos.map((g) => `<optgroup label="${esc(g.nome)}">` +
    g.itens.map((i) => `<option value="${esc(i.chave)}">${esc(i.nome)} (${esc(i.un)})</option>`).join("") +
    "</optgroup>").join("");
  ["#nf-data", "#nf-casa", "#nf-tipo", "#nf-insumo"].forEach((s) => { $(s).onchange = carregarNota; });
  $("#nf-mais").onclick = () => { lerLinhasNF(); NOTA.linhas.push(linhaVazia()); desenharNota(true); };
  $("#nf-limpar").onclick = () => { NOTA.linhas = [linhaVazia()]; desenharNota(true); };
  $("#nf-salvar").onclick = salvarNota;
  $("#nf-linhas").addEventListener("input", () => { lerLinhasNF(); atualizarSomaNF(); });
  $("#nf-linhas").addEventListener("change", (e) => {
    lerLinhasNF();
    if (e.target.matches('[data-k="origem"]')) {
      // a casa de origem e o fornecedor não se aproveitam um no outro
      const l = NOTA.linhas[Number(e.target.closest("tr").dataset.i)];
      if (l) l.parceiro = "";
      desenharNota();
      return;
    }
    atualizarSomaNF();
  });
  $("#nf-linhas").addEventListener("click", (e) => {
    const b = e.target.closest(".nf-tirar");
    if (!b) return;
    lerLinhasNF();
    NOTA.linhas.splice(Number(b.dataset.i), 1);
    if (!NOTA.linhas.length) NOTA.linhas.push(linhaVazia());
    desenharNota();
  });
  // Fornecedores do cadastro do Gerador de OCs, como sugestão: quem não está
  // lá ainda pode ser digitado à mão.
  fetch("/api/base").then((r) => r.json()).then((b) => {
    $("#nf-fornecedores").innerHTML = (b.fornecedores || []).map((f) =>
      `<option value="${esc(f.chave)}">${esc(f.razao || "")}</option>`).join("");
  }).catch(() => {});
  carregarNota();
}

const linhaVazia = () => ({ parceiro: "", nf: "", qtd: null, total: null });

// Abre no quadro o movimento de uma linha do extrato.
function abrirNota(m) {
  if (!m) return;
  $("#nf-data").value = m.data;
  $("#nf-casa").value = m.casa;
  $("#nf-tipo").value = m.tipo;
  $("#nf-insumo").value = m.insumo_chave;
  carregarNota();
  $("#area-nota").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function carregarNota() {
  const q = new URLSearchParams({ data: $("#nf-data").value, casa: $("#nf-casa").value,
                                  tipo: $("#nf-tipo").value, insumo: $("#nf-insumo").value });
  if (!q.get("data") || !q.get("insumo")) return;
  try {
    const d = await (await fetch("/api/nota?" + q.toString(), { cache: "no-store" })).json();
    if (d.erro) throw new Error(d.erro);
    NOTA = { lancado: d.qtd, qtd_mov: d.qtd_mov, propria: !!d.propria,
             origem: d.origem, preco: d.preco,
             valor_total: d.valor_total, pesavel: !!d.pesavel, kg: d.kg || null,
             info: d.info || {},
             linhas: d.notas.map((n) => ({ ...n })) };
  } catch (e) {
    $("#nota-situacao").textContent = "Não consegui ler o movimento: " + e.message;
    return;
  }
  // Movimento já lançado e ainda sem nota: a primeira linha nasce com a
  // quantidade inteira (e o valor, se havia preço) — no caso comum de uma
  // nota só, basta escrever o fornecedor.
  if (!NOTA.linhas.length) {
    NOTA.linhas.push(NOTA.lancado > 0
      ? { parceiro: NOTA.info.parceiro || "", nf: NOTA.info.nf || "",
          qtd: NOTA.qtd_mov || NOTA.lancado, total: NOTA.valor_total, kg: NOTA.kg }
      : linhaVazia());
  }
  desenharNota();
}

function desenharNota(focarUltima) {
  const ins = insumoNF();
  const tipo = $("#nf-tipo").value;
  const casa = $("#nf-casa").value;
  const un = esc(ins.un || "");
  $("#nota-situacao").textContent = NOTA.lancado > 0
    ? `Lançamento diário: ${fmtQ(NOTA.lancado)} ${ins.un || ""} (${NOTA.origem})` +
      (NOTA.propria ? ` · em Movimentações: ${fmtQ(NOTA.qtd_mov)}` : "") +
      (NOTA.preco === null ? " · sem preço" : ` · R$ ${fmt(NOTA.valor_total)}`)
    : "Sem lançamento diário neste dia — a nota cria o movimento só em Movimentações";

  // Entrada pode ser dividida entre notas fiscais (fornecedor) e
  // transferências recebidas de outra casa (casa de origem): cada linha diz
  // de onde veio, e o campo ao lado muda conforme.
  const ehEntrada = tipo === "entrada";
  const casaSel = (l, rotulo) => `<select data-k="parceiro"><option value="">${rotulo}</option>${
        CFG.casas.filter((c) => c.chave !== casa).map((c) =>
          `<option value="${esc(c.chave)}"${l.parceiro === c.chave ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>`;
  const parceiro = (l) => tipo === "transferencia" ? casaSel(l, "Casa de destino…")
    : l.origem === "transferencia" ? casaSel(l, "Casa de origem…")
    : `<input data-k="parceiro" list="nf-fornecedores" value="${esc(l.parceiro)}" placeholder="Fornecedor">`;
  const origemSel = (l) => `<td><select data-k="origem">
        <option value="nf"${l.origem !== "transferencia" ? " selected" : ""}>Nota fiscal</option>
        <option value="transferencia"${l.origem === "transferencia" ? " selected" : ""}>Transferência</option>
      </select></td>`;

  $("#nf-linhas").innerHTML = `<table class="tabela-notas">
    <thead><tr>${ehEntrada ? "<th>Origem</th>" : ""}
      <th>${tipo === "transferencia" ? "Casa de destino" : "Fornecedor / casa de origem"}</th>
      <th>Nº da nota</th><th>Quantidade (${un})</th><th>Valor total (R$)</th>
      <th>Preço unit.</th>${NOTA.pesavel ? `<th>Quantidade Kg${tipo === "transferencia" ? "" : " NF"}</th><th>Preço Unit. Kg</th>` : ""}
      <th></th></tr></thead>
    <tbody>${NOTA.linhas.map((l, i) => `
      <tr data-i="${i}">
        ${ehEntrada ? origemSel(l) : ""}
        <td>${parceiro(l)}</td>
        <td><input data-k="nf" value="${esc(l.nf)}" placeholder="opcional"></td>
        <td><input data-k="qtd" class="num" inputmode="decimal"
             value="${l.qtd === null ? "" : fmtQ(l.qtd)}"></td>
        <td><input data-k="total" class="num" inputmode="decimal"
             value="${l.total === null ? "" : fmtCentavos(l.total)}"></td>
        <td class="calc nf-unit"></td>
        ${NOTA.pesavel ? `<td><input data-k="kg" class="num" inputmode="decimal" placeholder="kg"
             value="${l.kg ? fmtQ(l.kg) : ""}"></td><td class="calc nf-unit-kg"></td>` : ""}
        <td><button type="button" class="botao-mini nf-tirar" data-i="${i}"
             title="Tirar esta nota">×</button></td>
      </tr>`).join("")}</tbody></table>`;
  atualizarSomaNF();
  if (focarUltima) {
    const campos = $("#nf-linhas").querySelectorAll("tbody tr:last-child [data-k]");
    if (campos[0]) campos[0].focus();
  }
}

function lerLinhasNF() {
  NOTA.linhas = Array.from($("#nf-linhas").querySelectorAll("tbody tr")).map((tr) => {
    const v = (k) => tr.querySelector(`[data-k="${k}"]`).value.trim();
    const kg = tr.querySelector('[data-k="kg"]') ? v("kg") : "";
    const origem = tr.querySelector('[data-k="origem"]') ? v("origem") : "nf";
    return { origem, parceiro: v("parceiro"), nf: v("nf"),
             qtd: v("qtd") === "" ? null : num(v("qtd")),
             total: v("total") === "" ? null : Math.round(num(v("total")) * 100) / 100,
             kg: kg === "" ? null : Math.round(num(kg) * 1000) / 1000 };
  });
}

function atualizarSomaNF() {
  const un = insumoNF().un || "";
  let sq = 0, st = 0, sk = 0;
  $("#nf-linhas").querySelectorAll("tbody tr").forEach((tr, i) => {
    const l = NOTA.linhas[i] || {};
    sq += l.qtd || 0;
    st += l.total || 0;
    sk += l.kg || 0;
    tr.querySelector(".nf-unit").textContent =
      l.qtd > 0 && l.total !== null ? "R$ " + fmtPreco(l.total / l.qtd) : "—";
    const tdKg = tr.querySelector(".nf-unit-kg");
    if (tdKg) tdKg.textContent = l.kg > 0 && l.total !== null ? "R$ " + fmtPreco(l.total / l.kg) : "—";
  });
  $("#nf-soma").textContent = `Soma: ${fmtQ(sq)} ${un} · R$ ${fmt(st)}` +
    (sq > 0 ? ` · preço médio R$ ${fmtPreco(st / sq)}` : "") +
    (NOTA.pesavel && sk > 0 ? ` · ${fmtQ(sk)} kg a R$ ${fmtPreco(st / sk)}/kg` : "");

  // As notas não mexem no lançamento diário. Somando menos que ele, a linha do
  // extrato fica vermelha — o aviso adianta isso antes de salvar.
  const menor = NOTA.lancado > 0 && sq > 0 && sq < NOTA.lancado - 0.0005;
  const maior = NOTA.lancado > 0 && sq > NOTA.lancado + 0.0005;
  $("#nf-ajuste").hidden = !(menor || maior);
  $("#nf-ajuste").classList.toggle("alerta", menor);
  if (menor) {
    $("#nf-ajuste").textContent = `As notas somam ${fmtQ(sq)} ${un}, menos que os ${fmtQ(NOTA.lancado)} ` +
      `do lançamento diário — a linha ficará em vermelho`;
  } else if (maior) {
    $("#nf-ajuste").textContent = `As notas somam ${fmtQ(sq)} ${un}, mais que os ${fmtQ(NOTA.lancado)} ` +
      `do lançamento diário — o lançamento não muda`;
  }
  $("#nf-salvar").disabled = false;
}

async function salvarNota() {
  lerLinhasNF();
  const corpo = { data: $("#nf-data").value, casa: $("#nf-casa").value,
                  tipo: $("#nf-tipo").value, insumo: $("#nf-insumo").value,
                  linhas: NOTA.linhas.map((l) => ({ ...l, qtd: l.qtd || 0, total: l.total || 0,
                                                     kg: l.kg || 0 })) };
  $("#nf-salvar").disabled = true;
  estado("Salvando notas…");
  try {
    const r = await fetch("/api/nota", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    estado("Notas salvas", "ok");
    aviso(d.notas.length
      ? `${d.notas.length} nota(s) de ${insumoNF().nome} em ${nomeCasaNF(corpo.casa)} salvas` +
        (d.alerta ? ` — abaixo dos ${fmtQ(d.qtd_lancamento)} do lançamento diário` : "")
      : "Notas apagadas", d.alerta ? "mau" : "ok");
    await carregarNota();
    carregar();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar as notas: " + e.message, "mau");
  } finally {
    atualizarSomaNF();
  }
}

// ------------------------------------------------------------------ CSV
// Ponto e vírgula e vírgula decimal: é o que o Excel em português abre sem
// pedir assistente de importação.
function exportarCSV() {
  if (!DADOS || !DADOS.movimentos.length) return;
  const nomeParceiro = (m, p, n) => !p ? "" : m.tipo === "transferencia" ? "→ " + nomeCasaNF(p)
    : n && n.origem === "transferencia" ? "← " + nomeCasaNF(p) : p;
  const linhas = [["Data", "Casa", "Insumo", "Movimento", "Fornecedor / destino", "Nº NF",
                   "Quantidade", "Lançamento diário", "Unidade",
                   "Preço unitário", "Valor total", "Quantidade Kg NF", "Preço Unit. Kg",
                   "Origem"]]
    .concat(DADOS.movimentos.flatMap((m) => m.notas.length ? m.notas.map((n) => [
      brDate(m.data), m.casa_nome, m.insumo, m.tipo_nome,
      nomeParceiro(m, n.parceiro, n), n.nf || "", fmt(n.qtd, 3), m.qtd_lancamento ? fmt(m.qtd_lancamento, 3) : "", m.un,
      n.qtd > 0 ? fmtPreco(n.total / n.qtd) : "", fmt(n.total),
      n.kg ? fmtQ(n.kg) : "", n.kg > 0 ? fmtPreco(n.total / n.kg) : "",
      n.origem === "transferencia" ? "Transferência" : "Nota fiscal"])
    : [[brDate(m.data), m.casa_nome, m.insumo, m.tipo_nome,
      nomeParceiro(m, m.parceiro), m.nf || "", fmt(m.qtd, 3), m.qtd_lancamento ? fmt(m.qtd_lancamento, 3) : "", m.un,
      m.preco === null ? "" : fmtPreco(m.preco),
      m.valor_total === null ? "" : fmt(m.valor_total),
      m.kg ? fmtQ(m.kg) : "",
      m.kg > 0 && m.valor_total !== null ? fmtPreco(m.valor_total / m.kg) : "",
      m.origem]]));
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimentacoes_${DADOS.inicio}_a_${DADOS.fim}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ início
// O filtro de preço tem opções fixas no HTML, então é ligado aqui — os outros
// selects ganham o onchange no bloco que monta as opções, que só roda uma vez.
["#inicio", "#fim", "#f-preco"].forEach((s) => { $(s).onchange = carregar; });
$("#mes-atual").onclick = () => {
  $("#inicio").value = primeiroDoMes();
  $("#fim").value = new Date().toISOString().slice(0, 10);
  carregar();
};
$("#btn-csv").onclick = exportarCSV;
carregar();
