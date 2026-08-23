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

const $ = (s) => document.querySelector(s);
const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const COR_CASA = { SL: "var(--casa-sl)", DC: "var(--casa-dc)",
                   DLU: "var(--casa-dlu)", DLCN: "var(--casa-dlcn)" };
const corCasa = (ck) => COR_CASA[ck] || "var(--tinta-3)";
const SELO = { entrada: "bom", transferencia: "info", desperdicio: "ruim", consumo: "neutro" };
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
  if ($("#f-insumo").value) q.set("insumo", $("#f-insumo").value);
  if ($("#f-tipo").value) q.set("tipo", $("#f-tipo").value);
  q.set("limite", "600");
  try {
    DADOS = await (await fetch("/api/movimentacoes?" + q.toString(), { cache: "no-store" })).json();
  } catch (e) {
    $("#tabela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    estado("");
    return;
  }
  estado("");
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
    $("#f-insumo").innerHTML = '<option value="">Todos</option>' +
      cfg.insumos.filter((i) => !i.derivado || i.chave === "salmao_equivalente")
        .map((i) => `<option value="${i.chave}">${esc(i.nome)}</option>`).join("");
    ["#f-casa", "#f-insumo"].forEach((s) => { $(s).onchange = carregar; });
  }
  if (!$("#f-tipo").options.length) {
    $("#f-tipo").innerHTML = '<option value="">Todos</option>' +
      Object.entries(DADOS.tipos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    $("#f-tipo").onchange = carregar;
  }
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
      <span class="ficha-pe">${(r[t] || {}).n || 0} lançamento(s) no período</span>
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
  $("#tabela").innerHTML = `<table>
    <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th>
      <th>Quantidade</th><th>Origem do dado</th></tr></thead>
    <tbody>${DADOS.movimentos.map((m) => `
      <tr>
        <td class="fonte">${brDate(m.data)}</td>
        <td><span class="ponto" style="background:${corCasa(m.casa)}"></span>${esc(m.casa_nome)}</td>
        <td>${esc(m.insumo)}</td>
        <td><span class="selo ${SELO[m.tipo] || "neutro"}">${esc(m.tipo_nome)}</span></td>
        <td class="calc">${fmt(m.qtd, 3)} <span class="un">${esc(m.un)}</span></td>
        <td class="fonte" title="${m.origem === "Planilha"
          ? "veio da planilha da casa, pela sincronização" : "digitado na tela de lançamento"}">${esc(m.origem)}</td>
      </tr>`).join("")}</tbody></table>`;
}

// ------------------------------------------------------------------ CSV
// Ponto e vírgula e vírgula decimal: é o que o Excel em português abre sem
// pedir assistente de importação.
function exportarCSV() {
  if (!DADOS || !DADOS.movimentos.length) return;
  const linhas = [["Data", "Casa", "Insumo", "Movimento", "Quantidade", "Unidade", "Origem"]]
    .concat(DADOS.movimentos.map((m) => [brDate(m.data), m.casa_nome, m.insumo,
      m.tipo_nome, fmt(m.qtd, 3), m.un, m.origem]));
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimentacoes_${DADOS.inicio}_a_${DADOS.fim}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ início
["#inicio", "#fim"].forEach((s) => { $(s).onchange = carregar; });
$("#mes-atual").onclick = () => {
  $("#inicio").value = primeiroDoMes();
  $("#fim").value = new Date().toISOString().slice(0, 10);
  carregar();
};
$("#btn-csv").onclick = exportarCSV;
carregar();
