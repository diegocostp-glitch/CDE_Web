// ============================================================================
// Sidebar fixa e tema, no padrao "Mboard": menu navy sempre visivel, item ativo
// em laranja com filete lateral, rodape com ajuda e alternador de tema.
// A chave sb_theme_v1 e a mesma do Gerador de OCs — quando os dois sistemas
// forem mesclados, a preferencia ja viaja junto.
// ============================================================================
const THEME_KEY = "sb_theme_v1";

function aplicarTema(t) {
  if (!document.body) return;          // o script vive no <head>
  document.body.className = t;
  localStorage.setItem(THEME_KEY, t);
  const nome = document.getElementById("theme-name");
  if (nome) nome.textContent = t === "light" ? "Modo claro" : "Modo escuro";
  // O icone mostra o tema EM USO, nao o que viria no clique: sol enquanto
  // estiver claro, lua enquanto estiver escuro.
  const ico = document.getElementById("theme-ico");
  if (ico) ico.innerHTML = t === "light" ? svg(ICO.sol) : svg(ICO.lua);
}
function alternarTema() {
  aplicarTema(document.body.classList.contains("light") ? "dark" : "light");
}

const ICO = {
  lancamento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  painel: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  compras: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  ordens: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  conversao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
  planilha: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  cadastros: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><line x1="12" y1="22" x2="12" y2="12"/>',
  overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  movimentacoes: '<path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/>',
  lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
const svg = (d) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';

function montarSidebar(atual, extras) {
  // Três seções: o que se faz todo dia, o que gera compra e a base que
  // sustenta as duas. Dentro de Compras, Ordens vem primeiro porque é o
  // módulo — Projeção e Importar são fontes que abastecem a fila dele.
  const secoes = [
    ["Início", [
      { id: "overview", rotulo: "Visão Geral", href: "overview.html" },
    ]],
    ["Operação", [
      { id: "lancamento", rotulo: "Lançamento Diário", href: "index.html" },
      { id: "painel", rotulo: "Painel de Consumo", href: "painel.html" },
      { id: "movimentacoes", rotulo: "Movimentações", href: "movimentacoes.html" },
    ]],
    ["Compras", [
      { id: "ordens", rotulo: "Ordens de Compras", href: "ordens.html" },
      { id: "compras", rotulo: "Projeção de Compras", href: "compras.html" },
      { id: "importar", rotulo: "Importar OC", href: "importar.html" },
      { id: "conversao", rotulo: "Conversão de Salmão", href: "conversao.html" },
    ]],
    ["Base", [
      { id: "cadastros", rotulo: "Cadastros", href: "cadastros.html" },
    ]],
  ];
  const item = (i) =>
    '<a class="sb-item' + (i.id === atual ? " active" : "") + '" href="' + i.href + '">' +
      '<span class="sb-ico">' + svg(ICO[i.id]) + "</span>" +
      '<span class="sb-txt">' + i.rotulo + "</span>" +
      (i.badge ? '<span class="sb-badge">' + i.badge + "</span>" : '<span class="sb-arr">→</span>') +
    "</a>";

  const alvo = document.querySelector(".app-layout") || document.body;
  alvo.insertAdjacentHTML("afterbegin",
    '<aside class="sidebar">' +
      '<div class="sb-logo">' +
        '<img class="sb-marca" src="logo_menu.png" alt="Sushi Boulevard">' +
        '<div class="sb-logo-txt">' +
          '<div class="sb-logo-title">Sushi Boulevard</div>' +
          '<div class="sb-logo-sub">Controle de estoque</div>' +
        "</div></div>" +
      '<nav class="sb-nav">' +
        secoes.map(([titulo, itens]) =>
          '<div class="sb-section">' + titulo + "</div>" + itens.map(item).join("")).join("") +
        (extras || "") +
      "</nav>" +
      '<div class="sb-rodape">' +
        '<a class="sb-item' + (atual === "ajuda" ? " active" : "") + '" href="ajuda.html">' +
          '<span class="sb-ico">' + svg(ICO.ajuda) + '</span><span class="sb-txt">Ajuda</span></a>' +
        '<div class="sb-tema" id="linha-tema" role="button" tabindex="0" title="Alternar tema">' +
          '<span class="sb-ico" id="theme-ico"></span>' +
          '<span id="theme-name">Modo claro</span>' +
          '<button class="theme-toggle" id="btn-tema" aria-label="Alternar tema"></button></div>' +
      "</div></aside>");

  // a linha inteira alterna: recolhida, o clique cai no icone; aberta, na chavinha
  const linha = document.getElementById("linha-tema");
  linha.onclick = alternarTema;
  linha.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarTema(); } };
  document.getElementById("btn-tema").onclick = (e) => { e.stopPropagation(); alternarTema(); };
  aplicarTema(localStorage.getItem(THEME_KEY) || "light");
  marcarPendentes();
}

// O selo de ordens pendentes aparece em todas as telas: quem está lançando
// precisa ver que sobrou compra para emitir sem ir procurar. Falha em silêncio
// se o servidor não responder — um menu sem selo é melhor que um erro na tela.
async function marcarPendentes() {
  try {
    const r = await (await fetch("/api/ordens?situacao=pendente")).json();
    const link = document.querySelector('.sb-item[href="ordens.html"]');
    if (!link || !r.pendentes) return;
    const seta = link.querySelector(".sb-arr");
    if (seta) seta.outerHTML = '<span class="sb-badge">' + r.pendentes + "</span>";
  } catch (e) { /* servidor fora do ar: segue sem selo */ }
}
