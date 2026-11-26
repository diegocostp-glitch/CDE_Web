/* Visão Geral do tema novo — a ideia do menu Reports: cada bloco pequeno é uma aba. O bloco escolhido fica escuro e abre,
   logo abaixo, o gráfico e os números dele, sempre os do mês e da casa que estão na tela.
   Entra DEPOIS do overview.js: troca insights() e graficosMes() pelas versões deste arquivo. */
(function () {
  "use strict";
  const SEL_KEY = "cde_rp_sel";
  let sel = 0, periodo = "tudo", ctrl = null, tipo = null;
  try { sel = +sessionStorage.getItem(SEL_KEY) || 0; } catch (e) {}
  const $ = (s, r = document) => r.querySelector(s);
  const E = (s) => (typeof esc === "function" ? esc(s) : String(s));

  function formatador(it) {
    const r = it.rotulo || "";
    if (/^Faturamento|^Consumo de insumo$/.test(r)) return { fmt: (v) => curto(v), eixo: (v) => curto(v) };
    if (/^Insumo consumido/.test(r)) return { fmt: (v) => parte(v), eixo: (v) => parte(v) };
    const un = (String(it.valor).match(/[A-Za-zÀ-ÿ.]+$/) || [""])[0];
    return { fmt: (v) => fmt(v, 1) + (un ? " " + un : ""), eixo: (v) => fmt(v, 0) };
  }
  const tomDe = (i) => i.tom ? i.tom : i.delta === null || i.delta === undefined ? "neutro" : (i.delta > 0) === !!i.bomSeSobe ? "bom" : "ruim";
  const pilula = (it) => (it.delta === null || it.delta === undefined ? "" : `<span class="ins-pilula ${tomDe(it)}">${it.deltaTxt || pct(it.delta, 0)}</span>`);

  function dadosDoPainel(it) {
    const meses = VISTA.serie_meses || [], rot = meses.map((m) => mesBR(m.mes).slice(0, 3));
    const f = formatador(it);
    if (it.serie && it.serie.filter((v) => isFinite(v)).length >= 2) {
      const n = periodo === "6" ? 6 : rot.length, ini = Math.max(0, rot.length - n);
      const values = it.serie.slice(ini), labels = rot.slice(ini);
      const ok = values.map((v, i) => ({ v, l: labels[i], m: meses[ini + i] })).filter((x) => isFinite(x.v));
      const maior = ok.reduce((a, b) => (b.v > a.v ? b : a)), menor = ok.reduce((a, b) => (b.v < a.v ? b : a));
      const media = ok.reduce((s, x) => s + x.v, 0) / ok.length;
      // o mês de antes do último da curva: fecha a grade de números em 2 × 2
      const ant = ok.length >= 2 ? ok[ok.length - 2] : null;
      return { linha: true, cfg: { labels, values, comp: null, fmt: f.fmt, fmtEixo: f.eixo, aria: it.rotulo,
          titulo: (i) => `${mesBR(meses[ini + i].mes)} — <b>${f.fmt(values[i])}</b>` },
        stats: [["Agora", it.valor, pilula(it)], ["Maior mês", f.fmt(maior.v), maior.l], ["Menor mês", f.fmt(menor.v), menor.l], ["Média do período", f.fmt(media), `${ok.length} meses`],
          ["Mês anterior", ant ? f.fmt(ant.v) : "—", ant ? ant.l : ""]] };
    }
    // sem série mensal (custo do estoque): uma barra por casa
    const por = {};
    (DADOS.estoque || []).forEach((l) => { por[l.casa] = (por[l.casa] || 0) + (l.valor || 0); });
    const casas = Object.keys(por), vals = casas.map((c) => por[c]);
    const nome = (c) => (typeof nomeCasa === "function" ? nomeCasa(c) : c);
    const tot = vals.reduce((a, b) => a + b, 0);
    const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
    return { linha: false, cfg: { labels: casas, values: vals, fmt: (v) => curto(v), fmtEixo: (v) => curto(v), destaque: iMax, aria: it.rotulo,
        titulo: (i) => `${nome(casas[i])}: <b>${curto(vals[i])}</b>` },
      stats: [["Total", curto(tot), ""], ["Maior casa", curto(vals[iMax] || 0), nome(casas[iMax])], ["Menor casa", curto(vals[iMin] || 0), nome(casas[iMin])], ["Contagens", String((DADOS.estoque || []).length), "linhas de insumo"],
        ["Média por casa", curto(casas.length ? tot / casas.length : 0), `${casas.length} casas`]] };
  }

  function desenha(it, animar) {
    const host = $("#rp"); if (!host) return;
    const d = dadosDoPainel(it), tipoNovo = d.linha ? "linha" : "barras";
    const cab = `<div class="rp-cab"><div><h2>${E(it.rotulo)}</h2><p class="fonte">${E(it.contexto)}</p></div>
      <div class="rp-ctl">${d.linha ? `<div class="segmentado" id="rp-per"><button data-p="6"${periodo === "6" ? ' class="ativo"' : ""}>6 meses</button><button data-p="tudo"${periodo === "tudo" ? ' class="ativo"' : ""}>Tudo</button></div>` : ""}
        ${it.alvo ? `<button class="botao" id="rp-det" type="button">Ver detalhes</button>` : ""}</div></div>`;
    const nums = `<div class="rp-nums">${d.stats.map((s, i) => `<div class="rp-num${i === 0 ? " dest" : ""}"><small>${s[0]}</small><b>${E(s[1])}</b><span>${s[2] || ""}</span></div>`).join("")}</div>`;
    if (ctrl && tipo === "linha" && tipoNovo === "linha" && $("#rp-graf") && animar) {
      $("#rp .rp-cab h2").textContent = it.rotulo; $("#rp .rp-cab .fonte").textContent = it.contexto;
      $("#rp .rp-nums").outerHTML = nums;
      ctrl.update(d.cfg); return;
    }
    host.innerHTML = cab + `<div class="rp-corpo"><div class="rp-graf" id="rp-graf"></div>${nums}</div>`;
    tipo = tipoNovo;
    ctrl = d.linha ? TNChart.linha($("#rp-graf"), d.cfg) : TNChart.barras($("#rp-graf"), d.cfg);
    const per = $("#rp-per");
    if (per) per.addEventListener("click", (e) => { const b = e.target.closest("button[data-p]"); if (!b) return; periodo = b.dataset.p; desenha(destaques()[sel], true); });
    const det = $("#rp-det");
    if (det) det.addEventListener("click", () => abrirSecao(it.alvo));
  }

  function escolher(i) {
    sel = i; try { sessionStorage.setItem(SEL_KEY, String(i)); } catch (e) {}
    document.querySelectorAll("#insights .ins").forEach((c, k) => { c.classList.toggle("sel", k === i); c.setAttribute("aria-pressed", k === i); });
    desenha(destaques()[i], true);
  }

  function montaPainel() {
    const lista = destaques(); if (!lista.length) return;
    if (sel >= lista.length) sel = 0;
    document.querySelectorAll("#insights .ins").forEach((c, i) => {
      c.classList.add("rp-bloco"); c.classList.toggle("sel", i === sel);
      c.setAttribute("role", "button"); c.setAttribute("aria-pressed", i === sel); c.tabIndex = 0;
      c.onclick = () => escolher(i);
      c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(i); } };
    });
    let host = $("#rp");
    if (!host) { host = document.createElement("section"); host.id = "rp"; host.className = "cartao rp"; $("#insights").after(host); }
    ctrl = null; tipo = null;
    desenha(lista[sel], false);
  }

  const insightsOriginal = window.insights;
  window.insights = function () { insightsOriginal(); try { montaPainel(); } catch (err) { console.error("tema novo (visão geral):", err); } };

  // "Evolução do grupo": as duas curvas no desenho do tema novo
  window.graficosMes = function () {
    const host = $("#graficos-mes"), s = VISTA.serie_meses || [];
    if (s.length < 2) { host.innerHTML = '<p class="vazio">Poucos meses para desenhar a curva.</p>'; return; }
    const labels = s.map((m) => mesBR(m.mes).slice(0, 3));
    host.innerHTML = `<div class="tc-duplo"><div class="tc-bloco"><h3>Faturamento (Bruto) do grupo por mês</h3><div id="tcg-fat"></div></div>
      <div class="tc-bloco"><h3>Consumo de insumo sobre o Faturamento (Bruto)</h3><div id="tcg-peso"></div></div></div>
      <p class="fonte tc-nota">O último mês pode estar em curso — a curva sobe de novo quando o mês fecha.</p>`;
    // desenha na largura que o bloco tem: o texto dos eixos sai no tamanho real
    const largura = Math.max(360, Math.round($("#tcg-fat").clientWidth || 760));
    TNChart.linha($("#tcg-fat"), { labels, values: s.map((m) => m.faturamento),
      fmt: (v) => curto(v), fmtEixo: (v) => curto(v), aria: "Faturamento por mês", altura: 340, largura,
      titulo: (i) => `${mesBR(s[i].mes)} — <b>${reais(s[i].faturamento)}</b>` });
    TNChart.linha($("#tcg-peso"), { labels, values: s.map((m) => (m.peso === null || m.peso === undefined ? NaN : m.peso * 100)),
      fmt: (v) => fmt(v, 1) + "%", fmtEixo: (v) => fmt(v, 0) + "%", aria: "Insumo sobre faturamento por mês", altura: 340, largura,
      titulo: (i) => `${mesBR(s[i].mes)} — <b>${parte(s[i].peso)}</b> do faturamento bruto em insumo` });
  };

  let larguraEvolucao = 0, tEvolucao = null;
  window.addEventListener("resize", () => {
    clearTimeout(tEvolucao);
    tEvolucao = setTimeout(() => {
      const el = $("#tcg-fat");
      if (!el || typeof VISTA === "undefined" || !VISTA) return;
      if (Math.abs(el.clientWidth - larguraEvolucao) < 40) return;
      larguraEvolucao = el.clientWidth;
      window.graficosMes();
    }, 200);
  });

  // se a tela já desenhou antes deste arquivo carregar, desenha de novo com o tema
  if (typeof VISTA !== "undefined" && VISTA) { window.insights(); window.graficosMes(); }
})();
