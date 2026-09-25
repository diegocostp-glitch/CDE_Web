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
    const cfg = await (await fetch("/api/config")).json();
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
        (r[t] || {}).sem_custo ? ` · ${(r[t] || {}).sem_custo} sem custo` : ""}</span>
    </button>`).join("");
  document.querySelectorAll("#placar .ficha").forEach((b) => {
    b.onclick = () => {
      $("#f-tipo").value = $("#f-tipo").value === b.dataset.t ? "" : b.dataset.t;
      carregar();
    };
  });

  $("#contagem").textContent = `${DADOS.total} movimento(s) no período`;
  $("#nota").textContent = DADOS.total > DADOS.movimentos.length
    ? `Mostrando os ${DADOS.movimentos.length} mais recentes de ${DADOS.total} — aperte o filtro para ver o resto`
    : `${brDate(DADOS.inicio)} a ${brDate(DADOS.fim)}`;

  if (!DADOS.movimentos.length) {
    $("#tabela").innerHTML = '<p class="vazio">Nenhum movimento com esses filtros.</p>';
    return;
  }
  $("#tabela").innerHTML = `<table class="tabela-extrato">
    <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th>
      <th>Quantidade</th><th>Preço unit. (R$)</th><th>Valor total</th>
      <th>Origem do dado</th></tr></thead>
    <tbody>${DADOS.movimentos.map((m, i) => `
      <tr data-i="${i}"${m.precificavel && m.preco === null ? ' class="sem-preco"' : ""}>
        <td class="fonte">${brDate(m.data)}</td>
        <td><span class="ponto" style="background:${corCasa(m.casa)}"></span>${esc(m.casa_nome)}</td>
        <td>${esc(m.insumo)}</td>
        <td><span class="selo ${SELO[m.tipo] || "neutro"}">${esc(m.tipo_nome)}</span></td>
        <td class="calc">${fmt(m.qtd, 3)} <span class="un">${esc(m.un)}</span></td>
        ${m.precificavel
          ? `<td><input class="preco" type="text" inputmode="decimal"
               value="${m.preco === null ? "" : fmtPreco(m.preco)}"
               placeholder="—" title="Preço unitário pago. Em branco apaga o cadastro."></td>`
          : `<td class="calc nao-precifica"
               title="Desperdício não recebe preço: não se paga para jogar fora. O valor vem do último preço pago por este insumo até a data — da própria casa, ou da rede quando a casa ainda não o tinha comprado${
                 m.custo_un === null ? ". Aqui não há compra precificada dele em casa nenhuma antes desta data, então não há custo para aplicar." : "."}"
             >${m.custo_un === null ? "—" : "R$ " + fmt(m.custo_un)}</td>`}
        <td class="calc total${m.precificavel ? "" : " perda"}">${m.precificavel
          ? (m.valor_total === null ? "—" : "R$ " + fmt(m.valor_total))
          : (m.valor_perdido === null ? "—" : "R$ " + fmt(m.valor_perdido))}</td>
        <td class="fonte" title="${m.origem === "Planilha"
          ? "veio da planilha da casa, pela sincronização" : "digitado na tela de lançamento"}">${esc(m.origem)}</td>
      </tr>`).join("")}</tbody></table>`;

  // Grava ao sair do campo (e no Enter). Salvar a cada tecla mandaria um POST
  // por dígito; salvar só num botão "Salvar tudo" faria perder o cadastro de
  // quem troca de filtro no meio — o preço é digitado linha a linha.
  $("#tabela").addEventListener("change", (e) => {
    if (e.target.classList.contains("preco")) gravarPreco(e.target);
  });
  $("#tabela").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("preco")) e.target.blur();
  });
}

// O preço IMPORTADO sai de uma divisão (valor da nota ÷ quantidade) e costuma
// ter mais de duas casas. Arredondar para centavo na tela faria o total exibido
// discordar do total da nota, então mostra até quatro casas e só as que existem.
const fmtPreco = (n) => (n === null || n === undefined || !isFinite(n)) ? ""
  : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// O preço DIGITADO é dinheiro em real, e dinheiro em real acaba no centavo.
// Digitar segue livre (\"102\", \"102,5\", \"R$ 102,567\" — nada atrapalha a
// digitação); ao sair do campo com Enter ou Tab, o valor assenta em duas casas,
// e é esse valor arredondado que vai para o cadastro, para o total da linha nao
// ser calculado sobre um número diferente do que está à vista.
const centavos = (n) => Math.round(n * 100) / 100;
const fmtCentavos = (n) => (n === null || n === undefined || !isFinite(n)) ? ""
  : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function gravarPreco(campo) {
  const tr = campo.closest("tr");
  const m = DADOS.movimentos[Number(tr.dataset.i)];
  if (!m) return;
  const bruto = campo.value.trim();
  const valor = bruto === "" ? null : centavos(num(bruto));
  // Assenta o campo na hora, sem esperar a resposta: quem digita em sequência
  // com o Tab já está duas linhas abaixo quando o POST volta.
  campo.value = valor === null ? "" : fmtCentavos(valor);
  campo.disabled = true;
  estado("Salvando preço…");
  try {
    const r = await fetch("/api/preco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: m.data, casa: m.casa, insumo: m.insumo_chave,
                             tipo: m.tipo, preco: valor }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.erro || "erro no servidor");
    m.preco = d.preco;
    m.valor_total = d.valor_total;
    campo.value = d.preco === null ? "" : fmtCentavos(d.preco);
    tr.classList.toggle("sem-preco", d.preco === null);
    tr.querySelector(".total").textContent =
      d.valor_total === null ? "—" : "R$ " + fmt(d.valor_total);
    estado("Preço salvo", "ok");
    atualizarPlacar();
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar o preço: " + e.message, "mau");
    campo.value = m.preco === null ? "" : fmtPreco(m.preco);
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

// ------------------------------------------------------------------ CSV
// Ponto e vírgula e vírgula decimal: é o que o Excel em português abre sem
// pedir assistente de importação.
function exportarCSV() {
  if (!DADOS || !DADOS.movimentos.length) return;
  const linhas = [["Data", "Casa", "Insumo", "Movimento", "Quantidade", "Unidade",
                   "Preço unitário", "Valor total", "Origem"]]
    .concat(DADOS.movimentos.map((m) => [brDate(m.data), m.casa_nome, m.insumo,
      m.tipo_nome, fmt(m.qtd, 3), m.un,
      m.preco === null ? "" : fmtPreco(m.preco),
      m.valor_total === null ? "" : fmt(m.valor_total), m.origem]));
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
