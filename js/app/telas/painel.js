// ============================================================================
// CDE Web - painel de desvios. O servidor calcula; aqui filtramos e desenhamos.
// ============================================================================
import { html, useState, useEffect, useRef, useLayoutEffect } from "../html.js";
import { fmt, pct, brDate } from "../formato.js";
import * as api from "../api.js";
import { montarTela } from "../montar.js";

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
  "Crítico": html`<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  "Atenção": html`<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
  "Consumo zerado": html`<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>`,
  "Normal": html`<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  "Sem dados": html`<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
};
const IconeSit = ({ s }) => html`<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO_SIT[s]}</svg>`;

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

// Cada SVG precisa do seu proprio id de degrade, senao o segundo grafico
// reaproveita o primeiro e todos saem com a mesma cor. O id sai de quem o
// grafico mostra (insumo, casa, visao), unico na tela.
const idGrad = (...partes) => partes.join("-").replace(/[^A-Za-z0-9_-]/g, "_");

// ------------------------------------------------------- sparkline
// Curva suave com area em degrade: a silhueta do consumo aparece de relance,
// sem eixo nem numero competindo com o valor grande da ficha.
function Sparkline({ serie, meta, id }) {
  if (!serie || serie.length < 2) return null;
  const W = 120, H = 32, P = 3;
  const vals = meta ? serie.concat([meta]) : serie;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => P + (i * (W - P * 2)) / (serie.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - P * 2);
  const pts = serie.map((v, i) => [x(i), y(v)]);
  const linha = caminhoSuave(pts);
  const area = linha + ` L${x(serie.length - 1).toFixed(1)},${H} L${P},${H} Z`;
  return html`<svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <defs><linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="currentColor" stop-opacity=".38"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient></defs>
    ${meta ? html`<line x1=${P} y1=${y(meta).toFixed(1)} x2=${W - P} y2=${y(meta).toFixed(1)}
             stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity=".35"/>` : null}
    <path d=${area} fill=${`url(#${id})`}/>
    <path d=${linha} fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx=${x(serie.length - 1).toFixed(1)} cy=${y(serie[serie.length - 1]).toFixed(1)}
            r="2.4" fill="currentColor"/>
  </svg>`;
}

// ------------------------------------------------------- graficos do detalhe
function GraficoLinha({ pontos, meta, rotuloX, cor, id }) {
  const traco = cor || "var(--linha-graf)";
  const L = 8, T = 18, W = 900, H = 250, R = 58;        // R: faixa dos rotulos do eixo, a direita
  const PW = W - L - R, PH = H - T - 40;
  const vals = pontos.map((p) => p.coef).concat(meta ? [meta] : []);
  const lo = Math.min(...vals) * 0.88, hi = Math.max(...vals) * 1.10;
  const x = (i) => L + (pontos.length === 1 ? PW / 2 : (i * PW) / (pontos.length - 1));
  const y = (v) => T + PH - ((v - lo) / (hi - lo || 1)) * PH;
  const pts = pontos.map((p, i) => [x(i), y(p.coef)]);

  // O dia em destaque e o ultimo: e o que responde "como estamos agora".
  const k = pontos.length - 1;

  const linha = caminhoSuave(pts);
  const area = linha + ` L${x(k).toFixed(1)},${T + PH} L${L},${T + PH} Z`;

  // Sem grade vertical e sem malha cheia: so a referencia da meta, pontilhada,
  // com o valor a direita — e nela que o olho precisa bater.
  const escala = [0, 0.5, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    return html`<text key=${f} x=${W - R + 12} y=${(y(v) + 4).toFixed(1)} class="eixo">${fmt(v, 2)}</text>`;
  });
  const linhaMeta = meta ? html`
    <line x1=${L} y1=${y(meta).toFixed(1)} x2=${W - R} y2=${y(meta).toFixed(1)}
          stroke="var(--laranja)" stroke-width="1.5" stroke-dasharray="6 6" opacity=".85"/>
    <text x=${W - R + 12} y=${(y(meta) + 4).toFixed(1)} class="eixo meta-rot">meta</text>` : null;

  const passo = Math.max(1, Math.ceil(pontos.length / 9));
  const rot = pontos.map((p, i) => {
    if (i !== k && i % passo !== 0) return null;
    return html`<text key=${i} x=${x(i).toFixed(1)} y=${H - 12} text-anchor="middle"
        class=${"eixo" + (i === k ? " eixo-forte" : "")}>${rotuloX(p, i)}</text>`;
  });

  const alvos = pontos.map((p, i) =>
    html`<circle key=${i} cx=${x(i).toFixed(1)} cy=${y(p.coef).toFixed(1)} r="9" fill="transparent"><title>${
      brDate(p.data) + " — " + fmt(p.coef, 3)}</title></circle>`);

  return html`<svg viewBox=${`0 0 ${W} ${H}`} class="grafico">
    <defs>
      <linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color=${traco} stop-opacity=".34"/>
        <stop offset="100%" stop-color=${traco} stop-opacity="0"/>
      </linearGradient>
      <linearGradient id=${id + "b"} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color=${traco} stop-opacity=".30"/>
        <stop offset="100%" stop-color=${traco} stop-opacity=".02"/>
      </linearGradient>
    </defs>
    ${escala}${linhaMeta}
    <rect x=${(x(k) - 19).toFixed(1)} y=${y(pontos[k].coef).toFixed(1)}
       width="38" height=${(T + PH - y(pontos[k].coef)).toFixed(1)} rx="19"
       fill=${`url(#${id}b)`}/>
    <path d=${area} fill=${`url(#${id})`}/>
    <path d=${linha} fill="none" stroke=${traco} stroke-width="2.4"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx=${x(k).toFixed(1)} cy=${y(pontos[k].coef).toFixed(1)} r="9"
            fill=${traco} opacity=".22"/>
    <circle cx=${x(k).toFixed(1)} cy=${y(pontos[k].coef).toFixed(1)} r="4.5"
            fill=${traco} stroke="var(--card)" stroke-width="2"/>
    ${rot}${alvos}
  </svg>`;
}

const Legenda = ({ meta, cor }) => html`<div class="legenda">
    <span class="lg-serie" style=${{ color: cor || "var(--linha-graf)" }}><i></i>Consumo por R$ 1.000</span>
    ${meta ? html`<span class="lg-meta"><i class="tracejada"></i>${"Meta " + fmt(meta, 3)}</span>` : null}
  </div>`;

const diaMes = (p) => p.data.slice(8) + "/" + p.data.slice(5, 7);

// ------------------------------------------------------- detalhe
function Detalhe({ l, dados, n, aoTrocarSemana, aoTrocarN, aoFechar, refSecao }) {
  const cor = corDe(l.situacao);
  let corpo;
  if (!dados) corpo = html`<p class="vazio">carregando…</p>`;
  else {
    const { serie, ocor } = dados;
    const blocos = [];
    if (serie.pontos.length) {
      blocos.push(html`<div class="grafico-bloco" key="serie">
        <h3>Todos os Dias do Período</h3>
        <span class="fonte">${serie.pontos.length + " dias com faturamento bruto · média " + fmt(l.media, 3)
          + " · oscilação " + (l.oscilacao === null ? "—" : fmt(l.oscilacao * 100, 0) + "%")}</span>
        <${GraficoLinha} pontos=${serie.pontos} meta=${l.meta} rotuloX=${diaMes} cor=${cor} id="lg-serie" />
        <${Legenda} meta=${l.meta} cor=${cor} /></div>`);
    }
    if (ocor.pontos && ocor.pontos.length) {
      const m = ocor.pontos.reduce((a, p) => a + p.coef, 0) / ocor.pontos.length;
      blocos.push(html`<div class="grafico-bloco" key="ocor">
        <div class="det-controles">
          <h3>Contra os Mesmos Dias</h3>
          <label class="campo"><span>Dia da Semana</span><select id="sel-semana" value=${ocor.semana}
            onChange=${(e) => aoTrocarSemana(e.target.value)}>${(ocor.disponiveis || []).map((d) =>
              html`<option key=${d} value=${d}>${d}</option>`)}</select></label>
          <label class="campo"><span>Quantas</span><select id="sel-n" value=${n}
            onChange=${(e) => aoTrocarN(parseInt(e.target.value, 10))}>${[4, 5, 7, 10, 14].map((q) =>
              html`<option key=${q} value=${q}>${q}</option>`)}</select></label>
        </div>
        <span class="fonte">${ocor.pontos.length + " " + ocor.semana + "s comparadas · média " + fmt(m, 3)
          + " · compara o item com ele mesmo em dias de movimento parecido"}</span>
        ${ocor.pontos.length > 1
          ? html`<${GraficoLinha} pontos=${ocor.pontos} meta=${l.meta} rotuloX=${diaMes} cor=${cor} id="lg-ocor" />`
          : html`<p class="vazio">Só uma ocorrência desse dia no histórico — escolha outro dia.</p>`}
        <${Legenda} meta=${l.meta} cor=${cor} /></div>`);
    }
    corpo = blocos.length ? blocos : html`<p class="vazio">Sem dados no período.</p>`;
  }
  return html`<section class="cartao" id="detalhe" ref=${refSecao}>
    <div class="cabeca">
      <h2 id="det-titulo">${l.insumo + " — " + l.casa_nome + " "}<span class=${"selo " + CORES[l.situacao]}>${l.situacao}</span></h2>
      <button class="botao" id="det-fechar" onClick=${aoFechar}>Fechar</button>
    </div>
    <div class="graficos" id="det-graficos">${corpo}</div>
  </section>`;
}

// ------------------------------------------------------- visao: mapa geral
// Uma grade insumo x casa com a serie de 30 dias em cada celula. A operacao
// inteira numa tela, sem precisar abrir serie por serie.
function Mapa({ todas, linhas, abrir }) {
  const casas = [...new Set(todas.map((l) => l.casa))];
  const insumos = [...new Set(linhas.map((l) => l.insumo))];
  const celulas = [html`<div key="canto"></div>`].concat(casas.map((c) => html`<div key=${"h" + c} class="mh">${c}</div>`));
  insumos.forEach((ins) => {
    celulas.push(html`<div key=${"i" + ins} class="mi">${ins}</div>`);
    casas.forEach((c) => {
      const l = linhas.find((x) => x.insumo === ins && x.casa === c);
      if (!l || !l.dias) { celulas.push(html`<div key=${ins + c} class="cel neutro"></div>`); return; }
      celulas.push(html`<div key=${ins + c} class=${"cel " + CORES[l.situacao]} style=${{ color: corDe(l.situacao) }}
        data-i=${l.insumo_chave} data-c=${l.casa}
        title=${ins + " — " + l.casa_nome + ": média " + fmt(l.media, 3) + ", " + l.situacao}
        onClick=${() => abrir(l.insumo_chave, l.casa)}><span class="cv">${pct(l.vs_meta)}</span><${Sparkline}
          serie=${l.serie} meta=${l.meta} id=${idGrad("sm", l.insumo_chave, l.casa)} /></div>`);
    });
  });
  return html`<div class="mapa">${celulas}</div><p class="fonte" style=${{ marginTop: "10px" }}>Cada célula é a série de 30 dias; a linha laranja tracejada é a meta. A barra colorida à esquerda mostra a situação. Clique para abrir o detalhe.</p>`;
}

// ------------------------------------------------------- visao: impacto R$
function Dinheiro({ linhas, abrir }) {
  const com = linhas.filter((l) => l.impacto_reais !== null && l.impacto_reais !== 0);
  if (!com.length) {
    return html`<div class="sem-custo">Nenhum insumo com custo cadastrado ainda. Preencha <code>dados/custos.json</code> — ou devolva a planilha de preços — e esta visão passa a ordenar tudo por dinheiro em vez de porcentagem.</div>`;
  }
  const ordenado = [...com].sort((a, b) => b.impacto_reais - a.impacto_reais);
  const maior = Math.max(...ordenado.map((l) => Math.abs(l.impacto_reais)));
  const total = ordenado.reduce((a, l) => a + l.impacto_reais, 0);
  const moeda = (v) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return html`<div class="sem-custo">Excesso sobre a meta convertido em dinheiro no período. É por aqui que se decide o que atacar primeiro: 8% no salmão pesa mais que 500% num item barato.</div><div class="barras">${
    ordenado.map((l) => html`<div key=${l.insumo_chave + l.casa} class="barra-l" data-i=${l.insumo_chave} data-c=${l.casa}
        onClick=${() => abrir(l.insumo_chave, l.casa)}><div class="bl-nome">${l.insumo}<small>${
          l.casa_nome + " · " + pct(l.vs_meta) + " · " + fmt(l.excesso_un, 1) + " " + l.un}</small></div><div class="bl-trilho"><div class=${
          "bl-preenche" + (l.impacto_reais < 0 ? " economia" : "")} style=${{ width: (Math.abs(l.impacto_reais) / maior * 100).toFixed(1) + "%" }}></div></div><div class="bl-val" style=${{
          color: l.impacto_reais < 0 ? "var(--success)" : "var(--error)" }}>${moeda(l.impacto_reais)}</div></div>`)
  }</div><div class="total-linha"><span>Total no período</span><span class="tv">${moeda(total)}</span></div>`;
}

// ------------------------------------------------------- visao: tabela
const CAB = ["Insumo", "Loja", "30 dias", "Dias", "Média", "Último", "Vs. média",
             "Tendência", "Meta", "Vs. meta", "Impacto R$", "Situação"];

function Tabela({ linhas, abrir }) {
  return html`<table><thead><tr>${CAB.map((h) => html`<th key=${h}>${h}</th>`)}</tr></thead><tbody>${
    linhas.map((l) => html`<tr key=${l.insumo_chave + "|" + l.casa} data-i=${l.insumo_chave} data-c=${l.casa}
        onClick=${() => abrir(l.insumo_chave, l.casa)}>
      <td>${l.insumo} <span class="un">${"(" + l.un + ")"}</span></td>
      <td>${l.casa}</td>
      <td style=${{ width: "130px", color: corDe(l.situacao) }}><${Sparkline} serie=${l.serie} meta=${l.meta}
        id=${idGrad("sg", l.insumo_chave, l.casa)} /></td>
      <td class="calc">${l.dias}</td>
      <td class="calc">${fmt(l.media, 3)}</td>
      <td class="calc" title=${brDate(l.data_ultimo)}>${fmt(l.ultimo, 3)}</td>
      <td class=${"calc " + (Math.abs(l.z30) >= 2 ? "neg" : "")}>${fmt(l.z30)}</td>
      <td class="calc">${l.tendencia === null ? "—" : fmt(l.tendencia, 3)}</td>
      <td class="calc">${l.meta === null ? "—" : fmt(l.meta, 3)}</td>
      <td class=${"calc " + (l.vs_meta !== null && l.vs_meta > 0.1 ? "neg" : "")}>${pct(l.vs_meta)}</td>
      <td class=${"calc " + (l.impacto_reais > 0 ? "neg" : "")}>${l.impacto_reais === null ? "—"
         : "R$ " + l.impacto_reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
      <td><span class=${"selo " + CORES[l.situacao]}>${l.situacao}</span></td>
    </tr>`)}</tbody></table>`;
}

// ------------------------------------------------------- tela
const unico = (linhas, c) => [...new Set(linhas.map((l) => l[c]))].sort();

function Painel() {
  const [dados, setDados] = useState(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  // Mensagem no lugar da tabela ("carregando…", servidor fora): some no
  // próximo desenho, como o innerHTML antigo era sobrescrito.
  const [msgTabela, setMsgTabela] = useState("carregando…");
  const [visao, setVisao] = useState("tabela");
  const [filtro, setFiltro] = useState({ casa: "", insumo: "", situacao: "" });
  const [sinoAberto, setSinoAberto] = useState(false);
  const det = useRef({ insumo: null, casa: null, semana: null, n: 7 });
  const [detalhe, setDetalhe] = useState(null);   // { l, dados, n } — dados null = carregando
  const [rolagem, setRolagem] = useState(0);
  const secaoDet = useRef(null);

  async function carregar(i, f) {
    setMsgTabela("carregando…");
    let d;
    try {
      d = await (await api.getPainel(i, f)).json();
    } catch (e) {
      setMsgTabela("Servidor fora do ar. Rode o Servidor.bat.");
      return;
    }
    setInicio(d.inicio);
    setFim(d.fim);
    // Filtro escolhido sobrevive à troca de período se a opção ainda existir.
    setFiltro((x) => ({
      casa: unico(d.linhas, "casa").includes(x.casa) ? x.casa : "",
      insumo: unico(d.linhas, "insumo").includes(x.insumo) ? x.insumo : "",
      situacao: x.situacao,
    }));
    setMsgTabela(null);
    setDados(d);
  }
  useEffect(() => { carregar("", ""); }, []);

  // Clicar fora do sino fecha a lista de alertas.
  useEffect(() => {
    const fora = (e) => { if (!e.target.closest(".sino")) setSinoAberto(false); };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);

  // O detalhe rola até a vista quando abre ou recarrega (o antigo fazia isso
  // logo depois de mostrar o "carregando…").
  useLayoutEffect(() => {
    if (rolagem && secaoDet.current) secaoDet.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [rolagem]);

  async function abrirDetalhe(insumo, casa, manterEscolha, d = dados) {
    if (!manterEscolha) det.current = { insumo: insumo, casa: casa, semana: null, n: det.current.n };
    det.current.insumo = insumo; det.current.casa = casa;
    const l = d.linhas.find((x) => x.insumo_chave === insumo && x.casa === casa);
    setDetalhe({ l, dados: null, n: det.current.n });
    setRolagem((n) => n + 1);
    const { n, semana } = det.current;
    const [serie, ocor] = await Promise.all([
      api.getSerie(insumo, casa, d.inicio, d.fim).then((r) => r.json()),
      api.getOcorrencias(insumo, casa, n, semana).then((r) => r.json()),
    ]);
    setDetalhe({ l, dados: { serie, ocor }, n });
  }

  // Qualquer redesenho tira a mensagem do lugar da tabela, como antes.
  const redesenhar = (mudanca) => { setFiltro((x) => ({ ...x, ...mudanca })); if (dados) setMsgTabela(null); };

  // ---- contas da tela
  // O placar conta sobre loja+insumo, SEM aplicar a situacao: senao, ao escolher
  // "Atenção", os outros contadores zerariam e voce perderia a visao do todo.
  const base = dados ? dados.linhas.filter((l) => (!filtro.casa || l.casa === filtro.casa)
    && (!filtro.insumo || l.insumo === filtro.insumo)) : [];
  const linhas = base.filter((l) => !filtro.situacao || l.situacao === filtro.situacao);
  const conta = {};
  Object.keys(CORES).forEach((s) => { conta[s] = base.filter((l) => l.situacao === s).length; });
  const totalBase = base.length || 1;

  const alertas = dados ? dados.linhas.filter((l) => l.situacao === "Crítico" || l.situacao === "Atenção") : [];
  const criticos = alertas.filter((l) => l.situacao === "Crítico").length;
  const dias = dados ? Math.round((new Date(dados.fim) - new Date(dados.inicio)) / 86400000) + 1 : 0;

  const escolherAlerta = (l) => {
    setSinoAberto(false);
    redesenhar({ casa: "", situacao: "", insumo: dados.linhas.find((x) => x.insumo_chave === l.insumo_chave).insumo });
    abrirDetalhe(l.insumo_chave, l.casa);
  };
  const abrir = (insumo, casa) => abrirDetalhe(insumo, casa);
  const opcoes = (lista, rotulo) => html`<option value="">${rotulo}</option>${lista.map((v) =>
    html`<option key=${v} value=${v}>${v}</option>`)}`;

  let corpoTabela = null;
  if (msgTabela) corpoTabela = html`<p class="vazio">${msgTabela}</p>`;
  else if (dados) {
    corpoTabela = !linhas.length ? html`<p class="vazio">Nada nesse filtro.</p>`
      : visao === "mapa" ? html`<${Mapa} todas=${dados.linhas} linhas=${linhas} abrir=${abrir} />`
      : visao === "dinheiro" ? html`<${Dinheiro} linhas=${linhas} abrir=${abrir} />`
      : html`<${Tabela} linhas=${linhas} abrir=${abrir} />`;
  }

  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Painel de Consumo</h1>
        <p id="periodo-txt">${dados
          ? `${brDate(dados.inicio)} a ${brDate(dados.fim)} · ${dias} dias · ${dados.linhas.length} séries`
          : "carregando…"}</p>
      </div>
      <div class="header-acoes">
        <div class="segmentado" id="visoes">
          ${[["tabela", "Tabela"], ["mapa", "Visão Geral"], ["dinheiro", "Impacto R$"]].map(([v, r]) =>
            html`<button key=${v} data-v=${v} class=${visao === v ? "ativo" : ""}
              onClick=${() => { setVisao(v); if (dados) setMsgTabela(null); }}>${r}</button>`)}
        </div>
        <div class="sino">
          <button class=${"sino-btn" + (criticos > 0 ? " tem-alerta" : "")} id="sino-btn"
                  onClick=${(e) => { e.stopPropagation(); setSinoAberto((a) => !a); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
            <span id="sino-txt">${alertas.length
              ? html`${criticos + " crítico" + (criticos === 1 ? "" : "s") + " "}<span class="sino-n">${alertas.length}</span>`
              : "Sem alertas"}</span>
          </button>
          <div class="sino-lista" id="sino-lista" hidden=${!sinoAberto}>${dados ? html`
            <h3>${alertas.length + " série(s) pedindo atenção"}</h3>
            ${alertas.length ? alertas.slice(0, 25).map((l) => html`
              <button key=${l.insumo_chave + "|" + l.casa} class="alerta-item" data-i=${l.insumo_chave} data-c=${l.casa}
                      onClick=${() => escolherAlerta(l)}>
                <span class=${"selo " + CORES[l.situacao]}>${l.situacao}</span>
                <span class="ai-nome">${l.insumo}<span class="ai-casa">${l.casa_nome}</span></span>
                <span class=${"ai-val " + (l.vs_meta > 0.1 ? "calc neg" : "")}>${pct(l.vs_meta)}</span>
              </button>`) : html`<p class="vazio">Nada fora do padrão no período.</p>`}` : null}</div>
        </div>
      </div>
    </div>

    <section class="barra">
      <label class="campo"><span>De</span><input type="date" id="inicio" value=${inicio}
        onChange=${(e) => { setInicio(e.target.value); carregar(e.target.value, fim); }} /></label>
      <label class="campo"><span>Até</span><input type="date" id="fim" value=${fim}
        onChange=${(e) => { setFim(e.target.value); carregar(inicio, e.target.value); }} /></label>
      <button class="botao" id="ultimos30"
        onClick=${() => { setInicio(""); setFim(""); carregar("", ""); }}>Últimos 30 dias</button>
    </section>

    <div class="placar" id="placar">${dados ? Object.entries(conta).map(([s, n]) => html`
      <button key=${s} class=${"ficha " + CORES[s] + (filtro.situacao === s ? " ativa" : "")} data-sit=${s}
              onClick=${() => redesenhar({ situacao: filtro.situacao === s ? "" : s })}>
        <span class="ficha-topo">
          <span class="ficha-vals"><span class="ficha-n">${n}</span><span class="ficha-r">${s}</span></span>
          <span class="ficha-ico"><${IconeSit} s=${s} /></span>
        </span>
        <span class="ficha-pe">${(n / totalBase * 100).toFixed(0) + "% das séries"}</span>
      </button>`) : null}</div>

    <section class="cartao">
      <div class="filtros">
        <label class="campo"><span>Loja</span><select id="f-casa" value=${filtro.casa}
          onChange=${(e) => redesenhar({ casa: e.target.value })}>${dados ? opcoes(unico(dados.linhas, "casa"), "Todas") : null}</select></label>
        <label class="campo"><span>Insumo</span><select id="f-insumo" value=${filtro.insumo}
          onChange=${(e) => redesenhar({ insumo: e.target.value })}>${dados ? opcoes(unico(dados.linhas, "insumo"), "Todos") : null}</select></label>
        <label class="campo"><span>Situação</span><select id="f-situacao" value=${filtro.situacao}
          onChange=${(e) => redesenhar({ situacao: e.target.value })}>${dados ? opcoes(Object.keys(CORES), "Todas") : null}</select></label>
        <span class="fonte" id="contagem">${!dados ? "" : filtro.situacao
          ? `${linhas.length} em "${filtro.situacao}" · ${base.length} no filtro · ${dados.linhas.length} no total`
          : `${linhas.length} de ${dados.linhas.length} séries`}</span>
      </div>
      <div class="rolagem" id="tabela">${corpoTabela}</div>
    </section>

    ${detalhe ? html`<${Detalhe} l=${detalhe.l} dados=${detalhe.dados} n=${detalhe.n} refSecao=${secaoDet}
      aoTrocarSemana=${(v) => { det.current.semana = v; abrirDetalhe(det.current.insumo, det.current.casa, true); }}
      aoTrocarN=${(v) => { det.current.n = v; abrirDetalhe(det.current.insumo, det.current.casa, true); }}
      aoFechar=${() => setDetalhe(null)} />` : null}
  </main>`;
}

montarTela("painel", Painel);
