// ============================================================================
// CDE Web - Painel de Consumo, aba "Resumo do dia".
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

  let html = '<div class="placar rd-placar">' + fichas.map((f) => `
    <div class="ficha rd-ficha ${f.cls}">
      <span class="ficha-vals"><span class="ficha-n">${f.n}</span><span class="ficha-r">${f.r}</span></span>
      <span class="ficha-pe">${f.pe}</span>
    </div>`).join("") + "</div>";

  if (R.ultimo_completo && R.ultimo_completo !== R.data && lancaram === 0) {
    html += `<div class="sem-custo">Nenhuma casa lançou a contagem de ${brDate(R.data)}.
      O último dia com contagem é ${brDate(R.ultimo_completo)}.
      <button class="botao" data-ir="${R.ultimo_completo}">Ver ${brDate(R.ultimo_completo)}</button></div>`;
  }

  html += '<div class="rd-grade">' +
    cartao("O que olhar primeiro", "Pendências do dia, das mais urgentes para as informativas.", '<div class="rd-pend-lista">' + pendencias() + "</div>") +
    '<div class="rd-col">' +
      cartao("O que subiu e o que baixou", "Consumo da rede contra o esperado para o faturamento do dia. " +
             "Clique num item para ver as casas.", graficoVariacao()) +
      cartao("Faturamento por casa", `O dia contra a média das últimas ${semana}s (traço).`, graficoFaturamento()) +
    "</div></div>" +
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
function pendencias() {
  const R = RESUMO;
  if (!R.divergencias.length) return '<p class="vazio">Nada fora do padrão neste dia.</p>';
  let html = "";
  [1, 2, 3].forEach((p) => {
    const grupo = R.divergencias.filter((d) => d.prioridade === p);
    if (!grupo.length) return;
    html += `<div class="rd-grupo"><span class="selo ${PRIORIDADE[p].cls}">${PRIORIDADE[p].rotulo}</span>
      <span class="fonte">${grupo.length} ${grupo.length === 1 ? "item" : "itens"}</span></div>`;
    html += grupo.map((d) => `
      <div class="rd-pend p${p}">
        <div class="rd-pend-topo">
          <strong>${esc(d.titulo)}</strong>
          ${d.reais ? `<span class="rd-pend-r" title="Diferença em dinheiro contra o esperado">${reais(d.reais)}</span>` : ""}
        </div>
        <div class="rd-pend-onde">${esc(d.casa_nome)}${d.insumo ? " · " + esc(d.insumo) : ""}</div>
        <div class="rd-pend-det">${esc(d.detalhe)}</div>
        <div class="rd-pend-olhar"><b>O que olhar:</b> ${esc(d.olhar)}</div>
        <div class="rd-pend-acoes">
          <a class="botao" href="index.html?data=${R.data}">Abrir lançamento de ${brDate(R.data)}</a>
          ${d.insumo_chave ? `<button class="botao" data-serie="${d.insumo_chave}" data-casa="${d.casa}">Ver série</button>` : ""}
        </div>
      </div>`).join("");
  });
  return html;
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
