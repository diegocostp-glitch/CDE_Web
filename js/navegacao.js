// ============================================================================
// Sidebar fixa e tema, no padrao "Mboard": menu navy sempre visivel, item ativo
// em laranja com filete lateral, rodape com ajuda e alternador de tema.
// A chave sb_theme_v1 e a mesma do Gerador de OCs — quando os dois sistemas
// forem mesclados, a preferencia ja viaja junto.
// ============================================================================
const THEME_KEY = "sb_theme_v1";

// ------------------------------------------------------- sessao
// O servidor confere login e permissao em toda chamada (acesso.py). Aqui so
// traduzimos a resposta: 401 = a sessao acabou, volta ao login; 403 = sem
// permissao para aquilo, e a pessoa precisa saber por que nao salvou.
(function () {
  if (window.__cdeFetch) return;
  const original = window.fetch.bind(window);
  window.__cdeFetch = original;
  window.fetch = async (...args) => {
    const r = await original(...args);
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    if (url.startsWith("/api/") && !url.startsWith("/api/login")) {
      if (r.status === 401) {
        location.href = "/login.html?volta=" + encodeURIComponent(location.pathname + location.search);
      } else if (r.status === 403 && /post/i.test((args[1] && args[1].method) || "")) {
        // so gravacao recusada vira aviso: leitura negada (o selo de ordens no
        // menu, por exemplo) falha quieta, como quando o servidor esta fora
        r.clone().json().then((j) => avisoAcesso(j.erro || "sem permissão")).catch(() => {});
      }
    }
    return r;
  };
})();

function avisoAcesso(msg) {
  let el = document.getElementById("aviso-acesso");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-acesso";
    el.className = "aviso-acesso";
    document.body.appendChild(el);
  }
  el.textContent = "Não foi possível: " + msg + ".";
  el.classList.add("visivel");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("visivel"), 5000);
}

// Quem esta logado e o que pode. Outras telas (acoes.js) esperam esta promessa.
window.CDE_EU = fetch("/api/eu").then((r) => (r.ok ? r.json() : { login: false }))
  .catch(() => ({ login: false }));

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
  // caminhao: o que esta chegando
  recebimento: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  conversao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
  // escudo com visto: conformidade aprovada, o que a tela do PCQS decide
  qualidade: '<path d="M12 3l7 3v5c0 4.5-3 7.6-7 10-4-2.4-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  // prancheta com visto: a conferencia contada todo dia
  contagem_diaria: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  // calendario com visto: a conferencia da semana
  contagem_semanal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/>',
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
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  inicio: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  // camadas: o que esta guardado na casa
  estoque: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  utilitarios: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  senha: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
ICO_TEMA = { light: ICO.sol, dark: ICO.lua, mono: ICO.mono };
const svg = (d) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';

// Grupos do menu, na ordem do trabalho: o que se olha primeiro, o estoque do
// dia, o ciclo de compra, as ferramentas do salmao. Configuracoes fica sozinha
// no fim. Importar OC nao tem item proprio: abre de dentro de Ordens de Compras.
const MENU_FIXO_KEY = "cde_menu_fixo";
const GRUPOS_MENU = [
  { id: "inicio", titulo: "Início", ico: "inicio", itens: [
    { id: "overview", rotulo: "Visão Geral", href: "overview.html" },
    { id: "painel", rotulo: "Painel de Consumo", href: "painel.html" },
  ]},
  { id: "estoque", titulo: "Estoque", ico: "estoque", itens: [
    { id: "lancamento", rotulo: "Lançamento Diário", href: "index.html" },
    { id: "contagem_diaria", rotulo: "Contagem diária", href: "contagem-diaria.html" },
    { id: "contagem_semanal", rotulo: "Contagem semanal", href: "contagem-semanal.html" },
    { id: "movimentacoes", rotulo: "Movimentações", href: "movimentacoes.html" },
  ]},
  { id: "compras", titulo: "Compras", ico: "compras", itens: [
    { id: "compras", rotulo: "Projeção de Compras", href: "compras.html" },
    // Importar OC mora dentro desta tela: o item fica aceso quando ela esta aberta
    { id: "ordens", rotulo: "Ordens de Compras", href: "ordens.html", tambem: ["importar"] },
    { id: "recebimento", rotulo: "Recebimento de Salmão", href: "recebimento.html" },
    { id: "cadastros", rotulo: "Cadastros", href: "cadastros.html" },
  ]},
  { id: "utilitarios", titulo: "Utilitários", ico: "utilitarios", itens: [
    { id: "conversao", rotulo: "Conversão de Salmão", href: "conversao.html" },
    { id: "qualidade", rotulo: "Avaliação de Qualidade", href: "qualidade.html" },
  ]},
];

// Grupos fixados com o clique. Valem ate a pessoa sair: Sair e o login limpam.
function gruposFixos() {
  try { return JSON.parse(localStorage.getItem(MENU_FIXO_KEY)) || []; } catch (e) { return []; }
}
function guardarFixos(lista) {
  try { localStorage.setItem(MENU_FIXO_KEY, JSON.stringify(lista)); } catch (e) { /* sem storage */ }
}

function montarSidebar(atual, extras) {
  // "importar" acende Ordens; "senha" e "usuarios" acendem Configuracoes
  const ativo = (i) => i.id === atual || (i.tambem || []).includes(atual);
  const item = (i) =>
    '<a class="sb-item' + (ativo(i) ? " active" : "") + '" href="' + i.href + '">' +
      '<span class="sb-ico">' + svg(ICO[i.id]) + "</span>" +
      '<span class="sb-txt">' + i.rotulo + "</span>" +
      (i.badge ? '<span class="sb-badge">' + i.badge + "</span>" : '<span class="sb-arr">→</span>') +
    "</a>";
  const fixos = gruposFixos();
  // Fechado, o grupo mostra so o titulo; o clique abre e fecha.
  // O item da tela aberta continua a mostra mesmo com o grupo fechado, para a
  // pessoa nunca perder onde esta.
  const grupo = (g) => {
    const fixo = fixos.includes(g.id);
    return '<div class="sb-grupo' + (fixo ? " fixo" : "") + '" data-grupo="' + g.id + '">' +
      '<button type="button" class="sb-grupo-cab" aria-expanded="' + fixo + '" title="' +
        (fixo ? "Clique para ocultar" : "Clique para exibir") + '">' +
        '<span class="sb-ico">' + svg(ICO[g.ico]) + "</span>" +
        '<span class="sb-txt">' + g.titulo + "</span>" +
        '<span class="sb-chev" aria-hidden="true">▸</span></button>' +
      '<div class="sb-grupo-itens">' + g.itens.map(item).join("") + "</div></div>";
  };
  const config = item({ id: "parametros", rotulo: "Configurações", href: "parametros.html",
                        tambem: ["senha", "usuarios"] });

  const alvo = document.querySelector(".app-layout") || document.body;
  alvo.insertAdjacentHTML("afterbegin",
    '<aside class="sidebar">' +
      '<div class="sb-logo">' +
        '<img class="sb-marca" src="centurion_menu.png" alt="Centurion">' +
        '<div class="sb-logo-txt">' +
          '<div class="sb-logo-title">Centurion</div>' +
          '<div class="sb-logo-sub">Controle de estoque</div>' +
        "</div></div>" +
      '<nav class="sb-nav">' +
        GRUPOS_MENU.map(grupo).join("") +
        '<div class="sb-separa"></div>' + config +
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
  document.querySelectorAll(".sb-grupo-cab").forEach((cab) => {
    cab.onclick = () => {
      const g = cab.parentElement, id = g.dataset.grupo;
      const fixo = g.classList.toggle("fixo");
      cab.setAttribute("aria-expanded", fixo);
      cab.title = fixo ? "Clique para ocultar" : "Clique para exibir";
      const lista = gruposFixos().filter((x) => x !== id);
      if (fixo) lista.push(id);
      guardarFixos(lista);
    };
  });
  aplicarTema(localStorage.getItem(THEME_KEY) || "light");
  aplicarUsuario(atual);
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
    // com o grupo fechado o item some: o titulo de Compras carrega o mesmo selo
    const g = link.closest(".sb-grupo");
    const chev = g && g.querySelector(".sb-chev");
    if (chev) chev.insertAdjacentHTML("beforebegin", '<span class="sb-badge sb-badge-grupo">' + r.pendentes + "</span>");
  } catch (e) { /* servidor fora do ar: segue sem selo */ }
}

// Enter numa célula de tabela confirma o valor e desce para a mesma coluna da
// linha de baixo, como numa planilha; o Tab segue o padrão do navegador (para
// a frente). Vale em todas as telas, porque este arquivo é carregado em todas.
//
// Fica na window, e não no document, para rodar DEPOIS dos ouvintes de cada
// tela: tela que já trata o Enter do seu jeito (incluir item na OC, a
// Projeção com o consolidado) chama preventDefault e este aqui sai fora.
//
// A coluna é a posição da célula. Acabando a tabela, segue para a próxima que
// tenha o mesmo título naquela coluna — o Lançamento tem uma tabela por grupo
// de insumo, e o Enter no último camarão deve ir para o primeiro peixe.
const ENTER_TIPOS = ["", "text", "number", "tel", "email"];

function celulaEditavel(td) {
  return td && [...td.querySelectorAll("input")].find((el) =>
    ENTER_TIPOS.includes(el.getAttribute("type") || "") &&
    !el.disabled && !el.readOnly && el.offsetParent);
}

function tituloColuna(tabela, indice) {
  const cab = tabela.tHead && tabela.tHead.rows[0];
  const th = cab && cab.cells[indice];
  return th ? th.textContent.trim() : null;
}

function proximaNaColuna(td) {
  const tabela = td.closest("table"), indice = td.cellIndex;
  const linhaAtual = td.parentElement;
  const procura = (tab, depoisDe) => {
    let passou = !depoisDe;
    for (const tr of tab.tBodies.length ? [...tab.tBodies].flatMap((b) => [...b.rows]) : [...tab.rows]) {
      if (!passou) { passou = tr === depoisDe; continue; }
      const alvo = celulaEditavel(tr.cells[indice]);
      if (alvo) return alvo;
    }
    return null;
  };
  const achou = procura(tabela, linhaAtual);
  if (achou) return achou;
  const titulo = tituloColuna(tabela, indice);
  if (!titulo) return null;
  const tabelas = [...document.querySelectorAll("table")];
  for (const tab of tabelas.slice(tabelas.indexOf(tabela) + 1)) {
    if (tituloColuna(tab, indice) !== titulo) continue;
    const alvo = procura(tab, null);
    if (alvo) return alvo;
  }
  return null;
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const el = e.target;
  if (!el.matches || !el.matches("td input") || !ENTER_TIPOS.includes(el.getAttribute("type") || "")) return;
  // Confirmar pode redesenhar a tabela (a tela troca o innerHTML no change):
  // a célula é guardada pela posição e achada de novo depois do blur.
  const td = el.closest("td"), tr = td.parentElement;
  const pos = [[...document.querySelectorAll("table")].indexOf(td.closest("table")),
               tr.rowIndex, td.cellIndex];
  e.preventDefault();
  el.blur();                                  // confirma: dispara o change/focusout da tela
  const tab = document.querySelectorAll("table")[pos[0]];
  const tdDepois = tab && tab.rows[pos[1]] && tab.rows[pos[1]].cells[pos[2]];
  const prox = tdDepois && proximaNaColuna(tdDepois);
  if (prox) { prox.focus(); prox.select(); }
});

// ------------------------------------------------------- campo de data
// O campo de data do Chrome seleciona dia, mes e ano em pedacos e, sem o ano,
// a data inteira fica invalida. Aqui cada <input type="date"> ganha por cima um
// campo de texto: o clique seleciona tudo, digita-se "19/11", "1911", "19/11/26"
// ou so "19" — o que faltar vem do mes e do ano atuais — e o icone ao lado abre
// o calendario do Chrome. O campo original continua por baixo, com o mesmo id,
// o valor aaaa-mm-dd e os mesmos eventos: nenhuma tela precisou mudar.
const _valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const _isoParaBr = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.split("-").reverse().join("/") : "";

// "19", "19/11", "1911", "19/11/26", "19.11.2026" -> "2026-11-19"; invalido -> null
function lerDataDigitada(txt) {
  const s = String(txt || "").trim();
  if (!s) return "";
  const hoje = new Date();
  let d, m, a;
  const sep = s.split(/[\/.\-\s]+/).filter(Boolean);
  if (sep.length > 1) [d, m, a] = sep;
  else if (/^\d{1,2}$/.test(s)) d = s;
  else if (/^\d{3,8}$/.test(s)) { d = s.slice(0, 2); m = s.slice(2, 4); a = s.slice(4) || undefined; }
  else return null;
  d = Number(d);
  m = m === undefined ? hoje.getMonth() + 1 : Number(m);
  a = a === undefined || a === "" ? hoje.getFullYear() : Number(String(a).length <= 2 ? "20" + String(a).padStart(2, "0") : a);
  const dt = new Date(a, m - 1, d);
  if (!(d >= 1 && m >= 1 && m <= 12) || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function melhorarCampoData(nat) {
  if (nat._espelho || nat.closest(".data-br")) return;
  const caixa = document.createElement("span");
  caixa.className = "data-br";
  const txt = document.createElement("input");
  txt.type = "text";
  txt.className = (nat.className + " data-br-txt").trim();
  if (nat.getAttribute("style")) txt.setAttribute("style", nat.getAttribute("style"));
  txt.placeholder = "dd/mm/aaaa";
  txt.autocomplete = "off";
  txt.inputMode = "numeric";
  txt.title = nat.title || "Digite dd/mm (o ano atual entra sozinho) ou use o calendário";
  if (nat.dataset.oc) txt.setAttribute("aria-label", nat.dataset.oc);
  const bot = document.createElement("button");
  bot.type = "button";
  bot.className = "data-br-cal";
  bot.tabIndex = -1;
  bot.title = "Abrir o calendário";
  bot.setAttribute("aria-label", "Abrir o calendário");
  bot.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/>' +
    '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  nat.parentNode.insertBefore(caixa, nat);
  caixa.append(nat, txt, bot);
  nat.tabIndex = -1;
  nat.setAttribute("aria-hidden", "true");
  nat._espelho = txt;

  const sync = () => {
    if (document.activeElement !== txt) txt.value = _isoParaBr(_valorNativo.get.call(nat));
    txt.disabled = nat.disabled;
    txt.readOnly = nat.readOnly;
    bot.disabled = nat.disabled || nat.readOnly;
  };
  // codigo da tela que escreve no campo original (el.value = "...") atualiza o texto
  Object.defineProperty(nat, "value", {
    configurable: true,
    get() { return _valorNativo.get.call(this); },
    set(v) { _valorNativo.set.call(this, v); sync(); },
  });
  new MutationObserver(sync).observe(nat, { attributes: true, attributeFilter: ["disabled", "readonly"] });
  nat.addEventListener("change", sync);
  sync();

  const confirmar = () => {
    const iso = lerDataDigitada(txt.value);
    if (iso === null) {                       // nao e data: volta ao que estava
      txt.classList.add("data-br-erro");
      setTimeout(() => txt.classList.remove("data-br-erro"), 1200);
      txt.value = _isoParaBr(_valorNativo.get.call(nat));
      return;
    }
    if (iso === _valorNativo.get.call(nat)) { txt.value = _isoParaBr(iso); return; }
    _valorNativo.set.call(nat, iso);
    txt.value = _isoParaBr(iso);
    nat.dispatchEvent(new Event("input", { bubbles: true }));
    nat.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // clique seleciona a data inteira, pronta para digitar por cima
  txt.addEventListener("focus", () => setTimeout(() => txt.select(), 0));
  txt.addEventListener("mouseup", (e) => { if (txt.selectionStart === txt.selectionEnd) { e.preventDefault(); txt.select(); } });
  txt.addEventListener("blur", confirmar);
  txt.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmar();
    if (e.key === "Escape") { txt.value = _isoParaBr(_valorNativo.get.call(nat)); txt.select(); }
  });
  bot.addEventListener("click", () => {
    if (nat.disabled || nat.readOnly) return;
    try { nat.showPicker(); } catch (erro) { nat.focus(); }
  });
}

function melhorarDatas(raiz) {
  (raiz.querySelectorAll ? raiz.querySelectorAll('input[type="date"]') : []).forEach(melhorarCampoData);
}
document.addEventListener("DOMContentLoaded", () => {
  melhorarDatas(document);
  // telas que desenham campos de data depois (ordens, recebimento, acoes)
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type="date"]')) melhorarCampoData(n);
    else melhorarDatas(n);
  }))).observe(document.body, { childList: true, subtree: true });
});

// ------------------------------------------------------- usuario no menu
// Com o login ligado: esconde do menu as telas sem acesso, mostra quem esta
// logado (com Trocar senha, Usuarios para administrador e Sair) e, numa tela
// de "so ver", avisa no alto que nada ali sera salvo. Quem decide de verdade e
// o servidor; o menu so evita mostrar porta que nao abre.
async function aplicarUsuario(atual) {
  const eu = await window.CDE_EU;
  if (!eu || !eu.login) return;
  document.querySelectorAll(".sb-nav .sb-item").forEach((a) => {
    const id = (a.getAttribute("href") || "").replace(".html", "");
    if (id === "parametros") return;     // Configuracoes: a senha e de todo mundo
    const tela = { index: "lancamento", "contagem-diaria": "contagem_diaria",
                   "contagem-semanal": "contagem_semanal" }[id] || id;
    if (eu.permissoes[tela] === "nenhum") a.remove();
  });
  // grupo que ficou sem nenhum item some junto com o titulo
  document.querySelectorAll(".sb-nav .sb-grupo").forEach((g) => {
    if (!g.querySelector(".sb-item")) g.remove();
  });
  const rodape = document.querySelector(".sb-rodape");
  if (rodape) {
    rodape.insertAdjacentHTML("afterbegin",
      '<div class="sb-usuario" title="' + eu.nome + (eu.perfil ? " · " + eu.perfil : "") + '">' +
        '<span class="sb-ico">' + svg(ICO.usuarios) + "</span>" +
        '<span class="sb-txt"><b>' + eu.nome + "</b>" + (eu.perfil ? "<small>" + eu.perfil + "</small>" : "") + "</span></div>" +
      '<a class="sb-item" href="#" id="sb-sair">' +
        '<span class="sb-ico">' + svg(ICO.sair) + '</span><span class="sb-txt">Sair</span></a>');
    document.getElementById("sb-sair").onclick = async (e) => {
      e.preventDefault();
      guardarFixos([]);                  // o menu volta fechado no proximo login
      await fetch("/api/sair", { method: "POST" });
      location.href = "/login.html";
    };
  }
  // Em Configuracoes a senha vale para todos: o "so ver" ali e so dos parametros
  if (eu.permissoes[atual] === "ver" && atual !== "parametros") {
    document.body.classList.add("so-consulta");
    const main = document.querySelector(".main-content") || document.body;
    main.insertAdjacentHTML("afterbegin",
      '<div class="faixa-consulta">Modo consulta: você pode ver esta tela, mas as alterações não serão salvas.</div>');
  }
}

// ------------------------------------------------------ troca de lojas
// Nome da loja nas abas de troca de casa: completo, sem sigla. Cidade Nova vai
// sem o "Delivery" para as quatro pílulas caberem numa linha só.
const NOME_LOJA = { SL: "Senador Lemos", DC: "Duque de Caxias",
  DLU: "Delivery Umarizal", DLCN: "Cidade Nova" };
function nomeLoja(chave, nome) { return NOME_LOJA[chave] || nome || chave; }

// Realce escuro das abas de loja (.abas-lojas). Fica de fora do redesenho:
// tirarRealce() antes de limpar a barra, pôrRealce() depois de montar os
// botões — ele continua onde estava e desliza até a loja escolhida.
function tirarRealce(nav) {
  let r = nav.querySelector(".abas-realce");
  if (!r) {
    r = document.createElement("span");
    r.className = "abas-realce";
    r.setAttribute("aria-hidden", "true");
  }
  return r;
}
function porRealce(nav, r) {
  if (r.parentNode !== nav) nav.prepend(r);
  const ativa = nav.querySelector("button.ativa");
  if (!ativa || !ativa.offsetWidth) { r.style.opacity = "0"; return; }
  const primeira = !r.style.width;
  if (primeira) r.style.transition = "none";
  r.style.opacity = "1";
  r.style.transform = `translate(${ativa.offsetLeft}px, ${ativa.offsetTop}px)`;
  r.style.width = ativa.offsetWidth + "px";
  r.style.height = ativa.offsetHeight + "px";
  if (primeira) { void r.offsetWidth; r.style.transition = ""; }
}
window.addEventListener("resize", () => {
  document.querySelectorAll(".abas-lojas").forEach((nav) => porRealce(nav, tirarRealce(nav)));
});
