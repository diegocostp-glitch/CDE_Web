/* Tema novo do CDE Web — EXEMPLO para aprovação. Camada por cima do navegacao.js e das telas de hoje:
   não troca nenhum cálculo nem nenhuma tela; só o jeito do menu, dos botões, da troca de tela e dos gráficos. */
(function () {
  "use strict";
  const H = document.documentElement;
  H.classList.add("tn");
  const ABERTO_KEY = "cde_menu_aberto";
  try { if (localStorage.getItem(ABERTO_KEY) === "1") H.classList.add("aberto"); } catch (e) {}
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const EASE = "cubic-bezier(.22,1,.36,1)";
  const ICO_BUSCA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
  const ICO_LADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M16 10l-2 2 2 2"/></svg>';
  const ehAberto = () => H.classList.contains("aberto");
  // As páginas de exemplo se chamam ex-<tela>.html. Dentro delas, os links do sistema (menu, painel, pesquisa)
  // levam para a versão ex- da tela de destino, para a pessoa ficar sempre no exemplo.
  const NO_EXEMPLO = /\/ex-[^/]*\.html$/.test(location.pathname);
  function destino(h) { return NO_EXEMPLO && /^[\w-]+\.html(\?.*|#.*)?$/.test(h) && h !== "login.html" && !/^ex-/.test(h) ? "ex-" + h : h; }
  function irPara(h) { location.href = destino(h); }
  if (NO_EXEMPLO) document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]"); if (!a || a.target === "_blank") return;
    const h = a.getAttribute("href"), d = destino(h);
    if (d !== h) { e.preventDefault(); location.href = d; }
  }, true);

  // ------------------------------------------------------------------ menu
  function seguePill(ms) { const t0 = performance.now(); (function p() { movePill(); if (performance.now() - t0 < ms) requestAnimationFrame(p); })(); }
  let pillInicial = true;
  function movePill() {
    const nav = $(".sb-nav"), pill = $(".tn-pill"); if (!nav || !pill) return;
    const ativo = $(".sb-item.active");
    let alvo = null;
    if (ativo) { const g = ativo.closest(".sb-grupo"); alvo = ehAberto() ? ativo : (g ? $(".sb-grupo-cab", g) : ativo); }
    if (!alvo || !alvo.offsetParent) { pill.style.opacity = 0; return; }
    const nr = nav.getBoundingClientRect(), r = alvo.getBoundingClientRect();
    const y = r.top - nr.top + nav.scrollTop;
    if (pillInicial) { // entre telas, a pílula nasce onde estava na tela anterior e desliza até a nova
      pillInicial = false;
      let antes = null; try { antes = JSON.parse(sessionStorage.getItem("cde_pill")); } catch (e) {}
      if (antes && antes.aberto === ehAberto() && !reduz && Math.abs(antes.y - y) > 2) {
        pill.style.transition = "none"; pill.style.height = antes.h + "px"; pill.style.transform = `translateY(${antes.y}px)`; pill.style.opacity = 1;
        void pill.offsetWidth; pill.style.transition = "";
      }
    }
    pill.style.height = r.height + "px"; pill.style.transform = `translateY(${y}px)`; pill.style.opacity = 1;
    try { sessionStorage.setItem("cde_pill", JSON.stringify({ y, h: r.height, aberto: ehAberto() })); } catch (e) {}
  }
  function alternaAberto() {
    fechaFly();
    H.classList.toggle("aberto");
    try { localStorage.setItem(ABERTO_KEY, ehAberto() ? "1" : "0"); } catch (e) {}
    atualizaRecolher(); seguePill(460);
  }
  function atualizaRecolher() { const b = $(".tn-recolher"); if (b) { b.title = ehAberto() ? "Recolher o menu ( [ )" : "Fixar o menu aberto ( [ )"; b.setAttribute("aria-label", b.title); } }

  // Ícones do menu desenhados no padrão do Bastio: viewBox 24, traço de 1,7, pontas e cantos redondos, sem preenchimento.
  const IC = {
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    reports: '<path d="M4 20h16M7 20v-5M12 20V9M17 20v-8"/>',
    box: '<path d="M4 8.5 12 4l8 4.5v8L12 21l-8-4.5z"/><path d="M4 8.5 12 13l8-4.5M12 13v8"/>',
    cart: '<path d="M4 5h2l1.6 9.2a1.5 1.5 0 0 0 1.5 1.3h7.4a1.5 1.5 0 0 0 1.5-1.2L19.5 8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>',
    tool: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9"/><path d="M14 6l1.5-1.5"/>',
    ledger: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
    clipcheck: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5"/><path d="m9.2 13 2.1 2.1 3.6-3.9"/>',
    calcheck: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/><path d="m9.5 15 1.8 1.8 3.2-3.4"/>',
    swap: '<path d="M7 4v13M7 4 3.5 7.5M7 4l3.5 3.5"/><path d="M17 20V7M17 20l-3.5-3.5M17 20l3.5-3.5"/>',
    trend: '<path d="M4 18l5.5-6 3.5 3.5L20 7"/><path d="M15 7h5v5"/>',
    filecheck: '<path d="M7 3.5h7l4 4V18a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2-2.5z"/><path d="M14 3.5V8h4"/><path d="m9.3 14 2 2 3.5-3.7"/>',
    truck: '<rect x="3" y="6.5" width="10" height="9.5" rx="2"/><path d="M13 9.5h4l3.5 3.5V16H13"/><circle cx="7.5" cy="18" r="1.7"/><circle cx="16.5" cy="18" r="1.7"/>',
    book: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><circle cx="12" cy="10" r="2.3"/><path d="M8 17c.5-2 2-3 4-3s3.5 1 4 3"/>',
    scale: '<path d="M12 4v16M7 20h10M5 7.5h14"/><path d="M5 7.5 2.7 13a2.8 2.8 0 0 0 4.6 0zM19 7.5 16.7 13a2.8 2.8 0 0 0 4.6 0z"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
    support: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 16.9v.1"/>',
    people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c1.8.6 3 2.2 3.5 4.7"/>',
    logout: '<path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4H9"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  };
  const POR_HREF = { "overview.html": "grid", "painel.html": "reports", "index.html": "ledger", "contagem-diaria.html": "clipcheck", "contagem-semanal.html": "calcheck",
    "movimentacoes.html": "swap", "compras.html": "trend", "ordens.html": "filecheck", "recebimento.html": "truck", "cadastros.html": "book", "conversao.html": "scale",
    "qualidade.html": "shield", "parametros.html": "gear", "ajuda.html": "support" };
  const POR_GRUPO = { inicio: "grid", estoque: "box", compras: "cart", utilitarios: "tool" };
  function iconizar() {
    const poe = (el, nome) => {
      const ico = el && el.querySelector(".sb-ico");
      if (!ico || !IC[nome] || ico.dataset.tn === nome) return;
      ico.dataset.tn = nome;
      ico.innerHTML = '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[nome] + "</svg>";
    };
    $$(".sidebar a.sb-item").forEach((a) => poe(a, a.id === "sb-sair" ? "logout" : POR_HREF[a.getAttribute("href")]));
    $$(".sidebar .sb-grupo").forEach((g) => poe($(".sb-grupo-cab", g), POR_GRUPO[g.dataset.grupo]));
    poe($(".sidebar .sb-usuario"), "people");
  }

  function melhoraMenu() {
    const nav = $(".sb-nav"), logo = $(".sb-logo"); if (!nav || !logo || $(".tn-pill")) return;
    nav.insertAdjacentHTML("afterbegin", '<span class="tn-pill" aria-hidden="true"></span>');
    iconizar();
    logo.insertAdjacentHTML("beforeend", '<button type="button" class="tn-recolher">' + ICO_LADO + "</button>");
    logo.insertAdjacentHTML("afterend", '<button type="button" class="tn-busca" aria-label="Pesquisar"><span class="tn-busca-ico">' + ICO_BUSCA + '</span><span class="tn-busca-txt">Pesquisar…</span><span class="tn-kbd">Ctrl K</span></button>');
    $(".tn-recolher").onclick = alternaAberto; atualizaRecolher();
    $(".tn-busca").onclick = abrePal;
    const marca = () => $$(".sb-grupo").forEach((g) => g.classList.toggle("tem-ativo", !!g.querySelector(".sb-item.active")));
    marca();
    // recolhido, o clique no grupo fixa o painel em vez de abrir a lista no menu
    $$(".sb-grupo-cab").forEach((cab) => cab.addEventListener("click", (e) => {
      if (ehAberto()) { seguePill(60); return; }
      e.stopImmediatePropagation(); e.preventDefault(); abreFly(cab, true);
    }, true));
    const sb = $(".sidebar");
    sb.addEventListener("mouseover", (e) => {
      if (ehAberto()) return;
      const a = e.target.closest(".sb-grupo-cab, .sb-nav > .sb-item, .sb-rodape > .sb-item, .sb-rodape > .sb-tema, .sb-rodape > .sb-usuario, .tn-busca, .tn-recolher");
      if (!a) return;
      clearTimeout(FLY.fecha); clearTimeout(FLY.intencao);
      FLY.intencao = setTimeout(() => abreFly(a, false), FLY.el ? 0 : 70);
    });
    sb.addEventListener("mouseout", (e) => {
      const a = e.target.closest(".sb-grupo-cab, .sb-nav > .sb-item, .sb-rodape > .sb-item, .sb-rodape > .sb-tema, .sb-rodape > .sb-usuario, .tn-busca, .tn-recolher");
      if (a && !a.contains(e.relatedTarget)) { clearTimeout(FLY.intencao); agendaFecha(); }
    });
    // o menu muda depois de montado (selo de ordens, usuário, telas sem acesso): a pílula acompanha
    new MutationObserver(() => { marca(); iconizar(); movePill(); }).observe(sb, { childList: true, subtree: true });
    addEventListener("resize", movePill);
    requestAnimationFrame(() => { movePill(); setTimeout(movePill, 300); });
  }

  // painel que mostra o que há dentro do grupo (ou o nome do ícone) ao passar o mouse no menu recolhido
  const FLY = { el: null, on: null, pin: false, fecha: 0, intencao: 0 };
  function fechaFly() { clearTimeout(FLY.fecha); clearTimeout(FLY.intencao); if (FLY.el) FLY.el.remove(); FLY.el = null; FLY.on = null; FLY.pin = false; }
  function agendaFecha() { clearTimeout(FLY.fecha); FLY.fecha = setTimeout(() => { if (!FLY.pin) fechaFly(); }, 240); }
  function textoDe(el) { const t = $(".sb-txt", el) || $(".tn-busca-txt", el); const b = $("b", el); return (b ? b.textContent : t ? t.textContent : el.title || "").trim() || el.title || ""; }
  function abreFly(alvo, fixar) {
    if (ehAberto()) return;
    clearTimeout(FLY.fecha);
    if (FLY.on === alvo && FLY.el) { if (fixar) { FLY.pin = !FLY.pin; if (!FLY.pin) fechaFly(); } return; }
    if (FLY.el) FLY.el.remove();
    FLY.on = alvo; FLY.pin = !!fixar;
    const grupo = alvo.classList.contains("sb-grupo-cab") ? alvo.parentElement : null, el = document.createElement("div"), r = alvo.getBoundingClientRect();
    el.className = "tn-fly" + (grupo ? "" : " tn-fly--tip");
    if (grupo) {
      const itens = $$(".sb-grupo-itens .sb-item", grupo);
      el.innerHTML = '<div class="tn-fly__in" role="menu"><div class="tn-fly__t">' + textoDe(alvo) + "</div>" +
        itens.map((a) => { const b = $(".sb-badge", a); return '<a role="menuitem" href="' + a.getAttribute("href") + '"' + (a.classList.contains("active") ? ' class="active"' : "") + ">" + textoDe(a) + (b ? '<span class="sb-badge">' + b.textContent + "</span>" : "") + "</a>"; }).join("") + "</div>";
    } else {
      const t = alvo.classList.contains("tn-busca") ? "Pesquisar (Ctrl K)" : alvo.classList.contains("tn-recolher") ? "Fixar o menu aberto" : textoDe(alvo);
      el.innerHTML = '<div class="tn-fly__in">' + t + "</div>";
    }
    document.body.appendChild(el);
    const lado = $(".sidebar").getBoundingClientRect().right;
    el.style.left = lado - 6 + "px";
    el.style.top = Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, r.top - (grupo ? 8 : -2))) + "px";
    el.addEventListener("mouseenter", () => clearTimeout(FLY.fecha));
    el.addEventListener("mouseleave", agendaFecha);
    FLY.el = el;
  }

  // ------------------------------------------------------------ pesquisa (Ctrl K)
  let pal = null, palItens = [], palSel = 0;
  function telasDoMenu() {
    const tem = new Set($$(".sidebar a[href]").map((a) => a.getAttribute("href")));
    const out = [];
    try { GRUPOS_MENU.forEach((g) => g.itens.forEach((i) => { if (tem.has(i.href)) out.push({ g: g.titulo, t: i.rotulo, href: i.href }); })); } catch (e) {}
    if (tem.has("parametros.html")) out.push({ g: "Sistema", t: "Configurações", href: "parametros.html" });
    if (tem.has("ajuda.html")) out.push({ g: "Sistema", t: "Ajuda", href: "ajuda.html" });
    return out;
  }
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function abrePal() {
    if (!pal) {
      pal = document.createElement("div"); pal.className = "tn-pal"; pal.setAttribute("role", "dialog"); pal.setAttribute("aria-label", "Pesquisar telas");
      pal.innerHTML = '<div class="tn-pal__box"><label class="tn-pal__in">' + ICO_BUSCA + '<input placeholder="Ir para uma tela…" autocomplete="off"></label><div class="tn-pal__list"></div></div>';
      document.body.appendChild(pal);
      pal.addEventListener("mousedown", (e) => { if (e.target === pal) fechaPal(); });
      $("input", pal).addEventListener("input", (e) => listaPal(e.target.value));
    }
    fechaFly(); pal.classList.add("on"); const i = $("input", pal); i.value = ""; listaPal(""); setTimeout(() => i.focus(), 20);
  }
  function fechaPal() { if (pal) pal.classList.remove("on"); }
  function listaPal(q) {
    q = norm(q.trim()); let g = "";
    palItens = telasDoMenu().filter((x) => !q || norm(x.t).includes(q)); palSel = 0;
    $(".tn-pal__list", pal).innerHTML = palItens.length ? palItens.map((x, i) => { const cab = x.g !== g ? '<div class="tn-pal__g">' + (g = x.g) + "</div>" : ""; return cab + '<button class="tn-pal__it" data-i="' + i + '" aria-selected="' + (i === 0) + '">' + x.t + "</button>"; }).join("") : '<div class="tn-pal__vazio">Nenhuma tela encontrada</div>';
    $$(".tn-pal__it", pal).forEach((b) => b.addEventListener("click", () => { irPara(palItens[+b.dataset.i].href); }));
  }
  function marcaPal(d) { if (!palItens.length) return; palSel = (palSel + d + palItens.length) % palItens.length; $$(".tn-pal__it", pal).forEach((b, i) => { b.setAttribute("aria-selected", i === palSel); if (i === palSel) b.scrollIntoView({ block: "nearest" }); }); }
  addEventListener("keydown", (e) => {
    const aberta = pal && pal.classList.contains("on");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); aberta ? fechaPal() : abrePal(); return; }
    if (aberta) {
      if (e.key === "Escape") fechaPal();
      else if (e.key === "ArrowDown") { e.preventDefault(); marcaPal(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcaPal(-1); }
      else if (e.key === "Enter" && palItens[palSel]) { e.preventDefault(); irPara(palItens[palSel].href); }
      return;
    }
    if (e.key === "Escape" && FLY.el) fechaFly();
    else if (e.key === "[" && !/input|select|textarea/i.test(e.target.tagName) && !e.target.isContentEditable) alternaAberto();
  });
  document.addEventListener("click", (e) => { if (FLY.el && !e.target.closest(".tn-fly") && !e.target.closest(".sidebar")) fechaFly(); });

  // ---------------------------------------------------------- saudação na tela inicial
  function saudacao() { const h = new Date().getHours(); return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }
  function saudar() {
    if (!/overview\.html$/.test(location.pathname)) return;
    const h1 = $(".screen-header h1"); if (!h1) return;
    h1.textContent = saudacao(); h1.title = "Visão Geral";
    Promise.resolve(window.CDE_EU).then((eu) => {
      const nome = eu && eu.login && eu.nome ? String(eu.nome).trim().split(/\s+/)[0] : "";
      if (nome) h1.textContent = saudacao() + ", " + nome;
    }).catch(() => {});
  }

  // ------------------------------------------------- botões segmentados com realce que desliza
  function segmentado(seg) {
    if (seg._tn) return; seg._tn = 1;
    const thumb = document.createElement("span"); thumb.className = "tn-thumb"; seg.prepend(thumb);
    const pos = () => {
      const b = $("button.ativo", seg);
      // Só mexe na classe quando ela realmente muda: gravar a mesma classe de novo dispara o observador
      // de mutações outra vez, e a rotina rodava sem parar (travou a aba).
      if (!b || !b.offsetWidth) { thumb.style.opacity = 0; if (seg.classList.contains("tn-ok")) seg.classList.remove("tn-ok"); return; }
      thumb.style.opacity = 1; if (!seg.classList.contains("tn-ok")) seg.classList.add("tn-ok");
      thumb.style.width = b.offsetWidth + "px"; thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    };
    thumb.style.transition = "none"; pos(); requestAnimationFrame(() => (thumb.style.transition = ""));
    new MutationObserver(pos).observe(seg, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
    if (window.ResizeObserver) new ResizeObserver(pos).observe(seg);
  }

  // ---------------------------------------------------------------- gráficos
  const dur = reduz ? 1 : 900;
  function revela(svg) {
    if (svg._tn || svg.closest(".sidebar") || svg.closest("button, .botao, a")) return;
    const vb = svg.viewBox && svg.viewBox.baseVal; if (!vb || vb.width < 60) return;
    svg._tn = 1;
    if (svg.closest("#pizza")) { svg.animate([{ opacity: 0, transform: "rotate(-24deg) scale(.88)" }, { opacity: 1, transform: "none" }], { duration: dur, easing: EASE }); return; }
    $$("path", svg).forEach((p) => {
      const fill = p.getAttribute("fill"), stroke = p.getAttribute("stroke");
      if (stroke && (!fill || fill === "none")) {
        const len = p.getTotalLength ? p.getTotalLength() : 0;
        if (len > 20) p.animate([{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: dur, easing: EASE });
      } else if (fill && fill.indexOf("url(") === 0) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, easing: "ease-out" });
    });
    $$(".g-faixa, .g-halo, .g-ponto", svg).forEach((e) => e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay: dur * .5, easing: "ease-out", fill: "backwards" }));
  }
  function barras(raiz) { // barrinhas de proporção feitas com largura em %: crescem da esquerda
    $$('[style*="width"]', raiz).forEach((b, i) => {
      if (b._tn || b.children.length || b.textContent.trim() || !/width:\s*[\d.]+%/.test(b.getAttribute("style") || "")) return;
      if (b.offsetHeight > 16 || b.offsetHeight < 2) return;
      b._tn = 1;
      b.animate([{ transform: "scaleX(0)", transformOrigin: "left center" }, { transform: "scaleX(1)", transformOrigin: "left center" }], { duration: dur * .8, delay: Math.min(i, 12) * 40, easing: EASE, fill: "backwards" });
    });
  }
  function varre(no) {
    if (no.nodeType !== 1) return;
    if (no.matches("svg")) requestAnimationFrame(() => revela(no)); else $$("svg", no).forEach((s) => requestAnimationFrame(() => revela(s)));
    requestAnimationFrame(() => barras(no));
    $$(".segmentado", no.parentNode ? no : document).forEach(segmentado);
    if (no.matches && no.matches(".segmentado")) segmentado(no);
  }

  // Destaque que desliza: antes o realce pulava de mês em mês; agora segue o mouse pela curva, com um atraso curto e suave.
  function estadoDestaque(svg) {
    if (svg._m) return svg._m;
    const q = (c) => $(c, svg), alvos = $$(".g-alvo", svg);
    const xs = alvos.map((a) => parseFloat(a.getAttribute("cx")));
    const linha = $$("path", svg).find((p) => p.getAttribute("stroke") && (!p.getAttribute("fill") || p.getAttribute("fill") === "none"));
    const m = svg._m = { faixa: q(".g-faixa"), guia: q(".g-guia"), halo: q(".g-halo"), ponto: q(".g-ponto"), xs, linha, base: parseFloat(svg.dataset.base || 0),
      W: (svg.viewBox.baseVal && svg.viewBox.baseVal.width) || 900, tx: null, ty: null, cx: null, cy: null, raf: 0, idx: -1, last: 0 };
    return m;
  }
  function aplicaDestaque(svg) {
    const m = svg._m;
    if (m.faixa) { m.faixa.setAttribute("x", Math.min(Math.max(m.cx - 19, 0), m.W - 38).toFixed(1)); m.faixa.setAttribute("y", m.cy.toFixed(1)); m.faixa.setAttribute("height", Math.max(0, m.base - m.cy).toFixed(1)); }
    if (m.guia) { m.guia.setAttribute("x1", m.cx.toFixed(1)); m.guia.setAttribute("x2", m.cx.toFixed(1)); }
    [m.halo, m.ponto].forEach((e) => { if (e) { e.setAttribute("cx", m.cx.toFixed(1)); e.setAttribute("cy", m.cy.toFixed(1)); } });
  }
  function rodaDestaque(svg) {
    const m = svg._m; if (m.raf) return;
    const laco = (t) => {
      const dt = Math.min(64, t - (m.last || t)); m.last = t;
      const k = reduz ? 1 : 1 - Math.exp(-dt / 55);
      m.cx += (m.tx - m.cx) * k; m.cy += (m.ty - m.cy) * k;
      aplicaDestaque(svg);
      if (Math.abs(m.tx - m.cx) > .12 || Math.abs(m.ty - m.cy) > .12) m.raf = requestAnimationFrame(laco); else { m.raf = 0; m.last = 0; }
    };
    m.raf = requestAnimationFrame(laco);
  }
  function marcaIndice(svg, i) {
    const m = svg._m; if (i === m.idx) return; m.idx = i;
    $$("text[data-i]", svg).forEach((t) => t.classList.toggle("eixo-forte", Number(t.dataset.i) === i));
    const alvo = $(`.g-alvo[data-i="${i}"]`, svg), leitura = svg.parentElement && $(".g-leitura", svg.parentElement), titulo = alvo && $("title", alvo);
    if (leitura && titulo) leitura.textContent = titulo.textContent;
  }
  function destacarSuave(svg, i) { // substitui o destacar() original: mesma ideia, mas o destaque anda até o ponto
    const alvo = $(`.g-alvo[data-i="${i}"]`, svg); if (!alvo) return;
    const m = estadoDestaque(svg), cx = parseFloat(alvo.getAttribute("cx")), cy = parseFloat(alvo.getAttribute("cy"));
    m.tx = cx; m.ty = cy;
    if (m.cx == null) { m.cx = cx; m.cy = cy; aplicaDestaque(svg); } else rodaDestaque(svg);
    marcaIndice(svg, i);
  }
  function seguirMouse(bloco) {
    if (bloco._tn) return; bloco._tn = 1;
    bloco.addEventListener("mousemove", (e) => {
      const svg = e.target.closest("svg.grafico"); if (!svg) return;
      const m = estadoDestaque(svg); if (!m.linha || !m.xs.length) return;
      e.stopPropagation(); // impede o salto original para o ponto mais próximo
      const r = svg.getBoundingClientRect(); if (!r.width) return;
      const x = Math.max(m.xs[0], Math.min(m.xs[m.xs.length - 1], ((e.clientX - r.left) / r.width) * m.W));
      let lo = 0, hi = m.linha.getTotalLength();
      for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (m.linha.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
      const y = m.linha.getPointAtLength(hi).y;
      m.tx = x; m.ty = y; if (m.cx == null) { m.cx = x; m.cy = y; }
      if (m.guia) m.guia.setAttribute("opacity", ".45");
      let melhor = 0, d = Infinity; m.xs.forEach((px, i) => { const dd = Math.abs(px - x); if (dd < d) { d = dd; melhor = i; } });
      marcaIndice(svg, melhor); rodaDestaque(svg);
    }, true);
  }

  // ---------------------------------------------------------------- partida
  function emboloMontarSidebar() {
    if (typeof window.montarSidebar !== "function" || window.montarSidebar.__tn) return;
    const original = window.montarSidebar;
    const novo = function (atual, extras) { original(atual, extras); try { melhoraMenu(); } catch (err) { console.error("tema novo:", err); } };
    novo.__tn = 1; window.montarSidebar = novo;
  }
  emboloMontarSidebar();
  document.addEventListener("DOMContentLoaded", () => {
    emboloMontarSidebar();
    saudar();
    if (typeof window.destacar === "function") window.destacar = destacarSuave;
    $$(".segmentado").forEach(segmentado);
    $$(".grafico-bloco[data-dinamico]").forEach(seguirMouse);
    new MutationObserver((muts) => muts.forEach((mu) => mu.addedNodes.forEach((n) => {
      varre(n);
      if (n.nodeType === 1) { if (n.matches(".grafico-bloco[data-dinamico]")) seguirMouse(n); $$(".grafico-bloco[data-dinamico]", n).forEach(seguirMouse); }
    }))).observe(document.body, { childList: true, subtree: true });
    $$("svg").forEach((s) => requestAnimationFrame(() => revela(s)));
  });
})();
