/* Gráficos do tema novo — o desenho da tela Reports do vídeo: linha suave com área rasa, grade pontilhada com os valores
   à esquerda, linha tracejada de comparação, barras arredondadas com a última em destaque e balão escuro ao apontar.
   Os desenhos ficam no lugar: ao mudar os dados a mesma linha se transforma, e o cursor desliza pela curva. */
(function () {
  "use strict";
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.22,1,.36,1)";
  const $ = (s, r) => r.querySelector(s);

  // curva monotônica: passa pelos pontos sem "estourar" entre eles
  function suave(p) {
    const n = p.length;
    if (n < 2) return "";
    if (n === 2) return `M${p[0][0]} ${p[0][1]}L${p[1][0]} ${p[1][1]}`;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${p[i][0] + h} ${p[i][1] + t[i] * h} ${p[i + 1][0] - h} ${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]} ${p[i + 1][1]}`; }
    return d;
  }

  // escala "bonita" com margem: devolve o mínimo e o máximo do eixo
  function escala(vals, zero) {
    const mx0 = Math.max(...vals), mn0 = Math.min(...vals), pad = (mx0 - mn0) * .22 || Math.abs(mx0) * .1 || 1;
    const raw = mx0 + pad, p10 = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)) - 1), passo = p10 * 5;
    const top = Math.ceil(raw / passo) * passo;
    const bot = zero ? 0 : Math.max(0, Math.floor((mn0 - pad) / passo) * passo);
    return [bot, top === bot ? bot + passo : top];
  }

  // ----------------------------------------------------------------- linha
  function linha(host, cfg) {
    const W = cfg.largura || 760, Ht = cfg.altura || 290, L = 62, R = 14, T = 14, B = 30;
    let st = null; // estado atual do desenho
    const gx = (i, n) => L + (n < 2 ? 0 : (i * (W - L - R)) / (n - 1));

    function alvo(c) {
      const idx = c.values.map((v, i) => i).filter((i) => isFinite(c.values[i]));
      const labels = idx.map((i) => c.labels[i]), ys = idx.map((i) => c.values[i]);
      const comp = c.comp ? idx.map((i) => c.comp[i]) : ys.map(() => null);
      const todos = ys.concat(comp.filter((v) => v != null && isFinite(v)));
      const [bot, top] = escala(todos, c.zero);
      const Y = (v) => T + (1 - (v - bot) / (top - bot)) * (Ht - T - B);
      return { labels, ys, py: ys.map(Y), pc: comp.map((v) => (v == null || !isFinite(v) ? null : Y(v))),
        eixo: [0, 1, 2, 3, 4].map((i) => (c.fmtEixo || c.fmt)(bot + ((top - bot) * i) / 4)), titulos: idx.map((i) => (c.titulo ? c.titulo(i) : null)) };
    }
    function pinta() {
      const n = st.cur.py.length, pts = st.cur.py.map((y, i) => [gx(i, n), y]);
      const d = suave(pts), base = Ht - B;
      st.ln.setAttribute("d", d);
      st.ar.setAttribute("d", d + `L${pts[n - 1][0]} ${base}L${pts[0][0]} ${base}Z`);
      const cp = st.cur.pc.map((y, i) => (y == null ? null : [gx(i, n), y])).filter(Boolean);
      st.ln2.setAttribute("d", cp.length > 1 ? suave(cp) : "");
      const u = pts[n - 1]; st.fim.setAttribute("cx", u[0]); st.fim.setAttribute("cy", u[1]);
    }
    function monta(c) {
      const a = alvo(c), n = a.ys.length;
      const grade = a.eixo.map((tx, i) => { const y = T + (1 - i / 4) * (Ht - T - B); return `<line class="tc-gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="tc-y" x="${L - 10}" y="${y + 4}" text-anchor="end">${tx}</text>`; }).join("");
      const eixoX = a.labels.map((tx, i) => `<text class="tc-x" x="${gx(i, n)}" y="${Ht - 8}" text-anchor="middle">${tx}</text>`).join("");
      host.classList.add("tc"); host.classList.toggle("sem-comp", c.comp === false || !c.comp);
      host.innerHTML = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${(c.aria || "Gráfico").replace(/"/g, "")}">${grade}${eixoX}
        <path class="tc-ar"/><path class="tc-ln2"/><path class="tc-ln"/><circle class="tc-fim" r="4.5"/>
        <line class="tc-cur" y1="${T}" y2="${Ht - B}" style="opacity:0"/><circle class="tc-pt" r="5" style="opacity:0"/>
        <rect class="tc-cap" x="${L}" y="0" width="${W - L - R}" height="${Ht}" fill="transparent" style="touch-action:pan-y"/></svg><div class="tc-tip"></div>`;
      const svg = $("svg", host);
      st = { c, a, n, svg, cur: { py: a.py.slice(), pc: a.pc.slice() }, eixo: a.eixo.slice(), raf: 0, hraf: 0, hx: 0, hs: null, dentro: false, idx: -1, last: 0,
        ln: $(".tc-ln", svg), ln2: $(".tc-ln2", svg), ar: $(".tc-ar", svg), fim: $(".tc-fim", svg), cur_: $(".tc-cur", svg), pt: $(".tc-pt", svg), cap: $(".tc-cap", svg),
        tip: $(".tc-tip", host), yl: [...svg.querySelectorAll(".tc-y")] };
      pinta();
      if (!reduz) {
        const len = st.ln.getTotalLength();
        st.ln.style.strokeDasharray = len;
        st.ln.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 900, easing: EASE }).onfinish = () => (st.ln.style.strokeDasharray = "");
        st.ar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: "ease-out" });
      }
      const e = st;
      e.cap.addEventListener("pointermove", (ev) => {
        const r = e.svg.getBoundingClientRect();
        e.hx = Math.max(L, Math.min(W - R, ((ev.clientX - r.left) / r.width) * W));
        if (e.hs == null) e.hs = e.hx;
        if (!e.dentro) { e.dentro = true; e.cur_.style.opacity = 1; e.pt.style.opacity = 1; e.tip.classList.add("on"); }
        hover(e);
      });
      e.cap.addEventListener("pointerleave", () => { e.dentro = false; e.cur_.style.opacity = 0; e.pt.style.opacity = 0; e.tip.classList.remove("on"); });
    }
    function hover(e) {
      if (e.hraf) return;
      const laco = (t) => {
        const dt = Math.min(64, t - (e.last || t)); e.last = t;
        e.hs += (e.hx - e.hs) * (reduz ? 1 : 1 - Math.exp(-dt / 50));
        const x = e.hs, len = e.ln.getTotalLength(); let lo = 0, hi = len;
        for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (e.ln.getPointAtLength(mid).x < x) lo = mid; else hi = mid; }
        const y = e.ln.getPointAtLength(hi).y;
        e.cur_.setAttribute("x1", x); e.cur_.setAttribute("x2", x); e.pt.setAttribute("cx", x); e.pt.setAttribute("cy", y);
        const n = e.a.ys.length, i = Math.max(0, Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * (n - 1))));
        if (i !== e.idx) {
          e.idx = i;
          const v = e.a.ys[i], ant = i > 0 ? e.a.ys[i - 1] : null;
          const txt = e.a.titulos[i] || `${e.a.labels[i]}: <b>${e.c.fmt(v)}</b>`;
          e.tip.innerHTML = txt + (ant ? ` · ${cmp(v, ant)} que o mês anterior` : "");
        }
        const r = e.host_r || (e.host_r = host), box = r.getBoundingClientRect(), sx = box.width / W, sy = box.height / Ht, tw = e.tip.offsetWidth;
        const px = Math.max(tw / 2 + 4, Math.min(box.width - tw / 2 - 4, x * sx));
        e.tip.style.transform = `translate3d(${px}px,${Math.max(30, y * sy - 14)}px,0) translate(-50%,-100%)`;
        if (e.dentro || Math.abs(e.hx - e.hs) > .15) e.hraf = requestAnimationFrame(laco); else { e.hraf = 0; e.last = 0; }
      };
      e.hraf = requestAnimationFrame(laco);
    }
    const cmp = (v, ant) => { const d = ant ? v / ant - 1 : 0; return Math.abs(d) < .005 ? "Igual" : d > 0 ? `${Math.round(d * 100)}% acima` : `${Math.round(-d * 100)}% abaixo`; };

    monta(cfg);
    return {
      update(c) {
        const a = alvo(c);
        if (!st.svg.isConnected || a.ys.length !== st.n) return monta(c);
        const e = st; cancelAnimationFrame(e.raf);
        const de = { py: e.cur.py.slice(), pc: e.cur.pc.slice() }, lf = e.eixo.slice(), t0 = performance.now(), dur = reduz ? 1 : 560;
        e.c = c; e.a = a; e.idx = -1;
        host.classList.toggle("sem-comp", !c.comp);
        const passo = (t) => {
          const k = Math.min(1, (t - t0) / dur), q = 1 - Math.pow(1 - k, 3);
          e.cur.py = de.py.map((v, i) => v + (a.py[i] - v) * q);
          e.cur.pc = de.pc.map((v, i) => (a.pc[i] == null ? null : v == null ? a.pc[i] : v + (a.pc[i] - v) * q));
          pinta();
          e.yl.forEach((tx, i) => { const mudou = lf[i] !== a.eixo[i]; tx.textContent = q < .5 ? lf[i] : a.eixo[i]; tx.style.opacity = mudou ? Math.abs(2 * q - 1) : 1; });
          if (k < 1) e.raf = requestAnimationFrame(passo); else { e.eixo = a.eixo.slice(); e.yl.forEach((tx) => (tx.style.opacity = 1)); }
        };
        e.raf = requestAnimationFrame(passo);
        if (e.dentro) hover(e);
      },
      comparar(on) { host.classList.toggle("sem-comp", !on); },
    };
  }

  // ---------------------------------------------------------------- barras
  // cfg: { labels, values, fmt, destaque (índice destacado; padrão a última), titulo(i), altura }
  function barras(host, cfg) {
    const W = cfg.largura || 760, Ht = cfg.altura || 260, L = 62, R = 10, T = 14, B = 30;
    const n = cfg.values.length, [bot, top] = escala(cfg.values.concat([0]), true);
    const Y = (v) => T + (1 - (v - bot) / (top - bot)) * (Ht - T - B), area = W - L - R, passo = area / n, bw = Math.min(46, passo * 0.62);
    const dest = cfg.destaque == null ? n - 1 : cfg.destaque;
    const grade = [0, 1, 2, 3, 4].map((i) => { const y = T + (1 - i / 4) * (Ht - T - B); return `<line class="tc-gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="tc-y" x="${L - 10}" y="${y + 4}" text-anchor="end">${(cfg.fmtEixo || cfg.fmt)(bot + ((top - bot) * i) / 4)}</text>`; }).join("");
    const cols = cfg.values.map((v, i) => {
      const x = L + passo * i + (passo - bw) / 2, h = Math.max(3, Y(bot) - Y(Math.max(v, bot)));
      return `<rect class="tc-bx${i === dest ? " hi" : ""}" data-i="${i}" x="${x}" width="${bw}" rx="8" style="y:${Ht - B - 3}px;height:3px"/><text class="tc-x${i === dest ? " hi" : ""}" x="${x + bw / 2}" y="${Ht - 8}" text-anchor="middle">${cfg.labels[i]}</text>`;
    }).join("");
    host.classList.add("tc");
    host.innerHTML = `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${(cfg.aria || "Gráfico de barras").replace(/"/g, "")}">${grade}${cols}</svg><div class="tc-tip"></div>`;
    const tip = $(".tc-tip", host), svg = $("svg", host);
    const rects = [...svg.querySelectorAll(".tc-bx")];
    const aplica = () => rects.forEach((r, i) => { const v = cfg.values[i], h = Math.max(3, Y(bot) - Y(Math.max(v, bot))); r.style.height = h + "px"; r.style.y = Ht - B - h + "px"; });
    requestAnimationFrame(() => requestAnimationFrame(aplica));
    rects.forEach((r) => {
      r.addEventListener("pointermove", () => {
        const i = +r.dataset.i, box = host.getBoundingClientRect(), sx = box.width / W, sy = box.height / Ht;
        tip.innerHTML = cfg.titulo ? cfg.titulo(i) : `${cfg.labels[i]}: <b>${cfg.fmt(cfg.values[i])}</b>`;
        tip.style.transform = `translate3d(${(+r.getAttribute("x") + bw / 2) * sx}px,${(Ht - B - Math.max(3, Y(bot) - Y(Math.max(cfg.values[i], bot)))) * sy - 8}px,0) translate(-50%,-100%)`;
        tip.classList.add("on");
        rects.forEach((x) => x.classList.toggle("hi", x === r));
      });
      r.addEventListener("pointerleave", () => { tip.classList.remove("on"); rects.forEach((x, i) => x.classList.toggle("hi", i === dest)); });
    });
    return { update(c) { barras(host, c); } };
  }

  window.TNChart = { linha, barras, suave };
})();
