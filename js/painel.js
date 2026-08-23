// ============================================================================
// CDE Web - painel de desvios. O servidor calcula; aqui filtramos e desenhamos.
// ============================================================================
let DADOS = null;
let VISAO = "tabela";
let DET = { insumo: null, casa: null, semana: null, n: 7 };
const $ = (s) => document.querySelector(s);
const fmt = (n, c = 2) => (n === null || n === undefined) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const pct = (n) => n === null || n === undefined ? "—"
  : (n >= 0 ? "+" : "") + (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CORES = { "Crítico": "ruim", "Atenção": "aviso", "Consumo zerado": "info",
                "Normal": "bom", "Sem dados": "neutro" };
// A cor do grafico e a mesma cor da situacao: quem bate o olho na linha ja sabe
// se aquela serie esta critica antes de ler o selo ao lado. Antes todo grafico
// saia azul e a cor nao dizia nada — era so decoracao.
const COR_SIT = { "Crítico": "var(--ruim)", "Atenção": "var(--aviso)",
                  "Consumo zerado": "var(--info)", "Normal": "var(--bom)",
                  "Sem dados": "var(--tinta-3)" };
const corDe = (situacao) => COR_SIT[situacao] || "var(--linha-graf)";


// Cada situacao ganha um icone proprio: cor sozinha nao basta para quem
// enxerga cores de forma diferente, e o icone ajuda a bater o olho.
const ICO_SIT = {
  "Crítico": '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "Atenção": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  "Consumo zerado": '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>',
  "Normal": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  "Sem dados": '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
};
const svgSit = (s) => '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  ICO_SIT[s] + '</svg>';

async function carregar() {
  const i = $("#inicio").value, f = $("#fim").value;
  $("#tabela").innerHTML = '<p class="vazio">carregando…</p>';
  try {
    DADOS = await (await fetch("/api/painel" + (i && f ? `?inicio=${i}&fim=${f}` : ""))).json();
  } catch (e) {
    $("#tabela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  $("#inicio").value = DADOS.inicio;
  $("#fim").value = DADOS.fim;
  const dias = Math.round((new Date(DADOS.fim) - new Date(DADOS.inicio)) / 86400000) + 1;
  $("#periodo-txt").textContent = `${brDate(DADOS.inicio)} a ${brDate(DADOS.fim)} · ${dias} dias · ${DADOS.linhas.length} séries`;
  montarFiltros();
  montarSino();
  desenhar();
}

function montarFiltros() {
  const unico = (c) => [...new Set(DADOS.linhas.map((l) => l[c]))].sort();
  const encher = (sel, lista, rotulo) => {
    const atual = sel.value;
    sel.innerHTML = `<option value="">${rotulo}</option>` +
      lista.map((v) => `<option value="${v}">${v}</option>`).join("");
    if (lista.includes(atual)) sel.value = atual;
  };
  encher($("#f-casa"), unico("casa"), "Todas");
  encher($("#f-insumo"), unico("insumo"), "Todos");
  encher($("#f-situacao"), Object.keys(CORES), "Todas");
}

// ------------------------------------------------------- sino de alertas
function montarSino() {
  const alertas = DADOS.linhas.filter((l) => l.situacao === "Crítico" || l.situacao === "Atenção");
  const criticos = alertas.filter((l) => l.situacao === "Crítico").length;
  const btn = $("#sino-btn");
  btn.classList.toggle("tem-alerta", criticos > 0);
  $("#sino-txt").innerHTML = alertas.length
    ? `${criticos} crítico${criticos === 1 ? "" : "s"} <span class="sino-n">${alertas.length}</span>`
    : "Sem alertas";

  $("#sino-lista").innerHTML =
    `<h3>${alertas.length} série(s) pedindo atenção</h3>` +
    (alertas.length ? alertas.slice(0, 25).map((l) => `
      <button class="alerta-item" data-i="${l.insumo_chave}" data-c="${l.casa}">
        <span class="selo ${CORES[l.situacao]}">${l.situacao}</span>
        <span class="ai-nome">${l.insumo}<span class="ai-casa">${l.casa_nome}</span></span>
        <span class="ai-val ${l.vs_meta > 0.1 ? "calc neg" : ""}">${pct(l.vs_meta)}</span>
      </button>`).join("")
      : '<p class="vazio">Nada fora do padrão no período.</p>');

  $("#sino-lista").querySelectorAll(".alerta-item").forEach((b) => {
    b.onclick = () => {
      $("#sino-lista").hidden = true;
      $("#f-casa").value = ""; $("#f-situacao").value = "";
      $("#f-insumo").value = DADOS.linhas.find((l) => l.insumo_chave === b.dataset.i).insumo;
      desenhar();
      abrirDetalhe(b.dataset.i, b.dataset.c);
    };
  });
}

// ------------------------------------------------------- tabela
// O placar conta sobre loja+insumo, SEM aplicar a situacao: senao, ao escolher
// "Atenção", os outros contadores zerariam e voce perderia a visao do todo.
function filtradasSemSituacao() {
  const c = $("#f-casa").value, i = $("#f-insumo").value;
  return DADOS.linhas.filter((l) => (!c || l.casa === c) && (!i || l.insumo === i));
}

function filtradas() {
  const s = $("#f-situacao").value;
  return filtradasSemSituacao().filter((l) => !s || l.situacao === s);
}

function desenhar() {
  const linhas = filtradas();
  const base = filtradasSemSituacao();
  const conta = {};
  Object.keys(CORES).forEach((s) => { conta[s] = base.filter((l) => l.situacao === s).length; });
  const totalBase = base.length || 1;
  $("#placar").innerHTML = Object.entries(conta).map(([s, n]) =>
    `<button class="ficha ${CORES[s]}${$("#f-situacao").value === s ? " ativa" : ""}" data-sit="${s}">
       <span class="ficha-topo">
         <span class="ficha-vals"><span class="ficha-n">${n}</span><span class="ficha-r">${s}</span></span>
         <span class="ficha-ico">${svgSit(s)}</span>
       </span>
       <span class="ficha-pe">${(n / totalBase * 100).toFixed(0)}% das séries</span>
     </button>`).join("");
  document.querySelectorAll(".ficha").forEach((b) => {
    b.onclick = () => {
      $("#f-situacao").value = $("#f-situacao").value === b.dataset.sit ? "" : b.dataset.sit;
      desenhar();
    };
  });

  $("#contagem").textContent = $("#f-situacao").value
    ? `${linhas.length} em "${$("#f-situacao").value}" · ${base.length} no filtro · ${DADOS.linhas.length} no total`
    : `${linhas.length} de ${DADOS.linhas.length} séries`;
  if (!linhas.length) { $("#tabela").innerHTML = '<p class="vazio">Nada nesse filtro.</p>'; return; }

  if (VISAO === "mapa") { desenharMapa(linhas); ligarCliques(); return; }
  if (VISAO === "dinheiro") { desenharDinheiro(linhas); ligarCliques(); return; }

  const cab = ["Insumo", "Loja", "30 dias", "Dias", "Média", "Último", "Vs. média",
               "Tendência", "Meta", "Vs. meta", "Impacto R$", "Situação"];
  $("#tabela").innerHTML =
    `<table><thead><tr>${cab.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
    linhas.map((l) => `
      <tr data-i="${l.insumo_chave}" data-c="${l.casa}">
        <td>${l.insumo} <span class="un">(${l.un})</span></td>
        <td>${l.casa}</td>
        <td style="width:130px;color:${corDe(l.situacao)}">${sparkline(l.serie, l.meta)}</td>
        <td class="calc">${l.dias}</td>
        <td class="calc">${fmt(l.media, 3)}</td>
        <td class="calc" title="${brDate(l.data_ultimo)}">${fmt(l.ultimo, 3)}</td>
        <td class="calc ${Math.abs(l.z30) >= 2 ? "neg" : ""}">${fmt(l.z30)}</td>
        <td class="calc">${l.tendencia === null ? "—" : fmt(l.tendencia, 3)}</td>
        <td class="calc">${l.meta === null ? "—" : fmt(l.meta, 3)}</td>
        <td class="calc ${l.vs_meta !== null && l.vs_meta > 0.1 ? "neg" : ""}">${pct(l.vs_meta)}</td>
        <td class="calc ${l.impacto_reais > 0 ? "neg" : ""}">${l.impacto_reais === null ? "—"
           : "R$ " + l.impacto_reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
        <td><span class="selo ${CORES[l.situacao]}">${l.situacao}</span></td>
      </tr>`).join("") + "</tbody></table>";
  ligarCliques();
}

function ligarCliques() {
  document.querySelectorAll("#tabela [data-i][data-c]").forEach((el) => {
    el.onclick = () => abrirDetalhe(el.dataset.i, el.dataset.c);
  });
}


// ------------------------------------------------------- curva suave
// Catmull-Rom convertido em bezier cubica. A tensao fica em 0,7 (e nao em 1)
// porque consumo diario tem picos: com tensao cheia a curva ultrapassa o
// ponto e desenha um vale que nao existe no dado.
function caminhoSuave(pts, tensao) {
  const t = tensao === undefined ? 0.7 : tensao;
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t, c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t, c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ` +
         `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// cada SVG precisa do seu proprio id de degrade, senao o segundo grafico
// reaproveita o primeiro e todos saem com a mesma cor
let GRAD = 0;

// ------------------------------------------------------- sparkline
// Curva suave com area em degrade: a silhueta do consumo aparece de relance,
// sem eixo nem numero competindo com o valor grande da ficha.
function sparkline(serie, meta) {
  if (!serie || serie.length < 2) return "";
  const W = 120, H = 32, P = 3;
  const vals = meta ? serie.concat([meta]) : serie;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => P + (i * (W - P * 2)) / (serie.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - P * 2);
  const pts = serie.map((v, i) => [x(i), y(v)]);
  const linha = caminhoSuave(pts);
  const id = "sg" + (++GRAD);
  const area = linha + ` L${x(serie.length - 1).toFixed(1)},${H} L${P},${H} Z`;
  const alvo = meta
    ? `<line x1="${P}" y1="${y(meta).toFixed(1)}" x2="${W - P}" y2="${y(meta).toFixed(1)}"
             stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity=".35"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".38"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient></defs>
    ${alvo}
    <path d="${area}" fill="url(#${id})"/>
    <path d="${linha}" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(serie.length - 1).toFixed(1)}" cy="${y(serie[serie.length - 1]).toFixed(1)}"
            r="2.4" fill="currentColor"/>
  </svg>`;
}

// ------------------------------------------------------- visao: mapa geral
// Uma grade insumo x casa com a serie de 30 dias em cada celula. A operacao
// inteira numa tela, sem precisar abrir serie por serie.
function desenharMapa(linhas) {
  const casas = [...new Set(DADOS.linhas.map((l) => l.casa))];
  const insumos = [...new Set(linhas.map((l) => l.insumo))];
  let html = '<div class="mapa"><div></div>' +
    casas.map((c) => '<div class="mh">' + c + "</div>").join("");
  insumos.forEach((ins) => {
    html += '<div class="mi">' + ins + "</div>";
    casas.forEach((c) => {
      const l = linhas.find((x) => x.insumo === ins && x.casa === c);
      if (!l || !l.dias) { html += '<div class="cel neutro"></div>'; return; }
      html += '<div class="cel ' + CORES[l.situacao] + '" style="color:' + corDe(l.situacao) +
        '" data-i="' + l.insumo_chave +
        '" data-c="' + l.casa + '" title="' + ins + " — " + l.casa_nome + ": média " +
        fmt(l.media, 3) + ", " + l.situacao + '">' +
        '<span class="cv">' + pct(l.vs_meta) + "</span>" + sparkline(l.serie, l.meta) + "</div>";
    });
  });
  $("#tabela").innerHTML = html + "</div>" +
    '<p class="fonte" style="margin-top:10px">Cada célula é a série de 30 dias; a linha laranja tracejada é a meta. ' +
    "A barra colorida à esquerda mostra a situação. Clique para abrir o detalhe.</p>";
}

// ------------------------------------------------------- visao: impacto R$
function desenharDinheiro(linhas) {
  const com = linhas.filter((l) => l.impacto_reais !== null && l.impacto_reais !== 0);
  if (!com.length) {
    $("#tabela").innerHTML = '<div class="sem-custo">Nenhum insumo com custo cadastrado ainda. ' +
      "Preencha <code>dados/custos.json</code> — ou devolva a planilha de preços — e esta visão " +
      "passa a ordenar tudo por dinheiro em vez de porcentagem.</div>";
    return;
  }
  const ordenado = [...com].sort((a, b) => b.impacto_reais - a.impacto_reais);
  const maior = Math.max(...ordenado.map((l) => Math.abs(l.impacto_reais)));
  const total = ordenado.reduce((a, l) => a + l.impacto_reais, 0);
  const moeda = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("#tabela").innerHTML =
    '<div class="sem-custo">Excesso sobre a meta convertido em dinheiro no período. ' +
    "É por aqui que se decide o que atacar primeiro: 8% no salmão pesa mais que 500% num item barato.</div>" +
    '<div class="barras">' + ordenado.map((l) =>
      '<div class="barra-l" data-i="' + l.insumo_chave + '" data-c="' + l.casa + '">' +
        '<div class="bl-nome">' + l.insumo + "<small>" + l.casa_nome + " · " + pct(l.vs_meta) +
          " · " + fmt(l.excesso_un, 1) + " " + l.un + "</small></div>" +
        '<div class="bl-trilho"><div class="bl-preenche' + (l.impacto_reais < 0 ? " economia" : "") +
          '" style="width:' + (Math.abs(l.impacto_reais) / maior * 100).toFixed(1) + '%"></div></div>' +
        '<div class="bl-val" style="color:' + (l.impacto_reais < 0 ? "var(--success)" : "var(--error)") +
          '">' + moeda(l.impacto_reais) + "</div></div>").join("") + "</div>" +
    '<div class="total-linha"><span>Total no período</span><span class="tv">' + moeda(total) + "</span></div>";
}

// ------------------------------------------------------- graficos
function desenharLinha(pontos, meta, rotuloX, cor) {
  const traco = cor || "var(--linha-graf)";
  const L = 8, T = 18, W = 900, H = 250, R = 58;        // R: faixa dos rotulos do eixo, a direita
  const PW = W - L - R, PH = H - T - 40;
  const vals = pontos.map((p) => p.coef).concat(meta ? [meta] : []);
  const lo = Math.min(...vals) * 0.88, hi = Math.max(...vals) * 1.10;
  const x = (i) => L + (pontos.length === 1 ? PW / 2 : (i * PW) / (pontos.length - 1));
  const y = (v) => T + PH - ((v - lo) / (hi - lo || 1)) * PH;
  const pts = pontos.map((p, i) => [x(i), y(p.coef)]);
  const id = "lg" + (++GRAD);

  // O dia em destaque e o ultimo: e o que responde "como estamos agora".
  const k = pontos.length - 1;

  const linha = caminhoSuave(pts);
  const area = linha + ` L${x(k).toFixed(1)},${T + PH} L${L},${T + PH} Z`;

  // Sem grade vertical e sem malha cheia: so a referencia da meta, pontilhada,
  // com o valor a direita — e nela que o olho precisa bater.
  const escala = [0, 0.5, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    return `<text x="${W - R + 12}" y="${(y(v) + 4).toFixed(1)}" class="eixo">${fmt(v, 2)}</text>`;
  }).join("");
  const linhaMeta = meta ? `
    <line x1="${L}" y1="${y(meta).toFixed(1)}" x2="${W - R}" y2="${y(meta).toFixed(1)}"
          stroke="var(--laranja)" stroke-width="1.5" stroke-dasharray="6 6" opacity=".85"/>
    <text x="${W - R + 12}" y="${(y(meta) + 4).toFixed(1)}" class="eixo meta-rot">meta</text>` : "";

  // faixa vertical arredondada atras do dia destacado
  const faixa = `<rect x="${(x(k) - 19).toFixed(1)}" y="${y(pontos[k].coef).toFixed(1)}"
       width="38" height="${(T + PH - y(pontos[k].coef)).toFixed(1)}" rx="19"
       fill="url(#${id}b)"/>`;

  const passo = Math.max(1, Math.ceil(pontos.length / 9));
  const rot = pontos.map((p, i) => {
    if (i !== k && i % passo !== 0) return "";
    const destaque = i === k;
    return `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle"
        class="eixo${destaque ? " eixo-forte" : ""}">${rotuloX(p, i)}</text>`;
  }).join("");

  const alvos = pontos.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.coef).toFixed(1)}" r="9" fill="transparent">
       <title>${brDate(p.data)} — ${fmt(p.coef, 3)}</title></circle>`).join("");

  return `<svg viewBox="0 0 ${W} ${H}" class="grafico">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${traco}" stop-opacity=".34"/>
        <stop offset="100%" stop-color="${traco}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${traco}" stop-opacity=".30"/>
        <stop offset="100%" stop-color="${traco}" stop-opacity=".02"/>
      </linearGradient>
    </defs>
    ${escala}${linhaMeta}${faixa}
    <path d="${area}" fill="url(#${id})"/>
    <path d="${linha}" fill="none" stroke="${traco}" stroke-width="2.4"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(k).toFixed(1)}" cy="${y(pontos[k].coef).toFixed(1)}" r="9"
            fill="${traco}" opacity=".22"/>
    <circle cx="${x(k).toFixed(1)}" cy="${y(pontos[k].coef).toFixed(1)}" r="4.5"
            fill="${traco}" stroke="var(--card)" stroke-width="2"/>
    ${rot}${alvos}
  </svg>`;
}

function legenda(meta, cor) {
  return `<div class="legenda">
    <span class="lg-serie" style="color:${cor || "var(--linha-graf)"}"><i></i>Consumo por R$ 1.000</span>
    ${meta ? `<span class="lg-meta"><i class="tracejada"></i>Meta ${fmt(meta, 3)}</span>` : ""}
  </div>`;
}

async function abrirDetalhe(insumo, casa, manterEscolha) {
  if (!manterEscolha) DET = { insumo: insumo, casa: casa, semana: null, n: DET.n };
  DET.insumo = insumo; DET.casa = casa;
  const l = DADOS.linhas.find((x) => x.insumo_chave === insumo && x.casa === casa);
  const cor = corDe(l.situacao);
  $("#det-titulo").innerHTML = `${esc(l.insumo)} — ${esc(l.casa_nome)}
    <span class="selo ${CORES[l.situacao]}">${l.situacao}</span>`;
  $("#detalhe").hidden = false;
  $("#det-graficos").innerHTML = '<p class="vazio">carregando…</p>';
  $("#detalhe").scrollIntoView({ behavior: "smooth", block: "nearest" });

  const [serie, ocor] = await Promise.all([
    fetch(`/api/serie?insumo=${insumo}&casa=${casa}&inicio=${DADOS.inicio}&fim=${DADOS.fim}`).then((r) => r.json()),
    fetch(`/api/ocorrencias?insumo=${insumo}&casa=${casa}&n=${DET.n}` +
          (DET.semana ? `&semana=${encodeURIComponent(DET.semana)}` : "")).then((r) => r.json()),
  ]);

  let html = "";
  if (serie.pontos.length) {
    html += `<div class="grafico-bloco">
      <h3>Todos os Dias do Período</h3>
      <span class="fonte">${serie.pontos.length} dias com faturamento bruto · média ${fmt(l.media, 3)}
        · oscilação ${l.oscilacao === null ? "—" : fmt(l.oscilacao * 100, 0) + "%"}</span>
      ${desenharLinha(serie.pontos, l.meta, (p) => p.data.slice(8) + "/" + p.data.slice(5, 7), cor)}
      ${legenda(l.meta, cor)}</div>`;
  }
  if (ocor.pontos && ocor.pontos.length) {
    const m = ocor.pontos.reduce((a, p) => a + p.coef, 0) / ocor.pontos.length;
    const dias = (ocor.disponiveis || []).map((d) =>
      `<option value="${d}"${d === ocor.semana ? " selected" : ""}>${d}</option>`).join("");
    const qtds = [4, 5, 7, 10, 14].map((q) =>
      `<option value="${q}"${q === DET.n ? " selected" : ""}>${q}</option>`).join("");
    html += `<div class="grafico-bloco">
      <div class="det-controles">
        <h3>Contra os Mesmos Dias</h3>
        <label class="campo"><span>Dia da Semana</span><select id="sel-semana">${dias}</select></label>
        <label class="campo"><span>Quantas</span><select id="sel-n">${qtds}</select></label>
      </div>
      <span class="fonte">${ocor.pontos.length} ${ocor.semana}s comparadas · média ${fmt(m, 3)} ·
        compara o item com ele mesmo em dias de movimento parecido</span>
      ${ocor.pontos.length > 1
        ? desenharLinha(ocor.pontos, l.meta, (p) => p.data.slice(8) + "/" + p.data.slice(5, 7), cor)
        : '<p class="vazio">Só uma ocorrência desse dia no histórico — escolha outro dia.</p>'}
      ${legenda(l.meta, cor)}</div>`;
  }
  $("#det-graficos").innerHTML = html || '<p class="vazio">Sem dados no período.</p>';

  const rec = () => abrirDetalhe(DET.insumo, DET.casa, true);
  const sw = document.getElementById("sel-semana");
  const sn = document.getElementById("sel-n");
  if (sw) sw.onchange = (e) => { DET.semana = e.target.value; rec(); };
  if (sn) sn.onchange = (e) => { DET.n = parseInt(e.target.value, 10); rec(); };
}

// ------------------------------------------------------- inicio
$("#sino-btn").onclick = (e) => {
  e.stopPropagation();
  $("#sino-lista").hidden = !$("#sino-lista").hidden;
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".sino")) $("#sino-lista").hidden = true;
});
document.querySelectorAll("#visoes button").forEach((b) => {
  b.onclick = () => {
    VISAO = b.dataset.v;
    document.querySelectorAll("#visoes button").forEach((x) => x.classList.toggle("ativo", x === b));
    desenhar();
  };
});
$("#det-fechar").onclick = () => { $("#detalhe").hidden = true; };
["#f-casa", "#f-insumo", "#f-situacao"].forEach((s) => { $(s).onchange = desenhar; });
["#inicio", "#fim"].forEach((s) => { $(s).onchange = carregar; });
$("#ultimos30").onclick = () => { $("#inicio").value = ""; $("#fim").value = ""; carregar(); };
carregar();
