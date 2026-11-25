/* Novo visual do CDE — motor dos 3 modelos (menu lateral, transições, Visão Geral, gráfico do Painel, busca).
   Só lê dados.js dos modelos anteriores; não grava nada, não fala com o servidor. */
(function () {
  "use strict";
  const H = document.documentElement;
  const M = H.dataset.m || "a";
  const TRANS = { a: "fade", b: "eixo", c: "cortina", d: "suave" }[M];
  H.dataset.trans = TRANS;
  const D = window.DADOS, R = window.RESUMO;
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reais = (n, d = 0) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (n, d = 1) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pc = (v, d = 1) => num(v * 100, d) + "%";
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // palavra no lugar de símbolo (regra do Mono)
  const vs = (v, ref = "") => (v > 0.005 ? `${Math.round(v * 100)}% acima` : v < -0.005 ? `${Math.round(-v * 100)}% abaixo` : "Igual") + ref;
  const tagVs = (v, invertido) => { // invertido: para custo, subir é ruim
    const bom = invertido ? v < -0.005 : v > 0.005, ruim = invertido ? v > 0.005 : v < -0.005;
    return `<span class="tag ${bom ? "bom" : ruim ? "ruim" : ""}">${vs(v)}</span>`;
  };
  const ini = (n) => n.split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const CASAS = { SL: "Senador Lemos", DC: "Duque de Caxias", DLU: "Delivery Umarizal", DLCN: "Delivery Cidade Nova" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  const P = { // ícones (traço de 24)
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    cart: '<path d="M4 5h2l2 11h10l2-8H7"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    tool: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8v.1"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    chev: '<path d="m9.5 6 6 6-6 6"/>',
    side: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M16 10l-2 2 2 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    file: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
  };
  const ic = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[k]}</svg>`;

  // ---------- menu (as mesmas telas do CDE) ----------
  const nOrdens = D.ordens_pendentes.length;
  const MENU = [
    { grp: "Início", itens: [
      { id: "overview", t: "Visão Geral", i: "grid" },
      { id: "painel", t: "Painel de Consumo", i: "chart" }] },
    { grp: "Operação", itens: [
      { id: "estoque", t: "Estoque", i: "box", subs: [
        { id: "lancamento", t: "Lançamento Diário" }, { id: "contagem_diaria", t: "Contagem diária" },
        { id: "contagem_semanal", t: "Contagem semanal" }, { id: "movimentacoes", t: "Movimentações" }] },
      { id: "compras_g", t: "Compras", i: "cart", n: nOrdens, subs: [
        { id: "compras", t: "Projeção de Compras" }, { id: "ordens", t: "Ordens de Compras", n: nOrdens },
        { id: "recebimento", t: "Recebimento de Salmão" }, { id: "cadastros", t: "Cadastros" }] }] },
    { grp: "Utilitários", itens: [
      { id: "conversao", t: "Conversão de Salmão", i: "tool" },
      { id: "qualidade", t: "Avaliação de Qualidade", i: "check" }] }
  ];
  const ORDEM = []; // ordem plana, para o sentido da transição
  MENU.forEach((g) => g.itens.forEach((it) => (it.subs ? it.subs.forEach((s) => ORDEM.push(s.id)) : ORDEM.push(it.id))));
  ORDEM.push("parametros", "ajuda");
  const TITULO = {};
  MENU.forEach((g) => g.itens.forEach((it) => (it.subs ? it.subs.forEach((s) => (TITULO[s.id] = s.t)) : (TITULO[it.id] = it.t))));
  TITULO.parametros = "Configurações"; TITULO.ajuda = "Ajuda";
  const PAI = {}; MENU.forEach((g) => g.itens.forEach((it) => it.subs && it.subs.forEach((s) => (PAI[s.id] = it.id))));

  function montaCasca() {
    const grupos = MENU.map((g) => `<span class="snav__grp">${g.grp}</span>` + g.itens.map((it) => {
      if (!it.subs) return `<a class="snav__item" href="#/${it.id}" data-id="${it.id}" data-tip="${esc(it.t)}">${ic(it.i)}<span class="snav__label">${it.t}</span></a>`;
      return `<button class="snav__item" type="button" data-g="${it.id}" aria-expanded="false" data-tip="${esc(it.t)}">${ic(it.i)}<span class="snav__label">${it.t}</span>${it.n ? `<span class="snav__count">${it.n}</span>` : ""}${ic("chev").replace('class="ico"', 'class="ico snav__chev"')}</button>
        <div class="snav__subs" data-subs="${it.id}"><div>${it.subs.map((s) => `<a href="#/${s.id}" data-id="${s.id}">${s.t}${s.n ? ` <span class="snav__count" style="margin-left:auto">${s.n}</span>` : ""}</a>`).join("")}</div></div>`;
    }).join("")).join("");
    document.body.innerHTML = `<div class="shell">
      <aside class="side" aria-label="Menu">
        <div class="side__head"><a class="brand" href="#/overview"><span class="mark">C</span><span class="brand__t"><b>CDE</b><small>Sushi Boulevard</small></span></a>
          <button class="collapse" id="recolher" aria-label="Recolher menu" aria-keyshortcuts="[">${ic("side")}</button></div>
        <button class="side__search" id="abrir-pal" aria-label="Pesquisar">${ic("search")}<span>Pesquisar…</span><span class="kbd">Ctrl K</span></button>
        <nav class="snav" id="snav" aria-label="Telas"><span class="snav__pill" id="pill"></span>${grupos}
          <div style="margin-top:auto;padding-top:8px;display:flex;flex-direction:column;gap:2px">
            <a class="snav__item" href="#/parametros" data-id="parametros" data-tip="Configurações">${ic("gear")}<span class="snav__label">Configurações</span></a>
            <a class="snav__item" href="#/ajuda" data-id="ajuda" data-tip="Ajuda">${ic("help")}<span class="snav__label">Ajuda</span></a></div></nav>
        <div class="side__foot"><button class="me" type="button"><span class="av">SU</span><span class="me__t"><b>Suprimentos</b><small>Rede Sushi Boulevard</small></span></button></div>
      </aside>
      <main class="main"><div class="top"><div class="crumb"><span>Centurion</span>${ic("chev").replace('class="ico"', 'class="ico" style="width:14px;height:14px"')}<b id="crumb">Visão Geral</b></div>
        <span class="pillbox"><span class="dot"></span>Dados de ${brData(D.data)}</span>
        <button class="ibtn" id="tema" aria-label="Trocar tema" title="Claro, Escuro e Mono"></button>
        <a class="btn btn--dark" href="#/ordens">${ic("cart")}Ordens (${nOrdens})</a></div>
        <div id="conteudo" tabindex="-1"></div></main></div>
      <div class="pal" id="pal" role="dialog" aria-label="Pesquisar"><div class="pal__box"><label class="pal__in">${ic("search")}<input id="pal-in" placeholder="Pesquisar tela, insumo ou casa…" autocomplete="off"></label><div class="pal__list" id="pal-list"></div></div></div>`;
  }
  const brData = (iso) => iso.split("-").reverse().join("/");

  // ---------- pílula que desliza + menu ----------
  function movePill() {
    const nav = $("#snav"), pill = $("#pill"); if (!nav) return;
    const id = (location.hash.replace("#/", "") || "overview").split("?")[0];
    let alvo = $(`#snav a[data-id="${id}"]`);
    if (!alvo) return void (pill.style.opacity = 0);
    const grupo = PAI[id]; if (grupo && (H.classList.contains("rail") || matchMedia("(max-width:760px)").matches)) alvo = $(`#snav [data-g="${grupo}"]`) || alvo;
    const nr = nav.getBoundingClientRect(), r = alvo.getBoundingClientRect();
    pill.style.height = r.height + "px";
    pill.style.transform = `translateY(${r.top - nr.top + nav.scrollTop}px)`;
    pill.style.opacity = 1;
  }
  function abreGrupo(g, abrir) {
    const b = $(`[data-g="${g}"]`), s = $(`[data-subs="${g}"]`); if (!b) return;
    b.setAttribute("aria-expanded", abrir); s.classList.toggle("open", abrir);
  }
  // ---------- painel que abre ao passar o mouse no menu recolhido ----------
  const FLY = { el: null, on: null, pin: false, fecha: 0, intencao: 0 };
  const noTrilho = () => H.classList.contains("rail") || matchMedia("(max-width:760px)").matches;
  function fechaFly() { clearTimeout(FLY.fecha); clearTimeout(FLY.intencao); if (FLY.el) FLY.el.remove(); FLY.el = null; FLY.on = null; FLY.pin = false; $$("[data-g][aria-expanded=true]").forEach((b) => noTrilho() && b.setAttribute("aria-expanded", "false")); }
  function agendaFecha() { clearTimeout(FLY.fecha); FLY.fecha = setTimeout(() => { if (!FLY.pin) fechaFly(); }, 240); }
  function abreFly(item, fixar) {
    if (!noTrilho()) return;
    clearTimeout(FLY.fecha);
    if (FLY.on === item && FLY.el) { if (fixar) { FLY.pin = !FLY.pin; if (!FLY.pin) fechaFly(); } return; }
    if (FLY.el) FLY.el.remove();
    FLY.on = item; FLY.pin = !!fixar;
    const g = item.dataset.g, r = item.getBoundingClientRect(), el = document.createElement("div");
    const grupo = g && MENU.flatMap((x) => x.itens).find((i) => i.id === g), id = (location.hash.replace("#/", "") || "overview").split("?")[0];
    el.className = "fly" + (grupo ? "" : " fly--tip");
    el.setAttribute("role", grupo ? "menu" : "tooltip");
    el.innerHTML = grupo
      ? `<div class="fly__in"><div class="fly__t">${grupo.t}</div>${grupo.subs.map((s) => `<a role="menuitem" href="#/${s.id}"${s.id === id ? ' aria-current="page"' : ""}>${s.t}${s.n ? `<span class="snav__count" style="margin-left:auto">${s.n}</span>` : ""}</a>`).join("")}</div>`
      : `<div class="fly__in">${esc(item.dataset.tip || "")}</div>`;
    document.body.appendChild(el);
    el.style.left = r.right - 2 + "px";
    el.style.top = Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, r.top - (grupo ? 8 : -2))) + "px";
    el.addEventListener("mouseenter", () => clearTimeout(FLY.fecha));
    el.addEventListener("mouseleave", agendaFecha);
    el.addEventListener("click", (e) => { if (e.target.closest("a")) fechaFly(); });
    FLY.el = el;
    if (grupo) item.setAttribute("aria-expanded", "true");
  }
  function ligaMenu() {
    $$("#snav .snav__item").forEach((it) => {
      it.addEventListener("mouseenter", () => { clearTimeout(FLY.fecha); clearTimeout(FLY.intencao); FLY.intencao = setTimeout(() => abreFly(it, false), FLY.el ? 0 : 70); });
      it.addEventListener("mouseleave", () => { clearTimeout(FLY.intencao); agendaFecha(); });
      it.addEventListener("focus", () => abreFly(it, false));
    });
    $$("[data-g]").forEach((b) => b.addEventListener("click", () => {
      if (noTrilho()) { abreFly(b, true); return; }
      abreGrupo(b.dataset.g, b.getAttribute("aria-expanded") !== "true");
      const t0 = performance.now(); (function seguir() { movePill(); if (performance.now() - t0 < 450) requestAnimationFrame(seguir); })();
    }));
    $("#recolher").addEventListener("click", alternaRail);
    $("#snav").addEventListener("scroll", movePill);
    addEventListener("resize", movePill);
  }
  function alternaRail() {
    fechaFly();
    H.classList.toggle("rail");
    try { localStorage.setItem("nv_rail_" + M, H.classList.contains("rail") ? "1" : "0"); } catch (e) {}
    const t0 = performance.now(); (function seguir() { movePill(); if (performance.now() - t0 < 450) requestAnimationFrame(seguir); })();
  }

  // ---------- tema, com o círculo do Scenra ----------
  const TEMAS = ["light", "dark", "mono"], ICO_T = { light: "sun", dark: "moon", mono: "half" };
  function aplicaTema(t) { H.dataset.th = t; $("#tema").innerHTML = ic(ICO_T[t]); try { localStorage.setItem("nv_tema_" + M, t); } catch (e) {} }
  function trocaTema(ev) {
    const prox = TEMAS[(TEMAS.indexOf(H.dataset.th) + 1) % 3];
    if (!document.startViewTransition || reduz) return aplicaTema(prox);
    const b = ev.currentTarget.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    H.classList.add("vt-tema");
    const vt = document.startViewTransition(() => aplicaTema(prox));
    vt.ready.then(() => H.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 450, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    vt.finished.finally(() => H.classList.remove("vt-tema"));
  }

  // ---------- componentes: segmentado, busca ----------
  function segHTML(id, ops, sel) { return `<div class="seg" id="${id}" role="group"><span class="seg__thumb"></span>${ops.map((o) => `<button type="button" data-k="${o.k}" aria-pressed="${o.k === sel}">${o.l}</button>`).join("")}</div>`; }
  function segWire(id, cb) {
    const el = $("#" + id); if (!el) return;
    const thumb = $(".seg__thumb", el);
    const pos = () => { const b = $('[aria-pressed="true"]', el); if (!b) return; thumb.style.width = b.offsetWidth + "px"; thumb.style.transform = `translateX(${b.offsetLeft}px)`; };
    $$("button", el).forEach((b) => b.addEventListener("click", () => { $$("button", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); pos(); cb(b.dataset.k); }));
    thumb.style.transition = "none"; pos(); requestAnimationFrame(() => (thumb.style.transition = ""));
  }
  // O modelo de busca do vídeo: campo com lupa e limpar, lista suspensa de filtro e pílulas; filtra enquanto digita.
  function buscaHTML(o) {
    return `<div class="find" id="${o.id}"><div class="find__in">${ic("search")}<input type="search" placeholder="${esc(o.ph)}" aria-label="${esc(o.ph)}"><button type="button" class="find__x" aria-label="Limpar">${ic("x").replace('class="ico"', 'class="ico" style="position:static;transform:none;width:14px;height:14px"')}</button></div>
      ${o.sel ? `<select aria-label="${esc(o.sel.rot)}"><option value="">${esc(o.sel.rot)}</option>${o.sel.vals.map((v) => `<option>${esc(v)}</option>`).join("")}</select>` : ""}
      <span class="find__n" aria-live="polite"></span>${o.seg ? segHTML(o.id + "-seg", o.seg.ops, o.seg.ops[0].k) : ""}</div>`;
  }
  function buscaLiga(o) {
    const raiz = $("#" + o.id), inp = $("input", raiz), sel = $("select", raiz), x = $(".find__x", raiz), n = $(".find__n", raiz);
    let segK = o.seg ? o.seg.ops[0].k : null;
    const alvo = $(o.alvo);
    const aplica = () => {
      const q = norm(inp.value.trim()), s = sel ? sel.value : "";
      raiz.querySelector(".find__in").classList.toggle("has", !!q);
      const rows = o.itens.filter((it) => (!q || norm(o.texto(it)).includes(q)) && (!s || o.sel.de(it) === s) && (!o.seg || o.seg.ops.find((p) => p.k === segK).ok(it)));
      alvo.innerHTML = rows.length ? rows.slice(0, o.max || 80).map((r, i) => o.linha(r).replace("<tr", `<tr style="animation:rise .4s var(--ease) both;animation-delay:${Math.min(i, 10) * 25}ms"`)).join("")
        : `<tr><td colspan="9" class="empty">Nada encontrado${q ? ` para “${esc(inp.value.trim())}”` : ""}</td></tr>`;
      n.textContent = `${rows.length} de ${o.itens.length}`;
    };
    inp.addEventListener("input", aplica);
    if (sel) sel.addEventListener("change", aplica);
    x.addEventListener("click", () => { inp.value = ""; inp.focus(); aplica(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") { inp.value = ""; aplica(); } });
    if (o.seg) segWire(o.id + "-seg", (k) => { segK = k; aplica(); });
    aplica();
  }

  // ---------- telas ----------
  const casaVal = (casa, ob) => (ob || {})[casa] || 0;
  function kpis() {
    const f = D.faturamento_total, c = D.consumo_valor, r = c / f, ra = D.consumo_valor_anterior / D.faturamento_anterior;
    return { f, c, r, ra, vf: f / D.faturamento_anterior - 1, vc: c / D.consumo_valor_anterior - 1 };
  }
  const barra = (v, max) => `<div class="bar"><i data-w="${Math.max(2, Math.min(100, (v / max) * 100))}"></i></div>`;

  // Modelo D: primeiro o que pede decisão, depois os números de apoio; tudo em tamanho de leitura
  function overviewD(k, hoje, ords, totOrd, baixos) {
    const forn = [...new Set(ords.map((o) => o.fornecedor))].join(" e "), zer = baixos.filter((e) => e.dias_cobertura === 0).length;
    const proximos = baixos.filter((e) => e.dias_cobertura > 0).sort((a, b) => a.dias_cobertura - b.dias_cobertura);
    const desv = R.divergencias, valDesv = desv.reduce((a, d) => a + Math.abs(d.reais), 0);
    const acoes = [
      { t: `Aprovar ${ords.length} ordens`, d: `${reais(totOrd)} com ${forn}, entrega em 19/11`, go: "#/ordens", b: "Aprovar" },
      { t: `Repor ${baixos.length} itens abaixo do mínimo`, d: `${zer} zerados; os demais acabam em até ${num(proximos[proximos.length - 1].dias_cobertura)} dias`, go: "#/compras", b: "Ver itens" },
      { t: `Conferir ${desv.length} desvios de consumo`, d: `${reais(valDesv)} em jogo no fechamento de ontem`, go: "#/painel", b: "Conferir" }];
    const casas = D.participacao.map((p) => {
      const cons = casaVal(p.casa, D.consumo_valor_por_casa), ant = casaVal(p.casa, D.consumo_valor_anterior_por_casa), h = hoje.casas.find((c) => c.casa === p.casa);
      return `<tr><td><b>${p.nome}</b></td><td class="r num">${reais(p.valor)}</td><td class="r num">${reais(cons)}</td><td class="r num">${pc(cons / p.valor)}</td><td class="r">${tagVs(cons / ant - 1, true)}</td><td class="r">${h ? tagVs(h.var_mesmo_dia) : ""}</td></tr>`;
    }).join("");
    return `<div class="page-h"><div><h1>Visão Geral</h1><p>${R.semana}, ${brData(R.data)} · dados do fechamento</p></div>
        <div class="acts"><a class="btn" href="#/painel">Ver consumo</a><a class="btn btn--pri" href="#/ordens">Aprovar ordens</a></div></div>
      <div class="grid g4">
        <div class="tile"><small>Faturamento no mês</small><span class="big num">${reais(k.f)}</span><span class="foot">${vs(k.vf)} que o mesmo período de outubro</span></div>
        <div class="tile"><small>Consumo no mês</small><span class="big num">${reais(k.c)}</span><span class="foot">${vs(k.vc)} que o mesmo período de outubro</span></div>
        <div class="tile"><small>Insumo sobre faturamento</small><span class="big num">${pc(k.r)}</span><span class="foot">outubro: ${pc(k.ra)} no mesmo período</span></div>
        <div class="tile"><small>Ordens esperando</small><span class="big num">${ords.length}</span><span class="foot">${reais(totOrd)} a aprovar</span></div></div>
      <div class="grid g21" style="margin-top:14px;align-items:start">
        <div class="grid" style="gap:14px">
          <div class="card"><h2>Casa por casa no mês</h2><p class="sub">Até ${D.dia_limite}/11, contra o mesmo período de outubro</p>
            <table class="tbl" style="margin-top:6px"><thead><tr><th>Casa</th><th class="r">Faturamento</th><th class="r">Consumo</th><th class="r">Insumo / fat.</th><th class="r">Consumo vs. out.</th><th class="r">Hoje</th></tr></thead><tbody>${casas}</tbody></table></div>
          <div class="card"><h2>Acabam primeiro</h2><p class="sub">Itens abaixo do mínimo com menos dias de estoque, em qualquer casa</p>
            <table class="tbl" style="margin-top:6px"><tbody>${proximos.slice(0, 6).map((e) => `<tr><td><b>${esc(e.insumo)}</b></td><td>${esc(e.casa_nome)}</td><td class="r num">${num(e.dias_cobertura)} dias</td><td class="r"><span class="tag ${e.dias_cobertura < 2 ? "ruim" : "aviso"}">${e.dias_cobertura < 2 ? "Pedir hoje" : "Pedir"}</span></td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><h2>Para decidir hoje</h2><p class="sub">Do mais urgente ao menos</p>
          <div class="acts-list">${acoes.map((a) => `<a class="act" href="${a.go}"><span class="act__t"><b>${a.t}</b><span class="sub">${a.d}</span></span><span class="act__b">${a.b}${ic("chev").replace('class="ico"', 'class="ico" style="width:14px;height:14px"')}</span></a>`).join("")}</div></div></div>`;
  }

  function telaOverview() {
    const k = kpis(), hoje = R.faturamento, ords = D.ordens_pendentes, totOrd = ords.reduce((a, o) => a + o.total, 0);
    const baixos = D.estoque.filter((e) => e.situacao === "abaixo");
    if (M === "d") return overviewD(k, hoje, ords, totOrd, baixos);
    const head = `<div class="page-h"><div><h1>${M === "c" ? "Boletim da rede" : "Bom dia, Suprimentos"}</h1><p>${R.semana}, ${brData(R.data)} · ${ords.length} ordens esperando aprovação · ${baixos.length} itens abaixo do mínimo</p></div>
      <div class="acts"><a class="btn" href="#/painel">${ic("chart")}Ver consumo</a><a class="btn btn--pri" href="#/ordens">${ic("cart")}Aprovar ordens</a></div></div>`;
    const tiles = `<div class="grid g4">
      <div class="tile dark"><small>Faturamento no mês</small><span class="big num">${reais(k.f)}</span><span class="foot">${vs(k.vf)} que o mesmo período de outubro</span></div>
      <div class="tile tint"><small>Consumo no mês</small><span class="big num">${reais(k.c)}</span><span class="foot">${vs(k.vc)} que o mesmo período de outubro</span></div>
      <div class="tile"><small>Insumo sobre faturamento</small><span class="big num">${pc(k.r)}</span><span class="foot">outubro: ${pc(k.ra)} no mesmo período</span></div>
      <div class="tile"><small>Ordens esperando</small><span class="big num">${ords.length}</span><span class="foot">${reais(totOrd)} a aprovar</span></div></div>`;
    const casasHoje = `<div class="card"><h2>Hoje nas casas</h2><p class="sub">Faturamento de ${brData(R.data)} contra a média dos mesmos dias</p>
      <table class="tbl" style="margin-top:8px"><tbody>${hoje.casas.map((c) => `<tr><td style="width:44px"><span class="mark" style="width:34px;height:34px;font-size:12px">${c.casa}</span></td>
        <td><b>${c.casa_nome}</b><br><span class="sub">${reais(c.faturamento)}</span></td><td style="width:34%">${barra(c.faturamento, Math.max(...hoje.casas.map((x) => x.faturamento)))}</td>
        <td class="r">${tagVs(c.var_mesmo_dia)}</td></tr>`).join("")}</tbody></table></div>`;
    const prox = `<div class="tile dark" style="border-radius:var(--r-card);padding:20px 22px;gap:10px"><small>Próxima ordem</small>
      ${ords.slice(0, 3).map((o) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line2)"><span><b>${o.fornecedor}</b><br><span style="opacity:.7;font-size:12.5px">${CASAS[o.casa] || o.casa} · entrega ${brData(o.data).slice(0, 5)}</span></span><b class="num">${reais(o.total)}</b></div>`).join("")}
      <a class="btn" style="margin-top:auto;justify-content:center;background:var(--card);color:var(--ink)" href="#/ordens">Abrir ordens</a></div>`;
    const dv = `<div class="card"><h2>Pede ação hoje</h2><p class="sub">Desvios de consumo encontrados no fechamento</p><table class="tbl" style="margin-top:8px"><thead><tr><th>Item</th><th>Casa</th><th class="r">Valor</th></tr></thead><tbody>${R.divergencias.slice(0, 5).map((d) => `<tr><td><b>${esc(d.insumo)}</b><br><span class="sub">${esc(d.titulo)}</span></td><td>${esc(d.casa_nome)}</td><td class="r num">${reais(d.reais)}</td></tr>`).join("")}</tbody></table></div>`;

    if (M === "b") { // cobertura por casa
      const porCasa = Object.keys(CASAS).map((cs) => ({ cs, lista: baixos.filter((e) => e.casa === cs).sort((a, b) => a.dias_cobertura - b.dias_cobertura).slice(0, 5) }));
      const cob = `<div class="card"><h2>Quantos dias cada casa aguenta</h2><p class="sub">Os cinco itens abaixo do mínimo que acabam primeiro, por casa</p>
        <div class="grid g2" style="margin-top:14px;gap:22px">${porCasa.map((c) => `<div><b>${CASAS[c.cs]}</b>${c.lista.map((e) => `<div style="display:grid;grid-template-columns:1fr 70px;gap:4px 12px;margin-top:11px;font-size:13px"><span>${esc(e.insumo)}</span><b class="r num" style="text-align:right">${e.dias_cobertura > 0 ? num(e.dias_cobertura) + " dias" : "Zerado"}</b><div class="bar" style="grid-column:1/3"><i data-w="${Math.min(100, (e.dias_cobertura / e.prazo) * 100)}"></i></div></div>`).join("") || '<p class="sub" style="margin-top:10px">Nada abaixo do mínimo</p>'}</div>`).join("")}</div></div>`;
      return head + tiles + `<div class="grid g21" style="margin-top:14px">${cob}${prox}</div><div style="margin-top:14px">${dv}</div>`;
    }
    if (M === "c") { // boletim
      const lin = D.participacao.map((p) => {
        const cons = casaVal(p.casa, D.consumo_valor_por_casa), ant = casaVal(p.casa, D.consumo_valor_anterior_por_casa);
        return `<tr><td><b>${p.nome}</b></td><td class="r num">${reais(p.valor)}</td><td class="r">${tagVs(p.variacao)}</td><td class="r num">${reais(cons)}</td><td class="r">${tagVs(cons / ant - 1, true)}</td><td class="r num"><b>${pc(cons / p.valor)}</b></td></tr>`;
      }).join("");
      const bol = `<div class="card"><h2>Casa por casa no mês</h2><p class="sub">Até ${D.dia_limite}/11, contra o mesmo período de outubro. Consumo que subiu é lido como ruim.</p>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>Casa</th><th class="r">Faturamento</th><th class="r">Contra outubro</th><th class="r">Consumo</th><th class="r">Contra outubro</th><th class="r">Insumo / fat.</th></tr></thead><tbody>${lin}</tbody></table></div>`;
      const dec = `<div class="card"><h2>Decisões de hoje</h2><ul style="list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:12px">
        <li><b>Aprovar ${ords.length} ordens</b><br><span class="sub">${reais(totOrd)} esperando, ${[...new Set(ords.map((o) => o.fornecedor))].join(" e ")}</span></li>
        <li><b>Repor ${baixos.length} itens</b><br><span class="sub">abaixo do mínimo na rede</span></li>
        <li><b>Conferir ${R.divergencias.length} desvios</b><br><span class="sub">${reais(R.divergencias.reduce((a, d) => a + Math.abs(d.reais), 0))} em jogo</span></li></ul></div>`;
      return head + tiles + `<div class="grid g21" style="margin-top:14px">${bol}${dec}</div>`;
    }
    return head + tiles + `<div class="grid g21" style="margin-top:14px">${casasHoje}${prox}</div><div style="margin-top:14px">${dv}</div>`;
  }

  // ----- Painel de Consumo: o menu do gráfico do vídeo de Reports -----
  const EST = { metrica: "consumo", n: 10, casa: "todas", comp: true };
  function valMes(m) {
    const c = EST.casa;
    if (EST.metrica === "consumo") return c === "todas" ? m.consumo_valor : m.consumo_por_casa[c];
    if (EST.metrica === "fat") return c === "todas" ? m.faturamento : m.por_casa[c];
    return (c === "todas" ? m.consumo_valor / m.faturamento : m.consumo_por_casa[c] / m.por_casa[c]) * 100;
  }
  const fmtV = (v) => (EST.metrica === "razao" ? num(v) + "%" : reais(v));
  const fmtEixo = (v) => (EST.metrica === "razao" ? Math.round(v) + "%" : v >= 1e6 ? num(v / 1e6, 1) + " mi" : Math.round(v / 1e3) + " mil");
  function suave(p) { // curva monotônica (Fritsch–Carlson simplificado)
    const n = p.length; if (n < 3) return p.map((q, i) => (i ? "L" : "M") + q[0] + " " + q[1]).join("");
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${p[i][0] + h} ${p[i][1] + t[i] * h} ${p[i + 1][0] - h} ${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]} ${p[i + 1][1]}`; }
    return d;
  }
  function janela() { // N meses fechados + o mês em andamento
    const s = D.serie_meses, fechados = s.slice(0, -1), atual = s[s.length - 1];
    return { fechados, atual, vis: fechados.slice(-EST.n), ant: fechados.slice(-EST.n * 2, -EST.n) };
  }
  const nomeMes = (m) => MESES[+m.mes.slice(5) - 1];
  // ---- gráfico de linha: o desenho fica no lugar e só os valores se movem ----
  const LN = { W: 760, Ht: 290, L: 58, Rr: 14, T: 14, B: 30 };
  let lnE = null;
  function alvoLinha() {
    const { vis } = janela(), s = D.serie_meses, { Ht, T, B } = LN;
    const ys = vis.map(valMes), comp = vis.map((m) => { const i = s.indexOf(m); return i > 0 ? valMes(s[i - 1]) : null; });
    const todos = ys.concat(comp.filter((v) => v != null)); // a escala conta a comparação sempre, para o eixo não pular ao ligar/desligar
    const mx0 = Math.max(...todos), mn0 = Math.min(...todos), pad = (mx0 - mn0) * .25 || mx0 * .1;
    const rawMax = mx0 + pad, p10 = Math.pow(10, Math.floor(Math.log10(rawMax)) - 1), top = Math.ceil(rawMax / (p10 * 5)) * p10 * 5, bot = Math.max(0, Math.floor((mn0 - pad) / (p10 * 5)) * p10 * 5);
    const Y = (v) => T + (1 - (v - bot) / (top - bot)) * (Ht - T - B);
    return { vis, ys, py: ys.map(Y), pc: comp.map((v) => (v == null ? null : Y(v))), labels: [0, 1, 2, 3, 4].map((i) => fmtEixo(bot + ((top - bot) * i) / 4)) };
  }
  const gx = (i, n) => LN.L + (i * (LN.W - LN.L - LN.Rr)) / (n - 1);
  function pinta(c) {
    const n = c.py.length, pts = c.py.map((y, i) => [gx(i, n), y]), cp = c.pc.map((y, i) => (y == null ? null : [gx(i, n), y])).filter(Boolean);
    const d = suave(pts);
    lnE.ln.setAttribute("d", d);
    lnE.ar.setAttribute("d", d + `L${pts[n - 1][0]} ${LN.Ht - LN.B}L${pts[0][0]} ${LN.Ht - LN.B}Z`);
    if (cp.length > 1) lnE.ln2.setAttribute("d", suave(cp));
  }
  function montaLinha(host, a) {
    const { W, Ht, L, Rr, T, B } = LN, n = a.vis.length;
    const grade = [0, 1, 2, 3, 4].map((i) => { const y = T + (1 - i / 4) * (Ht - T - B); return `<line class="gl" x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}"/><text class="yl" x="${L - 8}" y="${y + 4}" text-anchor="end">${a.labels[i]}</text>`; }).join("");
    const eixoX = a.vis.map((m, i) => `<text x="${gx(i, n)}" y="${Ht - 8}" text-anchor="middle">${nomeMes(m)}</text>`).join("");
    host.innerHTML = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Evolução mensal">${grade}${eixoX}<path class="ar"/><path class="ln2"/><path class="ln"/>
      <line class="cur" y1="${T}" y2="${Ht - B}" style="opacity:0"/><circle class="pt" r="5" style="opacity:0"/><rect class="cap" x="${L}" y="0" width="${W - L - Rr}" height="${Ht}" fill="transparent" style="touch-action:pan-y"/></svg><div class="tip tip--f"></div>`;
    const svg = $("svg", host);
    lnE = { host, svg, n, a, cur: { py: a.py.slice(), pc: a.pc.slice() }, labels: a.labels.slice(), raf: 0, hraf: 0, hx: 0, hs: null, dentro: false, idx: -1, last: 0,
      ln: $(".ln", svg), ln2: $(".ln2", svg), ar: $(".ar", svg), cur_: $(".cur", svg), pt: $(".pt", svg), cap: $(".cap", svg), tip: $(".tip", host), yl: $$(".yl", svg) };
    pinta(lnE.cur);
    host.classList.toggle("sem-comp", !EST.comp);
    // entrada: a linha se desenha uma vez
    if (!reduz) {
      const len = lnE.ln.getTotalLength();
      lnE.ln.style.strokeDasharray = len;
      lnE.ln.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: "cubic-bezier(.22,1,.36,1)" }).onfinish = () => (lnE.ln.style.strokeDasharray = "");
      lnE.ar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: "ease-out" });
    }
    const e = lnE;
    e.cap.addEventListener("pointermove", (ev) => {
      const r = e.svg.getBoundingClientRect();
      e.hx = Math.max(L, Math.min(W - Rr, ((ev.clientX - r.left) / r.width) * W));
      if (e.hs == null) e.hs = e.hx;
      if (!e.dentro) { e.dentro = true; e.cur_.style.opacity = 1; e.pt.style.opacity = 1; e.tip.classList.add("on"); }
      rodaHover(e);
    });
    e.cap.addEventListener("pointerleave", () => { e.dentro = false; e.cur_.style.opacity = 0; e.pt.style.opacity = 0; e.tip.classList.remove("on"); });
  }
  function rodaHover(e) {
    if (e.hraf) return;
    const laco = (t) => {
      const dt = Math.min(64, t - (e.last || t)); e.last = t;
      e.hs += (e.hx - e.hs) * (1 - Math.exp(-dt / 50)); // segue o dedo com um pequeno atraso suave
      const x = e.hs, len = e.ln.getTotalLength(); let lo = 0, hi = len;
      for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (e.ln.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
      const y = e.ln.getPointAtLength(hi).y;
      e.cur_.setAttribute("x1", x); e.cur_.setAttribute("x2", x); e.pt.setAttribute("cx", x); e.pt.setAttribute("cy", y);
      const n = e.a.vis.length, i = Math.max(0, Math.min(n - 1, Math.round(((x - LN.L) / (LN.W - LN.L - LN.Rr)) * (n - 1))));
      if (i !== e.idx) {
        e.idx = i; const m = e.a.vis[i], k = D.serie_meses.indexOf(m), ant = k > 0 ? valMes(D.serie_meses[k - 1]) : null;
        e.tip.innerHTML = `${nomeMes(m)}: <b>${fmtV(e.a.ys[i])}</b>${ant ? " · " + vs(e.a.ys[i] / ant - 1, " que o mês anterior") : ""}`;
      }
      const r = e.host.getBoundingClientRect(), sx = r.width / LN.W, sy = r.height / LN.Ht, tw = e.tip.offsetWidth;
      const px = Math.max(tw / 2 + 4, Math.min(r.width - tw / 2 - 4, x * sx));
      e.tip.style.transform = `translate3d(${px}px,${Math.max(30, y * sy - 14)}px,0) translate(-50%,-100%)`;
      if (e.dentro || Math.abs(e.hx - e.hs) > .15) e.hraf = requestAnimationFrame(laco); else { e.hraf = 0; e.last = 0; }
    };
    e.hraf = requestAnimationFrame(laco);
  }
  function desenhaLinha() {
    const host = $("#g-linha"); if (!host) return;
    const a = alvoLinha();
    if (!lnE || lnE.host !== host || !host.isConnected || a.vis.length !== lnE.n) return montaLinha(host, a);
    const e = lnE; cancelAnimationFrame(e.raf);
    const from = { py: e.cur.py.slice(), pc: e.cur.pc.slice() }, lf = e.labels.slice(), t0 = performance.now(), dur = reduz ? 1 : 560;
    e.a = a; e.idx = -1; // força o balão a reescrever o valor novo
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur), q = 1 - Math.pow(1 - k, 3);
      e.cur.py = from.py.map((v, i) => v + (a.py[i] - v) * q);
      e.cur.pc = from.pc.map((v, i) => (a.pc[i] == null ? null : v == null ? a.pc[i] : v + (a.pc[i] - v) * q));
      pinta(e.cur);
      e.yl.forEach((tx, i) => { const mudou = lf[i] !== a.labels[i]; tx.textContent = q < .5 ? lf[i] : a.labels[i]; tx.style.opacity = mudou ? Math.abs(2 * q - 1) : 1; });
      if (k < 1) e.raf = requestAnimationFrame(passo); else { e.labels = a.labels.slice(); e.yl.forEach((tx) => (tx.style.opacity = 1)); }
    };
    e.raf = requestAnimationFrame(passo);
    if (e.dentro) rodaHover(e);
  }
  function ligaComp(on) { if (lnE && lnE.host.isConnected) lnE.host.classList.toggle("sem-comp", !on); }
  // barras por casa: as mesmas barras mudam de altura (transição de CSS), sem recriar
  function desenhaBarras() {
    const host = $("#g-barras"); if (!host) return;
    const atual = D.serie_meses[D.serie_meses.length - 1], ks = Object.keys(CASAS);
    const val = (c) => EST.metrica === "consumo" ? atual.consumo_por_casa[c] : EST.metrica === "fat" ? atual.por_casa[c] : (atual.consumo_por_casa[c] / atual.por_casa[c]) * 100;
    const vals = ks.map(val), mx = Math.max(...vals) * 1.15, W = 360, Ht = 260, L = 8, B = 30, bw = 52, gap = (W - L * 2 - bw * ks.length) / (ks.length - 1);
    const alt = (v) => Math.max(4, (v / mx) * (Ht - B - 10));
    let novo = false;
    if (!$("svg", host)) {
      novo = true;
      host.innerHTML = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Por casa, mês em andamento"><line class="gl" x1="0" x2="${W}" y1="${Ht - B}" y2="${Ht - B}"/>${ks.map((c, i) => `<rect class="bx" data-i="${i}" x="${L + i * (bw + gap)}" width="${bw}" rx="9" style="y:${Ht - B - 4}px;height:4px"/><text x="${L + i * (bw + gap) + bw / 2}" y="${Ht - 10}" text-anchor="middle">${c}</text>`).join("")}</svg><div class="tip" id="tip-b"></div>`;
      const tip = $("#tip-b");
      $$(".bx", host).forEach((r) => {
        r.addEventListener("pointermove", () => { const i = +r.dataset.i; tip.textContent = `${CASAS[ks[i]]}: ${fmtV(host._vals[i])}`; tip.style.left = ((+r.getAttribute("x") + bw / 2) / W) * 100 + "%"; tip.style.top = ((Ht - B - alt(host._vals[i])) / Ht) * 100 + "%"; tip.classList.add("on"); });
        r.addEventListener("pointerleave", () => tip.classList.remove("on"));
      });
    }
    host._vals = vals;
    const aplica = () => $$(".bx", host).forEach((r, i) => { const h = alt(vals[i]); r.style.height = h + "px"; r.style.y = Ht - B - h + "px"; r.classList.toggle("hi", EST.casa === ks[i]); r.style.opacity = EST.casa !== "todas" && EST.casa !== ks[i] ? .4 : ""; });
    if (novo) requestAnimationFrame(() => requestAnimationFrame(aplica)); else aplica();
  }
  let ultimoTotal = null;
  function totalCard() {
    const { fechados } = janela(), a = fechados.slice(-EST.n), b = fechados.slice(-EST.n * 2, -EST.n);
    const soma = (arr) => (EST.metrica === "razao" ? arr.reduce((s, m) => s + valMes(m), 0) / arr.length : arr.reduce((s, m) => s + valMes(m), 0));
    const t = soma(a), t0 = b.length === a.length ? soma(b) : null;
    const melhor = a.reduce((x, m) => (valMes(m) > valMes(x) ? m : x)), pior = a.reduce((x, m) => (valMes(m) < valMes(x) ? m : x));
    const rot = { consumo: "Consumo", fat: "Faturamento", razao: "Insumo sobre faturamento (média)" }[EST.metrica];
    const bom = EST.metrica === "fat" ? t >= t0 : t <= t0;
    $("#g-total").innerHTML = `<small style="font-weight:600;opacity:.8">${rot} · ${EST.n} meses fechados</small><span class="big num" id="g-big">${fmtV(t)}</span>
      ${t0 ? `<span><span class="tag ${bom ? "bom" : "ruim"}">${vs(t / t0 - 1, ` que os ${EST.n} meses antes`)}</span></span>` : ""}
      <div style="margin-top:12px;display:grid;gap:10px;font-size:13px"><div><span style="opacity:.7">Maior mês</span><br><b>${nomeMes(melhor)} · ${fmtV(valMes(melhor))}</b></div><div><span style="opacity:.7">Menor mês</span><br><b>${nomeMes(pior)} · ${fmtV(valMes(pior))}</b></div></div>`;
    const el = $("#g-big"), de = ultimoTotal, mesmaEscala = de != null && EST.metrica === ultimoTotal_m;
    ultimoTotal = t; ultimoTotal_m = EST.metrica;
    if (!reduz && mesmaEscala && de !== t) { // o número corre até o novo valor
      const t0n = performance.now(); (function corre(tm) { const k = Math.min(1, (tm - t0n) / 450), q = 1 - Math.pow(1 - k, 3); el.textContent = fmtV(de + (t - de) * q); if (k < 1) requestAnimationFrame(corre); })(t0n);
    }
  }
  let ultimoTotal_m = null;
  function redesenha() { desenhaLinha(); desenhaBarras(); totalCard(); }

  function telaPainel() {
    const MET = [{ k: "consumo", l: "Consumo" }, { k: "fat", l: "Faturamento" }, { k: "razao", l: "Insumo / fat." }];
    const PER = [{ k: "5", l: "5 meses" }, { k: "10", l: "10 meses" }];
    const CAS = [{ k: "todas", l: "Rede" }].concat(Object.keys(CASAS).map((c) => ({ k: c, l: c })));
    const bOpts = { id: "b-ins", ph: "Pesquisar insumo", alvo: "#t-ins", itens: R.rede, texto: (r) => r.insumo, max: 40,
      sel: { rot: "Todos os desvios", vals: ["Acima do esperado", "Abaixo do esperado"], de: (r) => (r.var > 0.005 ? "Acima do esperado" : "Abaixo do esperado") },
      seg: { ops: [{ k: "t", l: "Todos", ok: () => true }, { k: "r", l: "Mais de R$ 100", ok: (r) => Math.abs(r.reais) >= 100 }, { k: "e", l: "Fora do padrão", ok: (r) => Math.abs(r.var) > 0.15 }] },
      linha: (r) => `<tr><td><b>${esc(r.insumo)}</b></td><td class="r num">${num(r.uso, 1)} ${r.un}</td><td class="r num">${num(r.esperado, 1)} ${r.un}</td><td class="r">${tagVs(r.var, true)}</td><td class="r num"><b>${r.reais < 0 ? "−" : ""}${reais(Math.abs(r.reais))}</b></td></tr>` };
    setTimeout(() => {
      segWire("s-met", (k) => { EST.metrica = k; redesenha(); });
      segWire("s-per", (k) => { EST.n = +k; redesenha(); });
      segWire("s-cas", (k) => { EST.casa = k; redesenha(); });
      $("#t-comp").addEventListener("click", (e) => { EST.comp = !EST.comp; e.currentTarget.setAttribute("aria-pressed", EST.comp); ligaComp(EST.comp); });
      redesenha();
      buscaLiga(bOpts);
    }, 0);
    return `<div class="page-h"><div><h1>Painel de Consumo</h1><p>Como o consumo vira reais, mês a mês e casa a casa</p></div><div class="acts"><button class="btn btn--dark" id="exp">${ic("down")}Exportar CSV</button></div></div>
      <div class="grid g21" style="align-items:start">
        <div class="grid" style="gap:14px"><div class="card"><div class="chart-h">${segHTML("s-met", MET, EST.metrica)}${segHTML("s-cas", CAS, EST.casa)}${segHTML("s-per", PER, String(EST.n))}</div>
          <h2>Evolução mensal</h2><p class="sub">Meses fechados. Passe o dedo ou o mouse na linha para ler o mês. Novembro, ainda em andamento, aparece por casa ao lado</p>
          <div class="chart" id="g-linha" style="margin-top:8px"></div>
          <button class="tog" id="t-comp" type="button" aria-pressed="${EST.comp}" style="margin-top:6px"><i></i>Comparar com o mês anterior</button></div></div>
        <div class="grid" style="gap:14px"><div class="tile tint" id="g-total" style="min-height:230px;padding:20px 22px"></div>
          <div class="card"><h2>Por casa</h2><p class="sub">Mês em andamento, até ${D.dia_limite}/11</p><div class="chart" id="g-barras" style="margin-top:8px"></div></div></div></div>
      <div class="card" style="margin-top:14px"><h2>Consumo do dia por insumo</h2><p class="sub">Uso real contra o esperado, em ${brData(R.data)}</p><div style="margin-top:14px">${buscaHTML(bOpts)}</div>
        <table class="tbl"><thead><tr><th>Insumo</th><th class="r">Uso</th><th class="r">Esperado</th><th class="r">Desvio</th><th class="r">Valor</th></tr></thead><tbody id="t-ins"></tbody></table></div>`;
  }

  function telaCompras() {
    const lista = D.estoque.slice().sort((a, b) => a.dias_cobertura - b.dias_cobertura);
    const tg = { abaixo: "ruim", "no limite": "aviso", ok: "bom", "sem consumo": "" }, nome = { abaixo: "Pedir", "no limite": "No limite", ok: "Em ordem", "sem consumo": "Sem consumo" };
    const bOpts = { id: "b-cmp", ph: "Pesquisar insumo ou casa", alvo: "#t-cmp", itens: lista, texto: (e) => e.insumo + " " + e.casa_nome, max: 60,
      sel: { rot: "Todas as casas", vals: Object.values(CASAS), de: (e) => e.casa_nome },
      seg: { ops: [{ k: "t", l: "Todos", ok: () => true }, { k: "p", l: "Pedir", ok: (e) => e.situacao === "abaixo" }, { k: "l", l: "No limite", ok: (e) => e.situacao === "no limite" }, { k: "o", l: "Em ordem", ok: (e) => e.situacao === "ok" }] },
      linha: (e) => `<tr><td><b>${esc(e.insumo)}</b></td><td>${esc(e.casa_nome)}</td><td class="r num">${num(e.qtd, 1)} ${e.un}</td><td class="r num">${e.dias_cobertura > 0 ? num(e.dias_cobertura) + " dias" : "Zerado"}</td><td class="r num">${e.prazo} dias</td><td class="r"><span class="tag ${tg[e.situacao] || ""}">${nome[e.situacao] || e.situacao}</span></td></tr>` };
    setTimeout(() => buscaLiga(bOpts), 0);
    return `<div class="page-h"><div><h1>Projeção de Compras</h1><p>Quanto cada casa aguenta contra o prazo de entrega</p></div></div>
      <div class="card">${buscaHTML(bOpts)}
      <table class="tbl"><thead><tr><th>Insumo</th><th>Casa</th><th class="r">Em estoque</th><th class="r">Cobertura</th><th class="r">Prazo</th><th class="r">Situação</th></tr></thead><tbody id="t-cmp"></tbody></table></div>`;
  }
  function telaOrdens() {
    const forn = [...new Set(D.ordens_pendentes.map((o) => o.fornecedor))];
    setTimeout(() => buscaLiga({ id: "b-ord", ph: "Pesquisar fornecedor, casa ou item", alvo: "#t-ord", itens: D.ordens_pendentes, texto: (o) => o.fornecedor + " " + (CASAS[o.casa] || o.casa) + " " + o.itens.join(" "),
      sel: { rot: "Todos os fornecedores", vals: forn, de: (o) => o.fornecedor },
      seg: { ops: [{ k: "t", l: "Todas", ok: () => true }, { k: "g", l: "Acima de R$ 4 mil", ok: (o) => o.total > 4000 }] },
      linha: (o) => `<tr><td><b>${o.fornecedor}</b></td><td>${CASAS[o.casa] || o.casa}</td><td>${brData(o.data).slice(0, 5)}</td><td>${esc(o.itens[0])}${o.itens.length > 1 ? ` <span class="tag">+${o.itens.length - 1}</span>` : ""}</td><td class="r num"><b>${reais(o.total)}</b></td><td class="r"><span class="tag aviso">Esperando</span></td></tr>` }), 0);
    return `<div class="page-h"><div><h1>Ordens de Compras</h1><p>${D.ordens_pendentes.length} esperando aprovação · ${reais(D.ordens_pendentes.reduce((a, o) => a + o.total, 0))}</p></div></div>
      <div class="card">${buscaHTML({ id: "b-ord", ph: "Pesquisar fornecedor, casa ou item", sel: { rot: "Todos os fornecedores", vals: forn }, seg: { ops: [{ k: "t", l: "Todas" }, { k: "g", l: "Acima de R$ 4 mil" }] } })}
      <table class="tbl"><thead><tr><th>Fornecedor</th><th>Casa</th><th>Entrega</th><th>Itens</th><th class="r">Total</th><th class="r">Situação</th></tr></thead><tbody id="t-ord"></tbody></table></div>`;
  }
  function telaOutra(id) {
    return `<div class="page-h"><div><h1>${TITULO[id] || id}</h1><p>Mantém o conteúdo de hoje; o modelo mostra só como o menu e a troca de tela ficam.</p></div></div>
      <div class="grid g4">${[1, 2, 3, 4].map((i) => `<div class="tile ${i === 1 ? "dark" : ""}"><small>Bloco ${i}</small><span class="big">—</span></div>`).join("")}</div>
      <div class="card" style="margin-top:14px;min-height:260px"><h2>${TITULO[id] || id}</h2><p class="sub">Tela sem modelo novo nesta rodada.</p></div>`;
  }
  const TELAS = { overview: telaOverview, painel: telaPainel, compras: telaCompras, ordens: telaOrdens };

  // ---------- paleta de pesquisa (botão de pesquisa do vídeo 1) ----------
  function abrePal() { const p = $("#pal"); p.classList.add("on"); const i = $("#pal-in"); i.value = ""; listaPal(""); setTimeout(() => i.focus(), 20); }
  function fechaPal() { $("#pal").classList.remove("on"); }
  let palSel = 0, palItens = [];
  function listaPal(q) {
    q = norm(q.trim());
    const telas = Object.keys(TITULO).map((id) => ({ g: "Telas", t: TITULO[id], d: "Abrir", go: "#/" + id }));
    const ins = R.rede.map((r) => ({ g: "Insumos", t: r.insumo, d: "Consumo do dia", go: "#/painel", q: r.insumo }));
    const cas = Object.keys(CASAS).map((c) => ({ g: "Casas", t: CASAS[c], d: "Ver consumo", go: "#/painel" }));
    palItens = telas.concat(ins, cas).filter((x) => !q || norm(x.t).includes(q)).slice(0, q ? 24 : 12);
    palSel = 0; let g = "";
    $("#pal-list").innerHTML = palItens.length ? palItens.map((x, i) => { const cab = x.g !== g ? `<div class="pal__g">${(g = x.g)}</div>` : ""; return cab + `<button class="pal__it" data-i="${i}" aria-selected="${i === 0}">${ic(x.g === "Telas" ? "file" : x.g === "Casas" ? "grid" : "box")}${esc(x.t)}<small>${x.d}</small></button>`; }).join("") : '<div class="empty">Nada encontrado</div>';
    $$(".pal__it").forEach((b) => b.addEventListener("click", () => abrePalItem(+b.dataset.i)));
  }
  function abrePalItem(i) { const x = palItens[i]; if (!x) return; fechaPal(); location.hash = x.go; }
  function marca(d) { palSel = (palSel + d + palItens.length) % palItens.length; $$(".pal__it").forEach((b, i) => { b.setAttribute("aria-selected", i === palSel); if (i === palSel) b.scrollIntoView({ block: "nearest" }); }); }

  // ---------- roteador com transição ----------
  let atual = null;
  function render(id) {
    fechaFly();
    const f = TELAS[id], c = $("#conteudo");
    c.innerHTML = `<div class="enter">${f ? f() : telaOutra(id)}</div>`;
    $$(".enter > *", c).forEach((e, i) => e.style.setProperty("--i", i));
    $("#crumb").textContent = TITULO[id] || "Visão Geral";
    $$("#snav a[data-id]").forEach((a) => (a.dataset.id === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    if (PAI[id]) abreGrupo(PAI[id], true);
    requestAnimationFrame(() => $$("[data-w]", c).forEach((b) => (b.style.width = b.dataset.w + "%")));
    document.title = (TITULO[id] || "Visão Geral") + " — CDE (novo visual)";
  }
  function rota() {
    const id = (location.hash.replace("#/", "") || "overview").split("?")[0];
    if (id === atual) return;
    H.dataset.dir = ORDEM.indexOf(id) < ORDEM.indexOf(atual) ? "up" : "down";
    const roda = () => { render(id); movePill(); };
    const primeiro = atual === null; atual = id;
    if (primeiro || reduz || !document.startViewTransition) { roda(); setTimeout(movePill, 400); return; }
    document.startViewTransition(roda);
    const t0 = performance.now(); (function seguir() { movePill(); if (performance.now() - t0 < 520) requestAnimationFrame(seguir); })();
  }

  // ---------- partida ----------
  montaCasca();
  let tema = H.dataset.th; try { tema = localStorage.getItem("nv_tema_" + M) || tema; } catch (e) {} aplicaTema(TEMAS.includes(tema) ? tema : "light");
  let rail = H.dataset.rail === "1"; try { const s = localStorage.getItem("nv_rail_" + M); if (s !== null) rail = s === "1"; } catch (e) {} if (rail) H.classList.add("rail");
  ligaMenu();
  $("#tema").addEventListener("click", trocaTema);
  $("#abrir-pal").addEventListener("click", abrePal);
  $("#pal").addEventListener("mousedown", (e) => { if (e.target.id === "pal") fechaPal(); });
  $("#pal-in").addEventListener("input", (e) => listaPal(e.target.value));
  addEventListener("keydown", (e) => {
    const p = $("#pal").classList.contains("on");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); p ? fechaPal() : abrePal(); }
    else if (p && e.key === "Escape") fechaPal();
    else if (e.key === "Escape" && FLY.el) fechaFly();
    else if (p && e.key === "ArrowDown") { e.preventDefault(); marca(1); }
    else if (p && e.key === "ArrowUp") { e.preventDefault(); marca(-1); }
    else if (p && e.key === "Enter") { e.preventDefault(); abrePalItem(palSel); }
    else if (!p && e.key === "[" && !/input|select|textarea/i.test(e.target.tagName)) alternaRail();
  });
  document.addEventListener("click", (e) => { if (FLY.el && !e.target.closest(".fly") && !e.target.closest("#snav")) fechaFly(); if (e.target.closest("#exp")) { const t = document.createElement("div"); t.className = "toast"; t.textContent = "Modelo: a exportação real continua a do sistema."; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); } });
  addEventListener("hashchange", rota);
  rota();
})();
