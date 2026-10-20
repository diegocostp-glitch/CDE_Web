// ============================================================================
// Visão Geral — a tela inicial do CDE.
//
// Junta num lugar só o que hoje exige abrir quatro telas: quanto cada casa pesa
// no faturamento, o que está parado em estoque, quais itens carregam o custo,
// o que está perto de faltar, o que mudou de um mês para o outro e por quanto
// se comprou. Tudo vem de /api/overview — o servidor faz a conta uma vez e
// manda pronto, porque cruzar oito meses de lançamento no navegador travaria
// a tela em máquina de loja.
//
// Mês em curso é comparado com o MESMO TRECHO do mês anterior (dia 1 ao 16
// contra dia 1 ao 16). Comparar meio mês com mês inteiro mostraria uma queda
// de 50% todo dia 15, e ninguém confia numa tela que grita sem motivo.
// ============================================================================
import { html, useState, useEffect, useRef, useLayoutEffect, Fragment } from "../html.js";
import { fmt, brDate } from "../formato.js";
import * as api from "../api.js";
import { montarTela } from "../montar.js";

const reais = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—" : "R$ " + fmt(n, c);
const curto = (n) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : Math.abs(n) >= 1000000 ? "R$ " + fmt(n / 1000000, 2) + " mi"
  : Math.abs(n) >= 1000 ? "R$ " + fmt(n / 1000, 0) + " mil" : "R$ " + fmt(n);
const pct = (n, c = 1) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : (n >= 0 ? "+" : "") + (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: c }) + "%";
const parte = (n) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

const MES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                  "agosto", "setembro", "outubro", "novembro", "dezembro"];
// Duas formas do mesmo mês: mesBR abre frase e serve de rótulo ("Agosto/2026");
// mesFrase entra no meio de uma frase, onde nome de mês é minúsculo em
// português ("comparado com o mesmo trecho de julho/2026").
const mesFrase = (m) => m ? `${MES_NOME[parseInt(m.slice(5), 10) - 1]}/${m.slice(0, 4)}` : "—";
const mesBR = (m) => {
  const t = mesFrase(m);
  return t === "—" ? t : t.charAt(0).toUpperCase() + t.slice(1);
};

// Uma cor por casa, fixa em todas as peças da tela: a fatia da pizza, a linha
// da tabela e a coluna do gráfico falam da mesma casa com a mesma cor.
const COR_CASA = { SL: "var(--casa-sl)", DC: "var(--casa-dc)",
                   DLU: "var(--casa-dlu)", DLCN: "var(--casa-dlcn)" };
const corCasa = (ck) => COR_CASA[ck] || "var(--tinta-3)";
const SELO_MOV = { entrada: "bom", transferencia: "info", desperdicio: "ruim", consumo: "neutro" };
const Ponto = ({ casa }) => html`<span class="ponto" style=${{ background: corCasa(casa) }}></span>`;

// ======================================================================
// A VISTA — a Visão Geral inteira recortada pela casa escolhida.
//
// O filtro existe para avaliação específica, e avaliação específica não é a
// tela da rede escondendo linhas: o número de cada cartão, a série de doze
// meses e a classe A/B/C da curva têm de ser os DAQUELA casa. Por isso o
// recorte vira uma estrutura própria — a VISTA — com a mesma forma do que o
// servidor manda, e todo desenho lê dela. Sem casa escolhida, a vista É o
// dado do servidor, sem cópia nem custo.
//
// O que o recorte NÃO tenta reconstruir fica explícito em vez de sair errado:
// a pizza de participação continua sendo a da rede (é a comparação entre
// casas, filtrá-la não faria sentido). A minicurva e o impacto em R$ de cada
// insumo usam os valores por casa que o servidor manda em variacao.por_casa —
// a série da rede ao lado dos números de uma casa seria uma mentira discreta.
// ======================================================================
function nomeCasa(DADOS, ck) {
  const c = (DADOS.participacao || []).find((x) => x.casa === ck);
  return c ? c.nome : ck;
}

// A curva ABC recortada é reclassificada: o corte de 80% cai sobre o consumo
// DAQUELA casa. Sem isso, um insumo que é A na rede apareceria como A ali
// mesmo pesando pouco na casa — o engano que o filtro quer evitar. O camarão P
// é A na rede e C na Umarizal.
function abcDaCasa(DADOS, ck) {
  const fatCasa = (DADOS.faturamento_por_casa || {})[ck] || 0;
  const linhas = (DADOS.abc || []).map((a) => ({
    ...a,
    qtd: (a.qtd_por_casa || {})[ck] || 0,
    valor: (a.por_casa || {})[ck] || 0,
  })).filter((a) => a.valor > 0 || a.qtd > 0);

  linhas.sort((x, y) => y.valor - x.valor);
  const total = linhas.reduce((s, a) => s + a.valor, 0) || 1;
  let acumulado = 0;
  linhas.forEach((a) => {
    a.parte = a.valor / total;
    acumulado += a.parte;
    a.acumulado = acumulado;
    a.classe = acumulado <= 0.8 ? "A" : (acumulado <= 0.95 ? "B" : "C");
    a.sobre_faturamento = fatCasa ? a.valor / fatCasa : null;
  });
  return linhas;
}

function variacaoDaCasa(DADOS, ck) {
  return (DADOS.variacao || []).map((v) => {
    const c = (v.por_casa || {})[ck];
    if (!c) return null;
    return {
      ...v, atual: c.atual, anterior: c.anterior, variacao: c.variacao,
      diferenca: c.atual - c.anterior,
      // Impacto e minicurva também vêm recortados pelo servidor. Se faltarem
      // (servidor antigo), melhor não mostrar do que mostrar os da rede.
      impacto_reais: c.impacto_reais === undefined ? null : c.impacto_reais,
      serie: c.serie || null,
    };
  }).filter(Boolean)
    .sort((a, b) => Math.abs(b.variacao || 0) - Math.abs(a.variacao || 0));
}

function montarVista(DADOS, ck) {
  if (!ck) return DADOS;
  const part = (DADOS.participacao || []).find((x) => x.casa === ck) || {};
  const estoque = (DADOS.estoque || []).filter((l) => l.casa === ck);
  return {
    ...DADOS,
    casa_filtro: ck,
    casa_filtro_nome: nomeCasa(DADOS, ck),
    consumo_valor: (DADOS.consumo_valor_por_casa || {})[ck] || 0,
    consumo_valor_anterior: (DADOS.consumo_valor_anterior_por_casa || {})[ck] || 0,
    faturamento_total: (DADOS.faturamento_por_casa || {})[ck] || 0,
    faturamento_anterior: part.anterior || 0,
    serie_meses: (DADOS.serie_meses || []).map((m) => ({
      ...m,
      faturamento: (m.por_casa || {})[ck] || 0,
      consumo_valor: (m.consumo_por_casa || {})[ck] || 0,
      faturamento_trecho: (m.por_casa_trecho || m.por_casa || {})[ck] || 0,
      consumo_valor_trecho: (m.consumo_por_casa_trecho || m.consumo_por_casa || {})[ck] || 0,
      peso: (m.por_casa || {})[ck]
        ? ((m.consumo_por_casa || {})[ck] || 0) / m.por_casa[ck] : null,
    })),
    abc: abcDaCasa(DADOS, ck),
    variacao: variacaoDaCasa(DADOS, ck),
    estoque,
    valor_estoque: estoque.reduce((s, l) => s + (l.valor || 0), 0),
    criticos: (DADOS.criticos || []).filter((l) => l.casa === ck),
    perdas: (DADOS.perdas || []).filter((l) => l.casa === ck),
    movimentos: (DADOS.movimentos || []).filter((l) => l.casa === ck),
    compras: (DADOS.compras || []).filter((l) => !l.casa || l.casa === ck),
  };
}

// ------------------------------------------------------------------ curva suave
// Mesma linguagem do Painel de Consumo: curva suave, área em degradê, último
// ponto destacado. Quem já usa aquela tela lê esta sem aprender nada novo.
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

// ------------------------------------------------------------------ destaques
// Cada cartão carrega quatro coisas: o que é, quanto é, quanto mudou e como
// vinha vindo. Leem da VISTA, não do DADOS: com casa escolhida, os seis números,
// variações e curvas são os daquela casa — o mês já chega certo do servidor.
const ICO_INS = {
  alta: html`<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
  queda: html`<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>`,
  dinheiro: html`<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>`,
  consumo: html`<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>`,
  caixa: html`<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/>`,
  alerta: html`<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  perda: html`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,
};
const SvgIns = ({ d }) => html`<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// Os seis cartões, na ordem de quem decide: o dinheiro que entrou, o que dele
// virou insumo, o que está parado, o que mais subiu, o que mais caiu e o que
// vai faltar.
function destaques(d) {
  const fora = [];
  // no mês em curso as curvas dos blocos usam o mesmo trecho de cada mês, para
  // a curva não desmentir a variação escrita ao lado dela
  const serieFat = (d.serie_meses || []).map((m) => d.parcial ? m.faturamento_trecho : m.faturamento);
  const serieConsumo = (d.serie_meses || []).map((m) => d.parcial ? m.consumo_valor_trecho : m.consumo_valor);
  const contexto = d.parcial ? `vs. mesmo trecho de ${mesFrase(d.mes_anterior)}`
                             : `vs. ${mesFrase(d.mes_anterior)}`;

  fora.push({
    rotulo: d.casa_filtro ? `Faturamento (Bruto) — ${d.casa_filtro_nome}` : "Faturamento (Bruto) do grupo",
    valor: curto(d.faturamento_total),
    delta: d.faturamento_anterior
      ? (d.faturamento_total - d.faturamento_anterior) / d.faturamento_anterior : null,
    bomSeSobe: true, icone: ICO_INS.dinheiro, contexto, serie: serieFat,
  });
  fora.push({
    rotulo: "Consumo de insumo", valor: curto(d.consumo_valor),
    delta: d.consumo_valor_anterior
      ? (d.consumo_valor - d.consumo_valor_anterior) / d.consumo_valor_anterior : null,
    bomSeSobe: false, icone: ICO_INS.consumo,
    contexto: d.faturamento_total
      ? `${parte(d.consumo_valor / d.faturamento_total)} do faturamento bruto` : contexto,
    serie: serieConsumo,
  });
  fora.push({
    rotulo: "Custo do estoque atual", valor: curto(d.valor_estoque),
    delta: null, tom: "neutro", icone: ICO_INS.caixa,
    contexto: `${d.estoque.length} contagens de insumo por casa`, serie: null,
  });

  const comVar = (d.variacao || []).filter((v) => v.variacao !== null && v.anterior > 0);
  const subiu = comVar.filter((v) => v.diferenca > 0)
    .sort((a, b) => (b.impacto_reais || 0) - (a.impacto_reais || 0))[0];
  const caiu = comVar.filter((v) => v.diferenca < 0)
    .sort((a, b) => (a.impacto_reais || 0) - (b.impacto_reais || 0))[0];

  // o número grande é a DIFERENÇA, não o total consumido: o cartão fala de
  // mudança, e o total ia no mesmo tamanho fazendo parecer que "subiu 120 kg"
  // quando 120 kg era o consumo inteiro. O total continua legível no rodapé.
  if (subiu) fora.push({
    rotulo: `${subiu.insumo} subiu`, valor: `+${fmt(subiu.diferenca, 1)} ${subiu.un}`,
    delta: subiu.variacao, bomSeSobe: false, icone: ICO_INS.alta,
    contexto: subiu.impacto_reais
      ? `${curto(subiu.impacto_reais)} a mais no período · ${fmt(subiu.atual, 1)} ${subiu.un} no total`
      : `${fmt(subiu.atual, 1)} ${subiu.un} no total`,
    serie: subiu.serie,
  });
  if (caiu) fora.push({
    rotulo: `${caiu.insumo} caiu`,
    valor: `−${fmt(Math.abs(caiu.diferenca), 1)} ${caiu.un}`,
    delta: caiu.variacao, bomSeSobe: false, icone: ICO_INS.queda,
    contexto: caiu.impacto_reais
      ? `${curto(Math.abs(caiu.impacto_reais))} economizados · ${fmt(caiu.atual, 1)} ${caiu.un} no total`
      : `${fmt(caiu.atual, 1)} ${caiu.un} no total`,
    serie: caiu.serie,
  });

  const abaixo = (d.criticos || []).filter((c) => c.situacao === "abaixo");
  const perda = (d.perdas || []).reduce((s, x) => s + (x.valor || 0), 0);
  if (abaixo.length) {
    fora.push({
      rotulo: "Itens abaixo do mínimo", valor: String(abaixo.length),
      delta: null, tom: "ruim", icone: ICO_INS.alerta, alvo: "minimos",
      contexto: `${abaixo[0].insumo} em ${abaixo[0].casa} é o mais crítico`, serie: null,
    });
  } else {
    fora.push({
      rotulo: "Desperdício no mês", valor: curto(perda),
      delta: null, tom: perda > 0 ? "aviso" : "bom", icone: ICO_INS.perda,
      contexto: d.perdas.length ? `${d.perdas[0].insumo} responde pela maior parte`
                                : "Nada lançado como perda", serie: null,
    });
  }
  return fora;
}

// mini curva do rodapé do cartão — mesma linguagem do resto da tela
function MiniCurva({ serie, cor, id }) {
  const vals = (serie || []).filter((v) => isFinite(v));
  if (vals.length < 2) return null;
  const W = 150, H = 34;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => (i * W) / (vals.length - 1);
  const y = (v) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const linha = caminhoSuave(vals.map((v, i) => [x(i), y(v)]));
  return html`<svg class="ins-curva" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <defs><linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color=${cor} stop-opacity=".30"/>
      <stop offset="100%" stop-color=${cor} stop-opacity="0"/>
    </linearGradient></defs>
    <path d=${`${linha} L${W},${H} L0,${H} Z`} fill=${`url(#${id})`}/>
    <path d=${linha} fill="none" stroke=${cor} stroke-width="2"
          stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function Insights({ vista, abrirSecao }) {
  const lista = destaques(vista);
  const tomDe = (i) => i.tom ? i.tom
    : i.delta === null ? "neutro"
    : (i.delta > 0) === !!i.bomSeSobe ? "bom" : "ruim";
  const corDe = (t) => t === "bom" ? "var(--bom)" : t === "ruim" ? "var(--ruim)"
    : t === "aviso" ? "var(--aviso)" : "var(--info)";
  // o cartão de estoque baixo leva à seção detalhada, como os cartões de baixo
  return lista.map((i, n) => {
    const tom = tomDe(i);
    return html`<div key=${n} class=${"ins" + (i.alvo ? " ins-clicavel" : "")} data-alvo=${i.alvo}
        onClick=${i.alvo ? () => abrirSecao(i.alvo) : undefined}>
      <div class="ins-topo">
        <span class=${"ins-ico " + tom}><${SvgIns} d=${i.icone} /></span>
        <span class="ins-rotulo">${i.rotulo}</span>
      </div>
      <span class="ins-valor">${i.valor}</span>
      <div class="ins-rodape">
        ${i.delta === null ? null : html`<span class=${"ins-pilula " + tom}><${SvgIns} d=${i.delta > 0 ? ICO_INS.alta : ICO_INS.queda} />${pct(i.delta, 0)}</span>`}
        <span class="ins-contexto">${i.contexto}</span>
      </div>
      <${MiniCurva} serie=${i.serie} cor=${corDe(tom)} id=${"mg" + n} />
    </div>`;
  });
}

// ------------------------------------------------------------------ rosca
// Réplica do modelo de referência (modelo de grafico de pizza.png), medido
// pixel a pixel na imagem para não sair uma interpretação livre dele:
//
//   • gomo com CORTE RETO radial nas duas pontas — não é ponta arredondada;
//   • folga de 2° entre um gomo e o seguinte;
//   • raio interno igual para todos (60% do raio externo maior);
//   • espessura variável: o gomo maior é o mais grosso (no modelo, de 21% a
//     40% do raio externo), o que dá o relevo característico do desenho;
//   • quina levemente arredondada — no modelo, cerca de 1% do diâmetro.
//
// Por isso o gomo é um caminho preenchido (arco externo, corte, arco interno,
// corte) e não um traço: traço com ponta redonda foi o que o modelo não pediu.
const R_INT = 55, ESP_MIN = 20, ESP_MAX = 37, FOLGA = 2, CONTORNO = 3;
// O contorno é da cor do CARTÃO, não da fatia: ele recorta o gomo do fundo em
// vez de engrossá-lo.

// Um gomo: arco externo no sentido horário, corte reto, arco interno de volta.
function gomoPath(a0, a1, rInt, rExt) {
  const pt = (a, r) => [(100 + r * Math.cos(a * Math.PI / 180)).toFixed(2),
                        (100 + r * Math.sin(a * Math.PI / 180)).toFixed(2)];
  const grande = (a1 - a0) > 180 ? 1 : 0;
  const [x1, y1] = pt(a0, rExt), [x2, y2] = pt(a1, rExt);
  const [x3, y3] = pt(a1, rInt), [x4, y4] = pt(a0, rInt);
  return `M${x1},${y1} A${rExt},${rExt} 0 ${grande} 1 ${x2},${y2} ` +
         `L${x3},${y3} A${rInt},${rInt} 0 ${grande} 0 ${x4},${y4} Z`;
}

// Passar o mouse acende o gomo e apaga os outros; o miolo troca o total pelo
// valor daquela casa, que é o número que a pessoa foi buscar ao apontar. A
// linha da tabela acende o mesmo gomo: são a mesma casa, ditas de dois jeitos.
function Participacao({ vista }) {
  const [acesa, setAcesa] = useState(null);
  const dados = (vista.participacao || []).filter((p) => p.valor > 0);
  const total = dados.reduce((s, p) => s + p.valor, 0);
  let pizza;
  if (!total) pizza = html`<p class="vazio">Sem faturamento bruto lançado no mês.</p>`;
  else {
    const maior = Math.max(...dados.map((p) => p.valor));
    let ang = -90;                                // começa no topo
    const gomos = dados.map((p) => {
      const abertura = (p.valor / total) * 360;
      const a0 = ang, a1 = ang + abertura;
      ang = a1;
      // a folga sai por dentro do gomo, metade de cada lado, para os limites
      // entre as casas continuarem nos ângulos certos
      const folga = Math.min(FOLGA, abertura * 0.5);
      const rExt = R_INT + ESP_MIN + (ESP_MAX - ESP_MIN) * (p.valor / maior);
      return { p, d: gomoPath(a0 + folga / 2, a1 - folga / 2, R_INT, rExt) };
    });
    const casa = dados.find((p) => p.casa === acesa);
    // Sem legenda embaixo: a tabela ao lado já traz nome, cor (no ponto) e
    // participação de cada casa. Duas listas dizendo o mesmo só ocupavam altura.
    pizza = html`<svg viewBox="0 0 200 200" class="pizza">
      <g id="gomos">${gomos.map((g) => html`
        <path key=${g.p.casa} class=${"fatia" + (acesa === g.p.casa ? " ativa" : "") + (acesa !== null && acesa !== g.p.casa ? " apagada" : "")}
              data-casa=${g.p.casa} d=${g.d}
              fill=${corCasa(g.p.casa)} stroke="var(--card)"
              stroke-width=${CONTORNO} stroke-linejoin="round" stroke-linecap="round"
              onMouseEnter=${() => setAcesa(g.p.casa)} onMouseLeave=${() => setAcesa(null)}/>`)}
      </g>
      <circle cx="100" cy="100" r=${R_INT - 1} fill="var(--card)"
              stroke="var(--linha-tabela)" stroke-width="2"/>
      <text x="100" y="98" text-anchor="middle" class="pizza-total" id="pz-valor">${casa ? curto(casa.valor) : curto(total)}</text>
      <text x="100" y="113" text-anchor="middle" class="pizza-rot" id="pz-rotulo">${casa
        ? `${casa.nome} · ${parte(casa.parte)}` : "faturamento bruto do grupo"}</text>
    </svg>`;
  }
  const tabela = !total ? null : html`<table>
    <thead><tr><th>Casa</th><th>Faturamento (Bruto)</th><th>Participação</th>
      <th>${vista.parcial ? "Mesmo trecho do mês anterior" : "Mês anterior"}</th><th>Variação</th></tr></thead>
    <tbody>${vista.participacao.map((p) => html`
      <tr key=${p.casa} data-casa=${p.casa} onMouseEnter=${() => setAcesa(p.casa)} onMouseLeave=${() => setAcesa(null)}>
        <td><${Ponto} casa=${p.casa} />${p.nome + " "}<span class="un">${p.casa}</span></td>
        <td class="calc">${reais(p.valor)}</td>
        <td class="calc">${parte(p.parte)}</td>
        <td class="calc">${reais(p.anterior)}</td>
        <td class=${"calc " + (p.variacao !== null && p.variacao < 0 ? "neg" : "")}>${pct(p.variacao)}</td>
      </tr>`)}
      <tr class="linha-total"><td><strong>Grupo</strong></td>
        <td class="calc"><strong>${reais(vista.faturamento_total)}</strong></td>
        <td class="calc">100%</td>
        <td class="calc">${reais(vista.faturamento_anterior)}</td>
        <td class="calc">${pct(vista.faturamento_anterior
          ? (vista.faturamento_total - vista.faturamento_anterior) / vista.faturamento_anterior : null)}</td>
      </tr>
    </tbody></table>`;
  return html`<div class="pizza-bloco">
      <div id="pizza">${pizza}</div>
      <div class="rolagem" id="tabela-casas">${tabela}</div>
    </div>`;
}

// ------------------------------------------------------------------ gráficos
// Mesmo desenho dos gráficos grandes do Painel de Consumo: curva suave, área em
// degradê, faixa vertical arredondada atrás do ponto em destaque e o rótulo
// daquele ponto em peso maior.
//
// Gráfico dinâmico: o destaque (faixa, guia, halo, ponto, rótulo em negrito)
// segue o mouse, e NADA é redesenhado — só esses elementos trocam de posição,
// direto nos atributos, como antes. Redesenhar a cada mousemove piscava a curva.
// Em repouso o gráfico mostra o mês mais recente; a guia some quando o mouse sai.
function destacar(svg, i) {
  const alvo = svg.querySelector(`.g-alvo[data-i="${i}"]`);
  if (!alvo) return;
  const cx = alvo.getAttribute("cx"), cy = alvo.getAttribute("cy");
  const base = svg.dataset.base;
  const faixa = svg.querySelector(".g-faixa");
  if (faixa) {
    // 38 de largura centrada no ponto: nas duas pontas da curva ela passaria da
    // area do grafico e apareceria cortada pela borda do SVG.
    const fx = Math.min(Math.max(parseFloat(cx) - 19, 0), 900 - 38);
    faixa.setAttribute("x", fx.toFixed(1));
    faixa.setAttribute("y", cy);
    faixa.setAttribute("height", Math.max(0, base - parseFloat(cy)).toFixed(1));
  }
  const guia = svg.querySelector(".g-guia");
  if (guia) { guia.setAttribute("x1", cx); guia.setAttribute("x2", cx); }
  ["g-halo", "g-ponto"].forEach((c) => {
    const el = svg.querySelector("." + c);
    if (el) { el.setAttribute("cx", cx); el.setAttribute("cy", cy); }
  });
  svg.querySelectorAll("text[data-i]").forEach((t) => {
    t.classList.toggle("eixo-forte", Number(t.dataset.i) === i);
  });
  const leitura = svg.parentElement.querySelector(".g-leitura");
  const titulo = alvo.querySelector("title");
  if (leitura && titulo) leitura.textContent = titulo.textContent;
}

function Grafico({ serie, rotulo, cor, formata, id }) {
  const svgRef = useRef(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const guia = svg.querySelector(".g-guia");
    const k = Number(svg.dataset.k);
    const voltarAoPadrao = () => {
      destacar(svg, k);
      if (guia) guia.setAttribute("opacity", "0");
    };
    // O mouse raramente cai exatamente sobre um ponto: o indice sai da posicao
    // horizontal, arredondada para o ponto mais proximo. Assim a curva inteira
    // responde, nao apenas os circulos de 10px de raio.
    const mover = (e) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const alvos = svg.querySelectorAll(".g-alvo");
      if (!alvos.length) return;
      const vbX = ((e.clientX - r.left) / r.width) * 900;
      let melhor = 0, dist = Infinity;
      alvos.forEach((a) => {
        const d = Math.abs(parseFloat(a.getAttribute("cx")) - vbX);
        if (d < dist) { dist = d; melhor = Number(a.dataset.i); }
      });
      destacar(svg, melhor);
      if (guia) guia.setAttribute("opacity", ".45");
    };
    // Toque: um toque na curva destaca o periodo apontado
    const toque = (e) => { if (e.touches[0]) mover(e.touches[0]); };
    svg.addEventListener("mousemove", mover);
    svg.addEventListener("mouseleave", voltarAoPadrao);
    svg.addEventListener("touchmove", toque, { passive: true });
    voltarAoPadrao();
    return () => {
      svg.removeEventListener("mousemove", mover);
      svg.removeEventListener("mouseleave", voltarAoPadrao);
      svg.removeEventListener("touchmove", toque);
    };
  }, []);

  if (serie.length < 2) return html`<p class="vazio">Poucos meses para desenhar a curva.</p>`;
  const L = 8, T = 18, W = 900, H = 250, R = 74;
  const PW = W - L - R, PH = H - T - 40;
  const vals = serie.map((p) => p.v);
  const lo = Math.min(...vals) * 0.88, hi = Math.max(...vals) * 1.10;
  const x = (i) => L + (i * PW) / (serie.length - 1);
  const y = (v) => T + PH - ((v - lo) / (hi - lo || 1)) * PH;
  const pts = serie.map((p, i) => [x(i), y(p.v)]);
  const k = serie.length - 1;              // o destaque é sempre o mês mais recente
  const linha = caminhoSuave(pts);
  const area = linha + ` L${x(k).toFixed(1)},${T + PH} L${L},${T + PH} Z`;
  const base = T + PH;
  return html`<div class="grafico-bloco" data-dinamico="1">
    <h3>${rotulo}</h3>
    <div class="g-leitura">${serie[k].titulo}</div>
    <svg viewBox=${`0 0 ${W} ${H}`} class="grafico" ref=${svgRef}
         data-k=${k} data-base=${base.toFixed(1)} data-cor=${cor}>
      <defs>
        <linearGradient id=${id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color=${cor} stop-opacity=".34"/>
          <stop offset="100%" stop-color=${cor} stop-opacity="0"/>
        </linearGradient>
        <linearGradient id=${id + "b"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color=${cor} stop-opacity=".30"/>
          <stop offset="100%" stop-color=${cor} stop-opacity=".02"/>
        </linearGradient>
      </defs>
      ${[0, 0.5, 1].map((f) => {
        const v = lo + (hi - lo) * f;
        return html`<text key=${"e" + f} x=${W - R + 12} y=${(y(v) + 4).toFixed(1)} class="eixo">${formata(v)}</text>`;
      })}
      <rect class="g-faixa" x=${(x(k) - 19).toFixed(1)} y=${y(serie[k].v).toFixed(1)}
         width="38" height=${(T + PH - y(serie[k].v)).toFixed(1)} rx="19" fill=${`url(#${id}b)`}/>
      <path d=${area} fill=${`url(#${id})`}/>
      <path d=${linha} fill="none" stroke=${cor} stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"/>
      <line class="g-guia" x1=${x(k).toFixed(1)} y1=${T} x2=${x(k).toFixed(1)}
            y2=${base.toFixed(1)} stroke=${cor} stroke-width="1"
            stroke-dasharray="3 3" opacity="0"/>
      <circle class="g-halo" cx=${x(k).toFixed(1)} cy=${y(serie[k].v).toFixed(1)} r="9"
              fill=${cor} opacity=".22"/>
      <circle class="g-ponto" cx=${x(k).toFixed(1)} cy=${y(serie[k].v).toFixed(1)} r="4.5"
              fill=${cor} stroke="var(--card)" stroke-width="2"/>
      ${serie.map((p, i) => html`<text key=${"r" + i} x=${x(i).toFixed(1)} y=${H - 12} text-anchor="middle" data-i=${i}
         class=${"eixo" + (i === k ? " eixo-forte" : "")}>${p.rotulo}</text>`)}
      ${serie.map((p, i) => html`<circle key=${"a" + i} cx=${x(i).toFixed(1)} cy=${y(p.v).toFixed(1)} r="10" fill="transparent"
               class="g-alvo" data-i=${i}><title>${p.titulo}</title></circle>`)}
    </svg>
    <div class="legenda"><span class="lg-serie" style=${{ color: cor }}><i></i>${rotulo}</span></div>
    </div>`;
}

function GraficosMes({ vista }) {
  const s = vista.serie_meses || [];
  const fatur = s.map((m) => ({ v: m.faturamento, rotulo: mesBR(m.mes).slice(0, 3),
    titulo: `${mesBR(m.mes)} — ${reais(m.faturamento)}` }));
  const peso = s.filter((m) => m.peso !== null).map((m) => ({ v: m.peso * 100,
    rotulo: mesBR(m.mes).slice(0, 3),
    titulo: `${mesBR(m.mes)} — ${parte(m.peso)} do faturamento bruto em insumo` }));
  // cada gráfico renasce quando os números mudam (mês ou casa), como o
  // innerHTML antigo: o destaque volta ao mês mais recente
  const chave = (serie) => serie.map((p) => p.v + p.titulo).join("|");
  return html`<${Grafico} key=${"f" + chave(fatur)} id="og-fat" serie=${fatur} rotulo="Faturamento (Bruto) do grupo por mês"
      cor="var(--laranja)" formata=${(v) => curto(v)} />${peso.length > 1
      ? html`<${Grafico} key=${"p" + chave(peso)} id="og-peso" serie=${peso} rotulo="Consumo de insumo sobre o Faturamento (Bruto)"
          cor="var(--info)" formata=${(v) => fmt(v, 1) + "%"} />` : null}<p class="fonte">O último mês pode estar em curso — a curva sobe de novo quando o mês fecha.</p>`;
}

// ------------------------------------------------------------------ seções
// Uma linha por insumo: posição, nome e valor. O detalhe (quantidade, peso no
// faturamento, classe) está a um clique, no relatório completo.
function TopInsumos({ abc }) {
  if (!abc.length) return html`<p class="vazio">Sem consumo valorizado no mês.</p>`;
  return html`<div class="lista-top">${abc.slice(0, 4).map((a, i) => html`
      <div class="lt-linha" key=${a.insumo}>
        <span class="lt-pos">${i + 1}</span>
        <span class="lt-nome">${a.insumo}</span>
        <span class="lt-val">${curto(a.valor) + " "}<small>${a.sobre_faturamento !== null ? parte(a.sobre_faturamento) + " do fat. bruto" : "—"}</small></span>
      </div>`)}</div>`;
}

function TabelaABC({ vista }) {
  const abc = vista.abc || [];
  if (!abc.length) return null;
  return html`<table>
    <thead><tr><th>Classe</th><th>Insumo</th><th>Quantidade</th><th>Custo no mês</th>
      <th>% do custo</th><th>Acumulado</th><th>% do fat. bruto</th></tr></thead>
    <tbody>${abc.map((a) => html`
      <tr key=${a.insumo}>
        <td><span class=${"selo " + (a.classe === "A" ? "ruim" : a.classe === "B" ? "aviso" : "neutro")}>${a.classe}</span></td>
        <td>${a.insumo + " "}<span class="un">${"(" + a.un + ")"}</span>${a.com_custo ? null
          : html`${" "}<span class="selo-mini" title="Sem custo cadastrado — entra só na contagem">sem custo</span>`}</td>
        <td class="calc">${fmt(a.qtd, 1)}</td>
        <td class="calc">${reais(a.valor)}</td>
        <td class="calc">${parte(a.parte)}</td>
        <td class="calc">${parte(a.acumulado)}</td>
        <td class="calc">${parte(a.sobre_faturamento)}</td>
      </tr>`)}</tbody></table>${vista.sem_custo.length
    ? html`<p class="fonte" style=${{ marginTop: "8px" }}>${`Sem custo cadastrado: ${vista.sem_custo.join(", ")}. Preencha `}<code>dados/custos.json</code> ou vincule o produto do catálogo em Cadastros — o custo do catálogo só é aproveitado quando o produto é vendido em KG.</p>`
    : null}`;
}

// Barra por item, medindo o estoque contra o mínimo de segurança. A régua vai
// até 100% do mínimo: barra curta é item para comprar hoje.
function BarrasEstoque({ criticos }) {
  const lista = (criticos || []).slice(0, 4);
  if (!lista.length) return html`<p class="vazio">Estoque coberto.</p>`;
  return html`<div class="barras-min">${lista.map((l, n) => {
    const nivel = l.minimo > 0 ? Math.min(l.qtd / l.minimo, 1) : 0;
    const cor = l.situacao === "abaixo" ? "var(--ruim)" : "var(--aviso)";
    return html`<div key=${n} class="bm-linha" title=${`${l.insumo} em ${l.casa_nome}: ${fmt(l.qtd, 2)} ${l.un} para um mínimo de ${fmt(l.minimo, 2)}`}>
        <span class="bm-nome">${l.insumo + " "}<small>${l.casa}</small></span>
        <span class=${"bm-val" + (l.qtd <= 0.0005 ? " zerado" : "")}>${fmt(l.qtd, 1) + " "}<small>${"/ " + fmt(l.minimo, 1)}</small></span>
        <span class="bm-trilho"><span class="bm-preenche" style=${{ width: (nivel * 100).toFixed(1) + "%", background: cor }}></span></span>
      </div>`;
  })}</div>`;
}

// As quatro maiores mudanças de consumo contra o mês anterior, em dinheiro.
// Seta para cima é consumo a mais — que é gasto a mais, por isso vermelha.
function TopVariacao({ variacao }) {
  const lista = (variacao || []).slice(0, 4);
  if (!lista.length) return html`<p class="vazio">Sem comparação.</p>`;
  return html`<div class="lista-top">${lista.map((v) => {
    const sobe = (v.diferenca || 0) > 0;
    return html`<div key=${v.insumo} class="lt-linha" title=${`${v.insumo}: ${fmt(v.atual, 1)} contra ${fmt(v.anterior, 1)} ${v.un}`}>
        <span class=${"lt-seta " + (sobe ? "sobe" : "desce")}>${sobe ? "▲" : "▼"}</span>
        <span class="lt-nome">${v.insumo}</span>
        <span class=${"lt-val " + (sobe ? "neg" : "")}>${pct(v.variacao, 0) + " "}<small>${v.impacto_reais === null ? fmt(v.diferenca, 1) + " " + v.un
          : (v.impacto_reais > 0 ? "+" : "") + curto(v.impacto_reais)}</small></span>
      </div>`;
  })}</div>`;
}

function TopMovimentos({ movimentos }) {
  const lista = (movimentos || []).slice(0, 4);
  if (!lista.length) return html`<p class="vazio">Sem movimento.</p>`;
  return html`<div class="lista-top">${lista.map((m, n) => html`
      <div key=${n} class="lt-linha" title=${`${m.tipo_nome} · ${m.casa_nome} · ${brDate(m.data)}`}>
        <span class=${"lt-marca " + (SELO_MOV[m.tipo] || "neutro")}></span>
        <span class="lt-nome">${m.insumo + " "}<small>${`${m.casa} · ${brDate(m.data).slice(0, 5)}`}</small></span>
        <span class="lt-val">${fmt(m.qtd, 1) + " "}<small>${m.un}</small></span>
      </div>`)}</div>`;
}

function TabelaMinimos({ criticos }) {
  const lista = criticos || [];
  if (!lista.length) return html`<p class="vazio">Nenhum item abaixo do mínimo de segurança. Estoque coberto.</p>`;
  return html`<table>
    <thead><tr><th>Insumo</th><th>Casa</th><th>Em estoque</th><th>Mínimo</th>
      <th>Consumo/dia</th><th>Cobertura</th><th>Contado em</th><th>Situação</th></tr></thead>
    <tbody>${lista.map((l, n) => html`
      <tr key=${n}>
        <td>${l.insumo + " "}<span class="un">${"(" + l.un + ")"}</span></td>
        <td><${Ponto} casa=${l.casa} />${l.casa_nome}</td>
        <td class=${"calc " + (l.situacao === "abaixo" ? "neg" : "")}>${fmt(l.qtd, 2)}</td>
        <td class="calc">${fmt(l.minimo, 2)}</td>
        <td class="calc">${fmt(l.media_dia, 2)}</td>
        <td class="calc">${l.dias_cobertura === null ? "—" : fmt(l.dias_cobertura, 1) + " d"}</td>
        <td class="fonte">${brDate(l.contado_em)}</td>
        <td><span class=${"selo " + (l.situacao === "abaixo" ? "ruim" : "aviso")}>${
          l.situacao === "abaixo" ? "abaixo do mínimo" : "no limite"}</span></td>
      </tr>`)}</tbody></table>`;
}

function TabelaEstoque({ lista, total }) {
  return html`<table>
    <thead><tr><th>Insumo</th><th>Casa</th><th>Quantidade</th><th>Custo unit.</th>
      <th>Valor</th><th>Cobertura</th><th>Contado em</th></tr></thead>
    <tbody>${lista.map((l, n) => html`
      <tr key=${n}>
        <td>${l.insumo + " "}<span class="un">${"(" + l.un + ")"}</span></td>
        <td><${Ponto} casa=${l.casa} />${l.casa_nome}</td>
        <td class="calc">${fmt(l.qtd, 2)}</td>
        <td class="calc" title=${l.fonte_custo === "catalogo"
          ? "preço do catálogo de compras" : "dados/custos.json"}>${l.custo_un === null ? "—" : reais(l.custo_un)}</td>
        <td class="calc">${l.valor === null ? "—" : reais(l.valor)}</td>
        <td class=${"calc " + (l.situacao === "abaixo" ? "neg" : "")}>${
          l.dias_cobertura === null ? "sem consumo" : fmt(l.dias_cobertura, 1) + " d"}</td>
        <td class="fonte">${brDate(l.contado_em)}</td>
      </tr>`)}
      <tr class="linha-total"><td colSpan="4"><strong>Total em estoque</strong></td>
        <td class="calc"><strong>${reais(total)}</strong></td><td></td><td></td></tr>
    </tbody></table>`;
}

function TabelaVariacao({ vista }) {
  const lista = vista.variacao || [];
  const casas = vista.participacao.map((p) => p.casa);
  if (!lista.length) return html`<p class="vazio">Sem consumo nos dois meses.</p>`;
  return html`<table>
    <thead><tr><th>Insumo</th><th>Mês atual</th><th>Mês anterior</th><th>Diferença</th>
      <th>Variação</th><th>Impacto R$</th>${casas.map((c) => html`<th key=${c}>${c}</th>`)}</tr></thead>
    <tbody>${lista.map((v) => html`
      <tr key=${v.insumo}>
        <td>${v.insumo + " "}<span class="un">${"(" + v.un + ")"}</span></td>
        <td class="calc">${fmt(v.atual, 1)}</td>
        <td class="calc">${fmt(v.anterior, 1)}</td>
        <td class=${"calc " + (v.diferenca > 0 ? "neg" : "")}>${(v.diferenca > 0 ? "+" : "") + fmt(v.diferenca, 1)}</td>
        <td class=${"calc " + (v.variacao !== null && v.variacao > 0 ? "neg" : "")}>${pct(v.variacao)}</td>
        <td class=${"calc " + (v.impacto_reais > 0 ? "neg" : "")}>${v.impacto_reais === null ? "—"
          : (v.impacto_reais > 0 ? "+" : "") + reais(v.impacto_reais)}</td>
        ${casas.map((c) => {
          const x = v.por_casa[c] || {};
          return html`<td key=${c} class=${"calc " + (x.variacao !== null && x.variacao > 0 ? "neg" : "")}
            title=${`${fmt(x.atual, 1)} contra ${fmt(x.anterior, 1)}`}>${pct(x.variacao, 0)}</td>`;
        })}
      </tr>`)}</tbody></table><p class="fonte" style=${{ marginTop: "8px" }}>Impacto em R$ = diferença de quantidade × custo unitário. Positivo é consumo a mais que o mês anterior.</p>`;
}

function TabelaCompras({ compras }) {
  const lista = compras || [];
  if (!lista.length) {
    return html`<p class="vazio">Nenhuma ordem de compra com preço no mês.<br /><span class="fonte">Esta tabela se enche sozinha conforme as OCs vão sendo geradas em <a href="ordens.html">Ordens de Compras</a>.</span></p>`;
  }
  return html`<table>
    <thead><tr><th>Unidade compradora</th><th>Produto</th><th>Quantidade</th><th>Gasto</th>
      <th>Custo unit.</th><th>Mês anterior</th><th>Variação</th></tr></thead>
    <tbody>${lista.map((c, n) => html`
      <tr key=${n}>
        <td>${c.unidade}</td>
        <td>${c.produto + " "}<span class="un">${c.un}</span></td>
        <td class="calc">${fmt(c.qtd, 2)}</td>
        <td class="calc">${reais(c.gasto)}</td>
        <td class="calc">${c.custo_un === null ? "—" : reais(c.custo_un)}</td>
        <td class="calc">${c.custo_un_anterior === null ? "—" : reais(c.custo_un_anterior)}</td>
        <td class=${"calc " + (c.variacao !== null && c.variacao > 0 ? "neg" : "")}>${pct(c.variacao)}</td>
      </tr>`)}</tbody></table>`;
}

function TabelaMovimentos({ movimentos }) {
  const lista = movimentos || [];
  if (!lista.length) return html`<p class="vazio">Sem movimentação no mês.</p>`;
  return html`<table>
    <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th><th>Quantidade</th><th>Origem</th></tr></thead>
    <tbody>${lista.map((m, n) => html`
      <tr key=${n}>
        <td class="fonte">${brDate(m.data)}</td>
        <td><${Ponto} casa=${m.casa} />${m.casa_nome}</td>
        <td>${m.insumo}</td>
        <td><span class=${"selo " + (SELO_MOV[m.tipo] || "neutro")}>${m.tipo_nome}</span></td>
        <td class="calc">${fmt(m.qtd, 2) + " "}<span class="un">${m.un}</span></td>
        <td class="fonte">${m.origem}</td>
      </tr>`)}</tbody></table>`;
}

// ------------------------------------------------------------------ dobradiças
// A tela é longa por natureza: sete relatórios em sequência empurram o próximo
// para fora da vista. Da metade para baixo tudo nasce recolhido e abre no
// clique; a escolha fica guardada por seção, para quem usa um relatório todo
// dia não ter que abri-lo todo dia.
const DOBRA_KEY = "cde_overview_dobras_v1";
function lerDobras() {
  try { return JSON.parse(localStorage.getItem(DOBRA_KEY)) || {}; } catch (e) { return {}; }
}

// ------------------------------------------------------------------ tela
function VisaoGeral() {
  const [dados, setDados] = useState(null);
  const [msg, setMsg] = useState(null);         // no lugar dos destaques: servidor fora, sem lançamento
  const [mes, setMes] = useState("");
  const [casa, setCasa] = useState("");
  const opcoesCasa = useRef(null);              // montadas uma vez, na primeira carga
  const opcoesEstoque = useRef(null);
  const [casaEstoque, setCasaEstoque] = useState("");
  const [dobras, setDobras] = useState(lerDobras);
  const [piscando, setPiscando] = useState({});     // cada seção pisca no seu tempo
  const rolarPara = useRef(null);
  const secoes = useRef({});

  async function carregar(m) {
    let d;
    try {
      d = await (await api.getOverview(m)).json();
    } catch (e) {
      setMsg("Servidor fora do ar. Rode o Servidor.bat.");
      return;
    }
    if (d.vazio) { setMsg("Nenhum lançamento no sistema ainda."); return; }
    setMsg(null);
    setMes(d.mes);
    setDados(d);
  }
  useEffect(() => { carregar(""); }, []);

  const alternar = (id) => {
    setDobras((x) => {
      const aberto = !x[id];
      const guardado = lerDobras();
      guardado[id] = aberto;
      try { localStorage.setItem(DOBRA_KEY, JSON.stringify(guardado)); } catch (err) { /* sem storage: só não lembra */ }
      return { ...x, [id]: aberto };
    });
  };
  // O cartão de cima é a capa do relatório de baixo. Clicar abre a seção (que
  // nasce recolhida), rola até ela e pisca a borda por um instante — sem o
  // piscar, quem clica não percebe que a página andou.
  const abrirSecao = (id) => {
    if (!secoes.current[id]) return;
    if (!dobras[id]) alternar(id);
    rolarPara.current = id;
    setPiscando((p) => ({ ...p, [id]: (p[id] || 0) + 1 }));
    setTimeout(() => setPiscando((p) => {
      const n = { ...p };
      if (n[id] > 1) n[id] -= 1; else delete n[id];
      return n;
    }), 1400);
  };
  useLayoutEffect(() => {
    if (!rolarPara.current) return;
    const el = secoes.current[rolarPara.current];
    rolarPara.current = null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const vista = dados ? montarVista(dados, casa) : null;
  if (dados && !opcoesCasa.current) opcoesCasa.current = dados.participacao || [];
  if (vista && !opcoesEstoque.current) {
    const casas = [...new Set(vista.estoque.map((l) => l.casa))];
    opcoesEstoque.current = casas.map((c) => ({ c, nome: (vista.estoque.find((l) => l.casa === c) || {}).casa_nome || c }));
  }

  // ---- textos de cabeçalho das seções (vazios antes da primeira carga)
  const v = vista;
  const abc = v ? (v.abc || []) : [];
  const totalAbc = abc.reduce((s, a) => s + a.valor, 0);
  const estoqueLista = v ? v.estoque.filter((l) => !casaEstoque || l.casa === casaEstoque) : [];
  const totalEstoque = estoqueLista.reduce((s, l) => s + (l.valor || 0), 0);
  const notas = !v ? {} : {
    periodo: `${mesBR(dados.mes)}` + (dados.parcial
      ? ` · mês em curso, até o dia ${dados.dia_limite} — comparado com o mesmo trecho de ${mesFrase(dados.mes_anterior)}`
      : ` · comparado com ${mesFrase(dados.mes_anterior)}`),
    participacao: v.parcial ? `Dia 1 ao ${v.dia_limite} de ${mesFrase(v.mes)}` : mesBR(v.mes),
    top: abc.length ? `Levam ${parte(abc.slice(0, 4).reduce((s, a) => s + a.parte, 0))} do custo` : "",
    abc: abc.length ? `${abc.length} insumos · ${reais(totalAbc)} consumidos no mês`
      + (v.casa_filtro ? ` · ${v.casa_filtro_nome}` : " · todas as casas") : "",
    baixo: `${v.criticos.length} item(ns) no limite ou abaixo`,
    varTopo: v.parcial ? "No mesmo trecho do mês" : "Contra o mês anterior",
    movTopo: (v.movimentos || []).length ? brDate(v.movimentos[0].data) : "",
    minimo: `${(v.criticos || []).length} item(ns) · Mínimo = média diária dos`
      + ` últimos ${v.janela_media_dias} dias × prazo de entrega do insumo — ajustável em Parâmetros`,
    estoque: `${estoqueLista.length} linha(s) · ${reais(totalEstoque)} · última contagem de cada item`,
    variacao: v.parcial
      ? `${mesBR(v.mes)} até o dia ${v.dia_limite} contra o mesmo trecho de ${mesFrase(v.mes_anterior)}`
      : `${mesBR(v.mes)} contra ${mesFrase(v.mes_anterior)}`,
  };

  const atalho = (alvo, titulo, idNota, nota, corpo, ir) => html`<section class="cartao card-atalho" data-alvo=${alvo} role="button" tabindex="0"
      onClick=${() => abrirSecao(alvo)}
      onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirSecao(alvo); } }}>
      <div class="ca-topo"><h2>${titulo}</h2>
        <span class="fonte" id=${idNota}>${nota || ""}</span></div>
      ${corpo}
      <span class="ca-ir">${ir}</span>
    </section>`;

  const dobravel = (id, titulo, fonte, corpo, extra, idCartao) => html`<section
      class=${"cartao dobravel" + (dobras[id] ? " aberta" : "") + (piscando[id] ? " piscando" : "")}
      data-secao=${id} id=${idCartao} ref=${(el) => { secoes.current[id] = el; }}>
      <div class="cabeca dobra" onClick=${(e) => { if (e.target.closest("a")) return; alternar(id); }}><h2>${titulo}</h2>
        ${fonte}
        <span style=${{ flex: 1 }}></span>${extra || null}<span class="ordem-chev">${dobras[id] ? "▾" : "▸"}</span></div>
      <div class="dobra-corpo">${corpo}</div>
    </section>`;

  // Um bloco só no topo: cada cartão traz o número, a variação e a curva do
  // período no mesmo lugar. Quatro resumos lado a lado são a capa de um
  // relatório cada — clicar abre a seção correspondente lá embaixo, que fica
  // recolhida esperando. Daqui para baixo é relatório: tudo recolhido, para a
  // página não virar uma rolagem de três telas antes da próxima informação.
  return html`<main class="main-content">
    <div class="screen-header">
      <div>
        <h1>Visão Geral</h1>
        <p id="periodo-txt">${v ? notas.periodo : "carregando…"}</p>
      </div>
      <div class="header-acoes">
        <label class="campo"><span>Mês</span><select id="mes" value=${mes}
          onChange=${(e) => { setMes(e.target.value); carregar(e.target.value); }}>${dados
            ? dados.meses.slice().reverse().map((m) => html`<option key=${m} value=${m}>${mesBR(m)}</option>`) : null}</select></label>
        <label class="campo"><span>Casa</span><select id="f-casa" value=${casa}
          onChange=${(e) => setCasa(e.target.value)}>${opcoesCasa.current
            ? html`<option value="">Todas as casas</option>${opcoesCasa.current.map((c) =>
              html`<option key=${c.casa} value=${c.casa}>${c.nome}</option>`)}` : null}</select></label>
      </div>
    </div>

    <div class="insights" id="insights">${msg ? html`<p class="vazio">${msg}</p>`
      : v ? html`<${Insights} vista=${v} abrirSecao=${abrirSecao} />` : null}</div>

    <section class="cartao">
      <div class="cabeca"><h2>Participação das casas no Faturamento (Bruto)</h2>
        <span class="fonte" id="nota-participacao">${notas.participacao || ""}</span></div>
      ${v ? html`<${Participacao} vista=${v} />` : html`<div class="pizza-bloco"><div id="pizza"></div><div class="rolagem" id="tabela-casas"></div></div>`}
    </section>

    <div class="quadro">
      ${atalho("abc", "Principais insumos", "nota-top", notas.top,
        html`<div id="top-insumos">${v ? html`<${TopInsumos} abc=${abc} />` : null}</div>`, "curva ABC completa →")}
      ${atalho("minimos", "Estoque baixo", "nota-baixo", notas.baixo,
        html`<div id="barras-estoque">${v ? html`<${BarrasEstoque} criticos=${v.criticos} />` : null}</div>`, "lista completa →")}
      ${atalho("variacao", "Maiores variações", "nota-var-topo", notas.varTopo,
        html`<div id="top-variacao">${v ? html`<${TopVariacao} variacao=${v.variacao} />` : null}</div>`, "variação mês a mês →")}
      ${atalho("movimentos", "Últimos movimentos", "nota-mov-topo", notas.movTopo,
        html`<div id="top-movimentos">${v ? html`<${TopMovimentos} movimentos=${v.movimentos} />` : null}</div>`, "extrato completo →")}
    </div>

    <section class="cartao">
      <div class="cabeca"><h2>Evolução do grupo</h2>
        <span class="fonte">Faturamento bruto por mês e quanto dele virou consumo de insumo</span></div>
      <div class="graficos" id="graficos-mes">${v ? html`<${GraficosMes} vista=${v} />` : null}</div>
    </section>

    ${dobravel("abc", "Curva ABC completa", html`<span class="fonte" id="nota-abc">${notas.abc || ""}</span>`,
      html`<div class="rolagem" id="abc-tabela">${v ? html`<${TabelaABC} vista=${v} />` : null}</div>`, null, "cartao-abc")}
    ${dobravel("minimos", "Estoque no limite ou abaixo do mínimo", html`<span class="fonte" id="nota-minimo">${notas.minimo || ""}</span>`,
      html`<div class="rolagem" id="tabela-minimos">${v ? html`<${TabelaMinimos} criticos=${v.criticos} />` : null}</div>`)}
    ${dobravel("estoque", "Posição atual de estoque", html`<span class="fonte" id="nota-estoque">${notas.estoque || ""}</span>`,
      html`<div class="barra barra-interna">
          <label class="campo"><span>Casa</span><select id="f-casa-estoque" value=${casaEstoque}
            onChange=${(e) => setCasaEstoque(e.target.value)}>${opcoesEstoque.current
              ? html`<option value="">Todas</option>${opcoesEstoque.current.map((o) =>
                html`<option key=${o.c} value=${o.c}>${o.nome}</option>`)}` : null}</select></label>
        </div>
        <div class="rolagem" id="tabela-estoque">${v ? html`<${TabelaEstoque} lista=${estoqueLista} total=${totalEstoque} />` : null}</div>`)}
    ${dobravel("variacao", "Variação de consumo — mês contra mês", html`<span class="fonte" id="nota-variacao">${notas.variacao || ""}</span>`,
      html`<div class="rolagem" id="tabela-variacao">${v ? html`<${TabelaVariacao} vista=${v} />` : null}</div>`)}
    ${dobravel("compras", "Custo unitário das compras", html`<span class="fonte">Preço médio pago por unidade compradora, ponderado pela quantidade</span>`,
      html`<div class="rolagem" id="tabela-compras">${v ? html`<${TabelaCompras} compras=${v.compras} />` : null}</div>`)}
    ${dobravel("movimentos", "Últimas movimentações", html`<span class="fonte">Entrada por nota fiscal, transferência entre lojas e desperdício</span>`,
      html`<div class="rolagem" id="tabela-movimentos">${v ? html`<${TabelaMovimentos} movimentos=${v.movimentos} />` : null}</div>`,
      html`<a class="botao" href="movimentacoes.html">Histórico completo</a>`)}
  </main>`;
}

montarTela("overview", VisaoGeral);
