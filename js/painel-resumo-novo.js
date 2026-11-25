// ============================================================================
// CDE Web - Painel de Consumo, aba "Resumo do dia" (versão do tema novo: resumo montado como a tela de Alertas).
// Abre sempre no dia anterior. O servidor (/api/resumo-dia) compara cada insumo
// de cada casa com a media dos 28 dias antes e monta a lista de pendencias;
// aqui so desenhamos. Usa $, fmt, esc, brDate e abrirDetalhe do painel.js.
// ============================================================================
let RESUMO = null;

const isoDe = (d) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const ontemIso = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDe(d); };
const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDe(d); };
const reais = (v, c = 0) => v === null || v === undefined ? "—"
  : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const qtd = (v, un) => v === null || v === undefined ? "—"
  : fmt(v, ["Pct", "Bng", "Un"].includes(un) ? 0 : 3) + " " + un;
// Variacao em palavras, nunca seta: "12% acima", "8% abaixo", "igual".
function emPalavras(v, acima = "acima", abaixo = "abaixo") {
  if (v === null || v === undefined) return "—";
  const p = Math.round(Math.abs(v) * 100);
  if (p === 0) return "igual";
  return `${p.toLocaleString("pt-BR")}% ${v > 0 ? acima : abaixo}`;
}

// cor de cada estado: as mesmas variaveis do resto do painel, entao o tema mono
// continua valendo (la a escala e de claridade, nao de cor)
const EST = {
  "Subiu":       { cls: "ruim",   cor: "var(--ruim)" },
  "Divergência": { cls: "ruim",   cor: "var(--ruim)" },
  "Baixou":      { cls: "info",   cor: "var(--info)" },
  "Zerado":      { cls: "aviso",  cor: "var(--aviso)" },
  "Sem estoque": { cls: "aviso",  cor: "var(--aviso)" },
  "No padrão":   { cls: "bom",    cor: "var(--bom)" },
  "Sem base":    { cls: "neutro", cor: "var(--tinta-3)" },
};
const PRIORIDADE = {
  1: { rotulo: "Resolver agora", cls: "ruim" },
  2: { rotulo: "Conferir hoje", cls: "aviso" },
  3: { rotulo: "Para saber", cls: "neutro" },
};

async function carregarResumo(iso) {
  const data = iso || $("#rd-data").value || ontemIso();
  $("#rd-data").value = data;
  $("#rd-corpo").innerHTML = '<p class="vazio">carregando…</p>';
  try {
    const r = await fetch("/api/resumo-dia?data=" + data);
    if (!r.ok) throw new Error(await r.text());
    RESUMO = await r.json();
  } catch (e) {
    $("#rd-corpo").innerHTML = '<p class="vazio">Não consegui montar o resumo. O servidor está no ar?</p>';
    return;
  }
  desenharResumo();
}

function desenharResumo() {
  const R = RESUMO;
  const semana = R.semana.replace("-feira", "");
  $("#rd-titulo").textContent = `Resumo de ${R.semana}, ${brDate(R.data)}`;
  const lancaram = R.faturamento.casas.filter((c) => c.lancou).length;
  $("#rd-sub").textContent = `${lancaram} de ${R.faturamento.casas.length} casas com contagem lançada · ` +
    `comparado com a média dos ${R.janela} dias anteriores, pelo consumo por R$ 1.000 faturados`;

  const pend = R.divergencias.filter((d) => d.prioridade <= 2);
  const fat = R.faturamento, cu = R.custo, ct = R.contagem;
  const fichas = [
    { cls: "info", n: reais(fat.total), r: "Faturamento da rede",
      pe: fat.var === null ? "sem base de comparação"
        : `${emPalavras(fat.var)} da média das últimas ${semana}s` },
    { cls: cu.var > 0.10 ? "ruim" : "bom", n: reais(cu.dia), r: "Custo dos insumos consumidos",
      pe: cu.var === null ? "itens com preço cadastrado"
        : `${emPalavras(cu.var)} do esperado para esse faturamento (${reais(cu.esperado)})` },
    { cls: ct["Subiu"] ? "ruim" : "bom", n: `${ct["Subiu"]} · ${ct["Baixou"]}`, r: "Subiram · baixaram",
      pe: `${ct["No padrão"]} no padrão · ${ct["Zerado"] + ct["Sem estoque"]} zerado ou sem estoque` },
    { cls: pend.length ? "ruim" : "bom", n: String(pend.length), r: "Pendências para resolver",
      pe: pend.length ? `${R.divergencias.filter((d) => d.prioridade === 1).length} para resolver agora`
        : "nada pedindo conferência" },
  ];

  const cont = [1, 2, 3].map((p) => R.divergencias.filter((d) => d.prioridade === p).length);
  // Tela de Alertas como modelo: três blocos de gravidade no alto, depois a lista "precisa de um olhar".
  let html = '<div class="al-sevs">' + [1, 2, 3].map((p, i) => `
    <div class="al-chip p${p}"><span class="al-ico p${p}">${icoGravidade(p)}</span>
      <span class="al-vals"><b class="al-n">${cont[i]}</b><span class="al-l">${PRIORIDADE[p].rotulo}</span></span></div>`).join("") + "</div>";

  html += '<div class="placar rd-placar">' + fichas.map((f) => `
    <div class="ficha rd-ficha ${f.cls}">
      <span class="ficha-vals"><span class="ficha-n">${f.n}</span><span class="ficha-r">${f.r}</span></span>
      <span class="ficha-pe">${f.pe}</span>
    </div>`).join("") + "</div>";

  if (R.ultimo_completo && R.ultimo_completo !== R.data && lancaram === 0) {
    html += `<div class="sem-custo">Nenhuma casa lançou a contagem de ${brDate(R.data)}.
      O último dia com contagem é ${brDate(R.ultimo_completo)}.
      <button class="botao" data-ir="${R.ultimo_completo}">Ver ${brDate(R.ultimo_completo)}</button></div>`;
  }

  html += `<section class="cartao al-lista"><div class="rd-cab"><h3>Precisa de um olhar</h3>
      <p class="fonte">${R.divergencias.length} ${R.divergencias.length === 1 ? "aberta" : "abertas"}, das mais urgentes para as informativas</p></div>${pendencias()}</section>` +
    '<div class="rd-duas">' +
      cartao("O que subiu e o que baixou", "Consumo da rede contra o esperado para o faturamento do dia. " +
             "Clique num item para ver as casas.", graficoVariacao()) +
      cartao("Faturamento por casa", `O dia contra a média das últimas ${semana}s (traço).`, graficoFaturamento()) +
    "</div>" +
    cartao("Comportamento por casa", "Cada célula é o consumo do item na casa contra a média dela. " +
           "Clique para abrir a série de 30 dias.", mapaCasas());

  $("#rd-corpo").innerHTML = html;
  ligarResumo();
}

function cartao(titulo, sub, corpo) {
  return `<section class="cartao rd-cartao"><div class="rd-cab"><h3>${titulo}</h3>
    <p class="fonte">${sub}</p></div>${corpo}</section>`;
}

// ------------------------------------------------------- pendencias
// Ícones das três gravidades, no mesmo traço do menu: sirene, alerta e informação.
const ICO_GRAV = {
  1: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 18h14M12 4V2.5M4.6 7.4 3.5 6.5M19.4 7.4l1.1-.9"/>',
  2: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17.3v.1"/>',
  3: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
};
const icoGravidade = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO_GRAV[p]}</svg>`;
const SETA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function pendencias() {
  const R = RESUMO;
  if (!R.divergencias.length) return '<p class="vazio">Nada fora do padrão neste dia.</p>';
  return '<div class="al-rows">' + R.divergencias.slice().sort((a, b) => a.prioridade - b.prioridade).map((d) => {
    const p = d.prioridade;
    return `<div class="al-row p${p}">
      <span class="al-ico p${p}">${icoGravidade(p)}</span>
      <div class="al-corpo">
        <div class="al-tit"><b>${esc(d.titulo)}</b><span class="al-pill p${p}"><i></i>${PRIORIDADE[p].rotulo}</span></div>
        <p class="al-det">${esc(d.detalhe)}</p>
        <p class="al-olhar"><b>O que olhar:</b> ${esc(d.olhar)}</p>
        <p class="al-meta">${esc(d.casa_nome)}${d.insumo ? " · " + esc(d.insumo) : ""}${d.reais ? " · " + reais(d.reais) : ""}</p>
      </div>
      <div class="al-acoes">
        <a class="botao peq" href="index.html?data=${R.data}">Abrir lançamento ${SETA}</a>
        ${d.insumo_chave ? `<button class="botao peq fantasma" data-serie="${d.insumo_chave}" data-casa="${d.casa}">Ver série</button>` : ""}
      </div></div>`;
  }).join("") + "</div>";
}


// ------------------------------------------------------- subiu x baixou (rede)
function graficoVariacao() {
  const linhas = RESUMO.rede.filter((r) => r.var !== null).sort((a, b) => b.var - a.var);
  if (!linhas.length) return '<p class="vazio">Sem consumo comparável neste dia.</p>';
  const LIM = 1.5;                         // escala corta em 150%: um item a +700% achataria o resto
  return '<div class="rd-div">' + linhas.map((r) => {
    const v = Math.max(-LIM, Math.min(LIM, r.var));
    const larg = (Math.abs(v) / LIM * 50).toFixed(1);
    const cor = Math.abs(r.var) < 0.10 ? "var(--tinta-3)" : r.var > 0 ? "var(--ruim)" : "var(--info)";
    const estilo = r.var >= 0 ? `left:50%;width:${larg}%` : `right:50%;width:${larg}%`;
    const casas = Object.entries(r.casas).map(([c, x]) =>
      `${c}: ${x.var === null ? x.estado : emPalavras(x.var)}`).join(" · ");
    return `<button class="rd-div-l" data-insumo="${r.insumo_chave}"
        title="${esc(r.insumo)}: ${qtd(r.uso, r.un)} consumidos, ${qtd(r.esperado, r.un)} esperados. ${esc(casas)}">
      <span class="rd-div-nome">${esc(r.insumo)}</span>
      <span class="rd-div-trilho"><span class="rd-div-zero"></span>
        <span class="rd-div-barra" style="${estilo};background:${cor}"></span></span>
      <span class="rd-div-val">${emPalavras(r.var)}<small>${r.reais ? (r.reais > 0 ? "+" : "−") + reais(Math.abs(r.reais)) : ""}</small></span>
    </button>`;
  }).join("") + "</div>";
}

// ------------------------------------------------------- faturamento por casa
function graficoFaturamento() {
  const casas = RESUMO.faturamento.casas;
  const maior = Math.max(1, ...casas.map((c) => Math.max(c.faturamento, c.media_mesmo_dia || 0)));
  return '<div class="rd-fat">' + casas.map((c) => {
    const w = (c.faturamento / maior * 100).toFixed(1);
    const m = c.media_mesmo_dia ? (c.media_mesmo_dia / maior * 100).toFixed(1) : null;
    const txt = c.faturamento <= 0 ? "sem faturamento"
      : c.var_mesmo_dia === null ? "sem base" : emPalavras(c.var_mesmo_dia);
    return `<div class="rd-fat-l" title="${esc(c.casa_nome)}: ${reais(c.faturamento, 2)} · média ${reais(c.media_mesmo_dia, 2)} · véspera ${reais(c.vespera, 2)}">
      <span class="rd-fat-nome">${c.casa}<small>${c.lancou ? "contagem lançada" : "sem contagem"}</small></span>
      <span class="rd-fat-trilho"><span class="rd-fat-barra" style="width:${w}%"></span>
        ${m ? `<span class="rd-fat-media" style="left:${m}%"></span>` : ""}</span>
      <span class="rd-fat-val">${reais(c.faturamento)}<small>${txt}</small></span>
    </div>`;
  }).join("") + "</div>";
}

// ------------------------------------------------------- mapa insumo x casa
function mapaCasas() {
  const R = RESUMO;
  const casas = R.faturamento.casas.map((c) => c.casa);
  const insumos = [...new Set(R.itens.map((i) => i.insumo_chave))];
  if (!insumos.length) return '<p class="vazio">Nenhuma contagem lançada neste dia.</p>';
  let html = `<div class="rolagem"><table class="rd-mapa"><thead><tr><th>Insumo</th>` +
    casas.map((c) => `<th>${c}</th>`).join("") + "</tr></thead><tbody>";
  insumos.forEach((ik) => {
    const nome = R.itens.find((i) => i.insumo_chave === ik).insumo;
    html += `<tr><td>${esc(nome)}</td>` + casas.map((c) => {
      const i = R.itens.find((x) => x.insumo_chave === ik && x.casa === c);
      if (!i) return '<td class="rd-cel vazio-cel">—</td>';
      const e = EST[i.estado] || EST["Sem base"];
      const destaque = !["No padrão", "Sem base"].includes(i.estado);
      const val = i.var === null ? i.estado : emPalavras(i.var);
      const dica = `${i.insumo} — ${i.casa_nome}: ${qtd(i.uso, i.un)} consumidos` +
        (i.esperado !== null ? `, ${qtd(i.esperado, i.un)} esperados` : "") +
        (i.lote ? " · item que sai em lote" : "") + ` · ${i.estado}`;
      return `<td class="rd-cel ${destaque ? "marcada " + e.cls : ""}" data-serie="${ik}" data-casa="${c}" title="${esc(dica)}">
        <span class="rd-cel-v">${val}</span>${destaque ? `<span class="rd-cel-e">${i.estado}</span>` : ""}</td>`;
    }).join("") + "</tr>";
  });
  return html + "</tbody></table></div>";
}

function ligarResumo() {
  document.querySelectorAll("#rd-corpo [data-serie]").forEach((el) => {
    el.onclick = () => {
      abrirDetalhe(el.dataset.serie, el.dataset.casa);
      setTimeout(() => $("#detalhe").scrollIntoView({ behavior: "smooth" }), 300);
    };
  });
  document.querySelectorAll("#rd-corpo [data-insumo]").forEach((el) => {
    el.onclick = () => {
      const alvo = document.querySelector(`.rd-mapa [data-serie="${el.dataset.insumo}"]`);
      if (!alvo) return;
      const tr = alvo.closest("tr");
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
      tr.classList.add("piscar");
      setTimeout(() => tr.classList.remove("piscar"), 1600);
    };
  });
  document.querySelectorAll("#rd-corpo [data-ir]").forEach((el) => {
    el.onclick = () => carregarResumo(el.dataset.ir);
  });
}

$("#rd-data").onchange = (e) => carregarResumo(e.target.value);
$("#rd-ant").onclick = () => carregarResumo(somaDias($("#rd-data").value || ontemIso(), -1));
$("#rd-seg").onclick = () => carregarResumo(somaDias($("#rd-data").value || ontemIso(), 1));
$("#rd-ontem").onclick = () => carregarResumo(ontemIso());
aplicarVisao();
