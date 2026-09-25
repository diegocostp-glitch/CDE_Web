// ============================================================================
// Sidebar fixa e tema, no padrao "Mboard": menu navy sempre visivel, item ativo
// em laranja com filete lateral, rodape com ajuda e alternador de tema.
// A chave sb_theme_v1 e a mesma do Gerador de OCs — quando os dois sistemas
// forem mesclados, a preferencia ja viaja junto.
// ============================================================================
const THEME_KEY = "sb_theme_v1";

// Tres temas, nesta ordem no clique. O "mono" e o pedido da direcao: preto,
// cinza e branco, sem nenhuma outra cor em sistema e dashboard.
const TEMAS = ["light", "dark", "mono"];
const TEMA_NOME = { light: "Modo claro", dark: "Modo escuro", mono: "Modo mono" };
// Rotulo da linha: curto de proposito. Aberto, o menu deixa 176px para a linha
// do tema, e os tres botoes comem 85 — "Modo escuro" nao cabe nos 80 que
// restam e sairia cortado. O nome inteiro continua na dica de cada botao.
const TEMA_CURTO = { light: "Claro", dark: "Escuro", mono: "Mono" };
// preenchido depois de ICO, que e declarado mais abaixo
let ICO_TEMA = {};

function aplicarTema(t) {
  if (!TEMAS.includes(t)) t = "light";   // chave antiga ou lixo no localStorage
  if (!document.body) return;            // o script vive no <head>
  document.body.className = t;
  localStorage.setItem(THEME_KEY, t);
  const nome = document.getElementById("theme-name");
  if (nome) nome.textContent = TEMA_CURTO[t];
  // O icone mostra o tema EM USO, nao o que viria no clique: sol no claro, lua
  // no escuro, circulo meio cheio no mono.
  const ico = document.getElementById("theme-ico");
  if (ico) ico.innerHTML = svg(ICO_TEMA[t]);
  // marca o botao do tema atual no seletor de tres posicoes
  document.querySelectorAll("#tema-seg button[data-tema]").forEach((b) => {
    const atual = b.dataset.tema === t;
    b.classList.toggle("ativo", atual);
    b.setAttribute("aria-pressed", atual ? "true" : "false");
  });
}
function alternarTema() {
  const atual = TEMAS.findIndex((t) => document.body.classList.contains(t));
  aplicarTema(TEMAS[(atual + 1) % TEMAS.length]);
}

const ICO = {
  lancamento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  painel: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  compras: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  ordens: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  conversao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
  // escudo com visto: conformidade aprovada, o que a tela do PCQS decide
  qualidade: '<path d="M12 3l7 3v5c0 4.5-3 7.6-7 10-4-2.4-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  planilha: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  parametros: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  cadastros: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><line x1="12" y1="22" x2="12" y2="12"/>',
  overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  movimentacoes: '<path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/>',
  lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  // circulo meio preenchido: o simbolo classico de contraste, sem cor nenhuma
  mono: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  topo: '<line x1="12" y1="20" x2="12" y2="6"/><polyline points="5 13 12 6 19 13"/>',
};
ICO_TEMA = { light: ICO.sol, dark: ICO.lua, mono: ICO.mono };
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
      // Fecha o ciclo do salmão dentro de Compras: a ordem sai, o peixe chega e
      // o PCQS diz se chegou o que foi comprado — inclusive quanto o
      // fornecedor deve devolver quando não chegou.
      { id: "qualidade", rotulo: "Qualidade do Salmão", href: "qualidade.html" },
    ]],
    ["Base", [
      { id: "cadastros", rotulo: "Cadastros", href: "cadastros.html" },
      { id: "parametros", rotulo: "Parâmetros", href: "parametros.html" },
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
        '<img class="sb-marca" src="centurion_menu.png" alt="Centurion Beta">' +
        '<div class="sb-logo-txt">' +
          '<div class="sb-logo-title">Centurion Beta</div>' +
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
          '<div class="tema-seg" id="tema-seg" role="group" aria-label="Tema">' +
            TEMAS.map((t) =>
              '<button type="button" data-tema="' + t + '" title="' + TEMA_NOME[t] + '"' +
              ' aria-label="' + TEMA_NOME[t] + '">' + svg(ICO_TEMA[t]) + "</button>").join("") +
          "</div></div>" +
      "</div></aside>");

  // Dois jeitos de trocar, um para cada estado do menu:
  //   recolhido — so o icone aparece, e o clique na linha CICLA os temas;
  //   aberto    — os tres botoes aparecem e cada um vai direto no seu tema.
  // Antes o controle era uma chavinha de liga/desliga. Com tres temas ela
  // passou a mentir: no escuro e no mono a bolinha para no mesmo lugar, e nao
  // havia como ir direto de um para o outro.
  const linha = document.getElementById("linha-tema");
  linha.onclick = alternarTema;
  linha.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarTema(); } };
  document.getElementById("tema-seg").onclick = (e) => {
    const b = e.target.closest("button[data-tema]");
    if (!b) return;
    e.stopPropagation();          // senao a linha ciclaria por cima da escolha
    aplicarTema(b.dataset.tema);
  };
  aplicarTema(localStorage.getItem(THEME_KEY) || "light");
  marcarPendentes();
  ligarVoltarAoTopo();
}

// ------------------------------------------------------- voltar ao topo
// Toda tela do sistema rola: o extrato passa de 500 linhas, a Ajuda tem doze
// secoes, o Painel tem uma tabela por casa, o Lancamento tem vinte e um
// insumos por casa. E o que se procura depois de descer mora no ALTO — o
// filtro, as abas das casas, o botao de salvar. O caminho de volta era a roda
// do mouse; agora e um clique.
//
// Vive aqui porque montarSidebar roda em TODAS as telas: uma copia do botao em
// cada pagina sairia da mesma tecla e envelheceria em onze lugares.
//
// Nasce escondido e aparece depois de uma tela de rolagem: parado no canto de
// uma tela curta, seria so ruido em cima do botao de acoes.
function ligarVoltarAoTopo() {
  if (document.getElementById("voltar-topo")) return;
  document.body.insertAdjacentHTML("beforeend",
    '<button type="button" id="voltar-topo" class="topo-botao" title="Voltar ao topo" ' +
    'aria-label="Voltar ao topo">' + svg(ICO.topo) + "</button>");
  const btn = document.getElementById("voltar-topo");
  btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const mostrar = () => btn.classList.toggle("visivel", window.scrollY > 260);
  document.addEventListener("scroll", mostrar, { passive: true });
  mostrar();
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
