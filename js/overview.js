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
let DADOS = null;
let CASA_ESTOQUE = "";

const $ = (s) => document.querySelector(s);
const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const reais = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—" : "R$ " + fmt(n, c);
const curto = (n) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : Math.abs(n) >= 1000000 ? "R$ " + fmt(n / 1000000, 2) + " mi"
  : Math.abs(n) >= 1000 ? "R$ " + fmt(n / 1000, 0) + " mil" : "R$ " + fmt(n);
const pct = (n, c = 1) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : (n >= 0 ? "+" : "") + (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: c }) + "%";
const parte = (n) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                  "agosto", "setembro", "outubro", "novembro", "dezembro"];
// "Agosto/2026", não "agosto/2026": o mês abre frase no cabeçalho, no seletor e
// nas notas — minúsculo ali destoa de todo o resto da tela.
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

// ------------------------------------------------------------------ carregar
async function carregar() {
  const mes = $("#mes").value;
  try {
    DADOS = await (await fetch("/api/overview" + (mes ? "?mes=" + mes : ""),
                               { cache: "no-store" })).json();
  } catch (e) {
    $("#insights").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  if (DADOS.vazio) {
    $("#insights").innerHTML = '<p class="vazio">Nenhum lançamento no sistema ainda.</p>';
    return;
  }
  montarMeses();
  desenhar();
}

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
// casas, filtrá-la não faria sentido) e a minicurva de cada insumo é omitida,
// porque a série que o servidor manda por insumo é da rede — mostrá-la ao
// lado dos números de uma casa seria uma mentira discreta.
// ======================================================================
let VISTA = null;

function casaAtual() {
  const el = $("#f-casa");
  return el ? el.value : "";
}

function nomeCasa(ck) {
  const c = (DADOS.participacao || []).find((x) => x.casa === ck);
  return c ? c.nome : ck;
}

// A curva ABC recortada é reclassificada: o corte de 80% cai sobre o consumo
// DAQUELA casa. Sem isso, um insumo que é A na rede apareceria como A ali
// mesmo pesando pouco na casa — o engano que o filtro quer evitar. O camarão P
// é A na rede e C na Umarizal.
function abcDaCasa(ck) {
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

function variacaoDaCasa(ck) {
  return (DADOS.variacao || []).map((v) => {
    const c = (v.por_casa || {})[ck];
    if (!c) return null;
    return {
      ...v, atual: c.atual, anterior: c.anterior, variacao: c.variacao,
      diferenca: c.atual - c.anterior,
      // Impacto em reais e minicurva vêm da rede: sem recorte por casa, é
      // melhor não mostrar do que mostrar o número de outro conjunto.
      impacto_reais: null, serie: null,
    };
  }).filter(Boolean)
    .sort((a, b) => Math.abs(b.variacao || 0) - Math.abs(a.variacao || 0));
}

function montarVista() {
  const ck = casaAtual();
  if (!ck) return DADOS;

  const part = (DADOS.participacao || []).find((x) => x.casa === ck) || {};
  return {
    ...DADOS,
    casa_filtro: ck,
    casa_filtro_nome: nomeCasa(ck),
    consumo_valor: (DADOS.consumo_valor_por_casa || {})[ck] || 0,
    consumo_valor_anterior: (DADOS.consumo_valor_anterior_por_casa || {})[ck] || 0,
    faturamento_total: (DADOS.faturamento_por_casa || {})[ck] || 0,
    faturamento_anterior: part.anterior || 0,
    serie_meses: (DADOS.serie_meses || []).map((m) => ({
      ...m,
      faturamento: (m.por_casa || {})[ck] || 0,
      consumo_valor: (m.consumo_por_casa || {})[ck] || 0,
      faturamento_trecho: (m.por_casa || {})[ck] || 0,
      consumo_valor_trecho: (m.consumo_por_casa || {})[ck] || 0,
      peso: (m.por_casa || {})[ck]
        ? ((m.consumo_por_casa || {})[ck] || 0) / m.por_casa[ck] : null,
    })),
    abc: abcDaCasa(ck),
    variacao: variacaoDaCasa(ck),
    estoque: (DADOS.estoque || []).filter((l) => l.casa === ck),
    criticos: (DADOS.criticos || []).filter((l) => l.casa === ck),
    perdas: (DADOS.perdas || []).filter((l) => l.casa === ck),
    movimentos: (DADOS.movimentos || []).filter((l) => l.casa === ck),
    compras: (DADOS.compras || []).filter((l) => !l.casa || l.casa === ck),
  };
}

// O seletor de casa guarda a escolha entre trocas de mes: quem esta olhando
// uma casa quer continuar nela ao andar no tempo.
function montarCasas() {
  const sel = $("#f-casa");
  if (!sel || sel.options.length) return;
  sel.innerHTML = '<option value="">Todas as casas</option>' +
    (DADOS.participacao || []).map((c) =>
      `<option value="${esc(c.casa)}">${esc(c.nome)}</option>`).join("");
}

// Mes e metadado, nao recorte: le do dado cru, e e chamado antes de a vista
// existir.
function montarMeses() {
  const sel = $("#mes");
  if (sel.options.length !== DADOS.meses.length) {
    sel.innerHTML = DADOS.meses.slice().reverse()
      .map((m) => `<option value="${m}">${mesBR(m)}</option>`).join("");
  }
  sel.value = DADOS.mes;
}

// ------------------------------------------------------------------ desenhar
function desenhar() {
  montarCasas();
  VISTA = montarVista();
  const d = DADOS;
  $("#periodo-txt").textContent = `${mesBR(d.mes)}` +
    (d.parcial ? ` · mês em curso, até o dia ${d.dia_limite} — comparado com o mesmo trecho de ${mesFrase(d.mes_anterior)}`
               : ` · comparado com ${mesFrase(d.mes_anterior)}`);

  insights();
  pizzaCasas();
  graficosMes();
  curvaABC();
  barrasEstoque();
  topVariacao();
  topMovimentos();
  minimos();
  posicaoEstoque();
  variacaoMensal();
  custosDeCompra();
  movimentos();
}

// ------------------------------------------------------------------ destaques
// Blocos curtos de leitura rápida: queda, alta e o que está apertando. Saem
// dos mesmos dados da tela — não há cálculo novo aqui, há SELEÇÃO: de tudo o
// que mudou, entram as quatro mudanças que valem interromper alguém.
//
// MODELO decide o desenho: "A" é o cartão com ícone e pílula de variação;
// "B" é o cartão limpo com mini gráfico embaixo. Troque a constante para ver
// o outro — os dois leem exatamente os mesmos dados.
// Cada cartão carrega quatro coisas: o que é, quanto é, quanto mudou e como
// vinha vindo. Foi o que permitiu apagar a faixa de totais que existia acima —
// ela dizia "R$ 1,32 mi de faturamento" e o cartão de baixo repetia o mesmo
// número com a variação ao lado.
const ICO_INS = {
  alta: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  queda: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  dinheiro: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  consumo: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  caixa: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/>',
  alerta: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  perda: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
};
const svgIns = (d) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// Os seis cartões, na ordem de quem decide: o dinheiro que entrou, o que dele
// virou insumo, o que está parado, o que mais subiu, o que mais caiu e o que
// vai faltar. Os quatro primeiros vêm do antigo placar — nada se perdeu ao
// apagá-lo.
function destaques() {
  const d = DADOS;
  const fora = [];
  // no mês em curso as curvas dos blocos usam o mesmo trecho de cada mês, para
  // a curva não desmentir a variação escrita ao lado dela
  const serieFat = (d.serie_meses || []).map((m) =>
    d.parcial ? m.faturamento_trecho : m.faturamento);
  const serieConsumo = (d.serie_meses || []).map((m) =>
    d.parcial ? m.consumo_valor_trecho : m.consumo_valor);
  const contexto = d.parcial ? `vs. mesmo trecho de ${mesFrase(d.mes_anterior)}`
                             : `vs. ${mesFrase(d.mes_anterior)}`;

  fora.push({
    rotulo: "Faturamento (Bruto) do grupo", valor: curto(d.faturamento_total),
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
function miniCurva(serie, cor) {
  const vals = (serie || []).filter((v) => isFinite(v));
  if (vals.length < 2) return "";
  const W = 150, H = 34;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => (i * W) / (vals.length - 1);
  const y = (v) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  const linha = caminhoSuave(pts);
  const id = "mg" + (++GRAD);
  return `<svg class="ins-curva" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cor}" stop-opacity=".30"/>
      <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${linha} L${W},${H} L0,${H} Z" fill="url(#${id})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2"
          stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function insights() {
  const lista = destaques();
  if (!lista.length) { $("#insights").innerHTML = ""; return; }

  const tomDe = (i) => i.tom ? i.tom
    : i.delta === null ? "neutro"
    : (i.delta > 0) === !!i.bomSeSobe ? "bom" : "ruim";
  const corDe = (t) => t === "bom" ? "var(--bom)" : t === "ruim" ? "var(--ruim)"
    : t === "aviso" ? "var(--aviso)" : "var(--info)";

  $("#insights").innerHTML = lista.map((i) => {
    const tom = tomDe(i);
    return `<div class="ins${i.alvo ? " ins-clicavel" : ""}"${i.alvo ? ` data-alvo="${i.alvo}"` : ""}>
      <div class="ins-topo">
        <span class="ins-ico ${tom}">${svgIns(i.icone)}</span>
        <span class="ins-rotulo">${esc(i.rotulo)}</span>
      </div>
      <span class="ins-valor">${esc(i.valor)}</span>
      <div class="ins-rodape">
        ${i.delta === null ? "" : `<span class="ins-pilula ${tom}">
          ${svgIns(i.delta > 0 ? ICO_INS.alta : ICO_INS.queda)}${pct(i.delta, 0)}</span>`}
        <span class="ins-contexto">${esc(i.contexto)}</span>
      </div>
      ${miniCurva(i.serie, corDe(tom))}
    </div>`;
  }).join("");

  // o cartão de estoque baixo leva à seção detalhada, como os cartões de baixo
  document.querySelectorAll("#insights [data-alvo]").forEach((c) => {
    c.onclick = () => abrirSecao(c.dataset.alvo);
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
// vez de engrossá-lo. Com o traço arredondado nas juntas e nas pontas, a quina
// deixa de ser um bico e o desenho fica limpo em qualquer fundo — inclusive no
// tema escuro, onde a borda escura separa as fatias vivas sem sujar a cor.

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

function pizzaCasas() {
  const dados = (VISTA.participacao || []).filter((p) => p.valor > 0);
  const total = dados.reduce((s, p) => s + p.valor, 0);
  if (!total) { $("#pizza").innerHTML = '<p class="vazio">Sem faturamento bruto lançado no mês.</p>'; return; }

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

  $("#pizza").innerHTML = `
    <svg viewBox="0 0 200 200" class="pizza">
      <g id="gomos">${gomos.map((g) => `
        <path class="fatia" data-casa="${g.p.casa}" d="${g.d}"
              fill="${corCasa(g.p.casa)}" stroke="var(--card)"
              stroke-width="${CONTORNO}" stroke-linejoin="round" stroke-linecap="round"/>`).join("")}
      </g>
      <circle cx="100" cy="100" r="${R_INT - 1}" fill="var(--card)"
              stroke="var(--linha-tabela)" stroke-width="2"/>
      <text x="100" y="98" text-anchor="middle" class="pizza-total" id="pz-valor">${curto(total)}</text>
      <text x="100" y="113" text-anchor="middle" class="pizza-rot" id="pz-rotulo">faturamento bruto do grupo</text>
    </svg>`;
  // Sem legenda embaixo: a tabela ao lado já traz nome, cor (no ponto) e
  // participação de cada casa. Duas listas dizendo o mesmo só ocupavam altura.

  // Passar o mouse acende o gomo e apaga os outros; o miolo troca o total pelo
  // valor daquela casa, que é o número que a pessoa foi buscar ao apontar.
  const acender = (ck) => {
    document.querySelectorAll("#pizza .fatia").forEach((f) => {
      f.classList.toggle("ativa", f.dataset.casa === ck);
      f.classList.toggle("apagada", ck !== null && f.dataset.casa !== ck);
    });
    const casa = dados.find((p) => p.casa === ck);
    $("#pz-valor").textContent = casa ? curto(casa.valor) : curto(total);
    $("#pz-rotulo").textContent = casa
      ? `${casa.nome} · ${parte(casa.parte)}` : "faturamento bruto do grupo";
  };
  document.querySelectorAll("#pizza .fatia").forEach((el) => {
    el.onmouseenter = () => acender(el.dataset.casa);
    el.onmouseleave = () => acender(null);
  });

  $("#nota-participacao").textContent = VISTA.parcial
    ? `Dia 1 ao ${VISTA.dia_limite} de ${mesFrase(VISTA.mes)}` : mesBR(VISTA.mes);

  $("#tabela-casas").innerHTML = `<table>
    <thead><tr><th>Casa</th><th>Faturamento (Bruto)</th><th>Participação</th>
      <th>${VISTA.parcial ? "Mesmo trecho do mês anterior" : "Mês anterior"}</th><th>Variação</th></tr></thead>
    <tbody>${VISTA.participacao.map((p) => `
      <tr data-casa="${p.casa}">
        <td><span class="ponto" style="background:${corCasa(p.casa)}"></span>${esc(p.nome)}
          <span class="un">${p.casa}</span></td>
        <td class="calc">${reais(p.valor)}</td>
        <td class="calc">${parte(p.parte)}</td>
        <td class="calc">${reais(p.anterior)}</td>
        <td class="calc ${p.variacao !== null && p.variacao < 0 ? "neg" : ""}">${pct(p.variacao)}</td>
      </tr>`).join("")}
      <tr class="linha-total"><td><strong>Grupo</strong></td>
        <td class="calc"><strong>${reais(VISTA.faturamento_total)}</strong></td>
        <td class="calc">100%</td>
        <td class="calc">${reais(VISTA.faturamento_anterior)}</td>
        <td class="calc">${pct(VISTA.faturamento_anterior
          ? (VISTA.faturamento_total - VISTA.faturamento_anterior) / VISTA.faturamento_anterior : null)}</td>
      </tr>
    </tbody></table>`;

  // a linha da tabela acende o mesmo gomo: são a mesma casa, ditas de dois jeitos
  document.querySelectorAll("#tabela-casas tr[data-casa]").forEach((tr) => {
    tr.onmouseenter = () => acender(tr.dataset.casa);
    tr.onmouseleave = () => acender(null);
  });
}

// ------------------------------------------------------------------ gráficos
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

let GRAD = 0;

// Mesmo desenho dos gráficos grandes do Painel de Consumo, que por sua vez
// seguem o modelo de referência: curva suave, área em degradê, faixa vertical
// arredondada atrás do ponto em destaque e o rótulo daquele ponto em peso maior.
// Ter dois desenhos de linha no sistema fazia a mesma informação parecer de
// origens diferentes conforme a tela.
function grafico(serie, rotulo, cor, formata) {
  if (serie.length < 2) return '<p class="vazio">Poucos meses para desenhar a curva.</p>';
  const L = 8, T = 18, W = 900, H = 250, R = 74;
  const PW = W - L - R, PH = H - T - 40;
  const vals = serie.map((p) => p.v);
  const lo = Math.min(...vals) * 0.88, hi = Math.max(...vals) * 1.10;
  const x = (i) => L + (i * PW) / (serie.length - 1);
  const y = (v) => T + PH - ((v - lo) / (hi - lo || 1)) * PH;
  const pts = serie.map((p, i) => [x(i), y(p.v)]);
  const id = "og" + (++GRAD);
  const k = serie.length - 1;              // o destaque é sempre o mês mais recente
  const linha = caminhoSuave(pts);
  const area = linha + ` L${x(k).toFixed(1)},${T + PH} L${L},${T + PH} Z`;

  const escala = [0, 0.5, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    return `<text x="${W - R + 12}" y="${(y(v) + 4).toFixed(1)}" class="eixo">${formata(v)}</text>`;
  }).join("");

  // faixa vertical arredondada atrás do mês em destaque
  const faixa = `<rect class="g-faixa" x="${(x(k) - 19).toFixed(1)}" y="${y(serie[k].v).toFixed(1)}"
       width="38" height="${(T + PH - y(serie[k].v)).toFixed(1)}" rx="19" fill="url(#${id}b)"/>`;

  const rot = serie.map((p, i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" data-i="${i}"
       class="eixo${i === k ? " eixo-forte" : ""}">${p.rotulo}</text>`).join("");
  // Alvos invisiveis, um por ponto: guardam a posicao ja no sistema do viewBox,
  // que e o que o modo dinamico precisa para mover o destaque sem recalcular a
  // escala. O <title> continua servindo de dica nativa quando o modo esta off.
  const alvos = serie.map((p, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="10" fill="transparent"
             class="g-alvo" data-i="${i}">
       <title>${p.titulo}</title></circle>`).join("");

  // O estado inicial e o mes mais recente — o mesmo de antes. O modo dinamico
  // so muda QUAL indice esta em destaque; o desenho da curva nao se refaz.
  const base = T + PH;
  return `<div class="grafico-bloco" data-dinamico="1">
    <h3>${rotulo}</h3>
    <div class="g-leitura">${serie[k].titulo}</div>
    <svg viewBox="0 0 ${W} ${H}" class="grafico"
         data-k="${k}" data-base="${base.toFixed(1)}" data-cor="${cor}">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}" stop-opacity=".34"/>
          <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${cor}" stop-opacity=".30"/>
          <stop offset="100%" stop-color="${cor}" stop-opacity=".02"/>
        </linearGradient>
      </defs>
      ${escala}${faixa}
      <path d="${area}" fill="url(#${id})"/>
      <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"/>
      <line class="g-guia" x1="${x(k).toFixed(1)}" y1="${T}" x2="${x(k).toFixed(1)}"
            y2="${base.toFixed(1)}" stroke="${cor}" stroke-width="1"
            stroke-dasharray="3 3" opacity="0"/>
      <circle class="g-halo" cx="${x(k).toFixed(1)}" cy="${y(serie[k].v).toFixed(1)}" r="9"
              fill="${cor}" opacity=".22"/>
      <circle class="g-ponto" cx="${x(k).toFixed(1)}" cy="${y(serie[k].v).toFixed(1)}" r="4.5"
              fill="${cor}" stroke="var(--card)" stroke-width="2"/>
      ${rot}${alvos}
    </svg>
    <div class="legenda"><span class="lg-serie" style="color:${cor}"><i></i>${rotulo}</span></div>
    </div>`;
}

// ------------------------------------------------- gráficos dinâmicos (hover)
// Antes o "onde está" era sempre o último mês: a faixa arredondada, o ponto
// cheio e o rótulo em negrito ficavam presos na ponta direita da curva, e para
// ler um mês do meio só havia a dica nativa do <title> — que demora a aparecer
// e não move o destaque. Aqui o mesmo destaque passa a seguir o mouse.
//
// Nada é redesenhado: só a faixa, a guia, o halo, o ponto e o rótulo em negrito
// trocam de posição. Redesenhar o bloco a cada mousemove piscava a curva inteira.
//
// Não há chave de liga/desliga, e de propósito: em repouso o gráfico é IGUAL ao
// de antes — o destaque fica no mês mais recente e a guia some quando o mouse
// sai. Desligar não mudaria nada visível, então a caixa de opção só ocupava o
// cabeçalho de cada gráfico sem oferecer escolha de verdade.

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

function ativarGraficosDinamicos(raiz) {
  raiz.querySelectorAll(".grafico-bloco[data-dinamico]").forEach((bloco) => {
    const svg = bloco.querySelector("svg.grafico");
    if (!svg) return;
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

    svg.addEventListener("mousemove", mover);
    svg.addEventListener("mouseleave", voltarAoPadrao);
    // Toque: um toque na curva destaca o periodo apontado
    svg.addEventListener("touchmove", (e) => {
      if (e.touches[0]) mover(e.touches[0]);
    }, { passive: true });
    voltarAoPadrao();
  });
}

function graficosMes() {
  const s = VISTA.serie_meses || [];
  const fatur = s.map((m) => ({ v: m.faturamento, rotulo: mesBR(m.mes).slice(0, 3),
    titulo: `${mesBR(m.mes)} — ${reais(m.faturamento)}` }));
  const peso = s.filter((m) => m.peso !== null).map((m) => ({ v: m.peso * 100,
    rotulo: mesBR(m.mes).slice(0, 3),
    titulo: `${mesBR(m.mes)} — ${parte(m.peso)} do faturamento bruto em insumo` }));
  $("#graficos-mes").innerHTML =
    grafico(fatur, "Faturamento (Bruto) do grupo por mês", "var(--laranja)", (v) => curto(v)) +
    (peso.length > 1
      ? grafico(peso, "Consumo de insumo sobre o Faturamento (Bruto)", "var(--info)",
                (v) => fmt(v, 1) + "%")
      : "") +
    '<p class="fonte">O último mês pode estar em curso — a curva sobe de novo quando o mês fecha.</p>';
  ativarGraficosDinamicos($("#graficos-mes"));
}

// ------------------------------------------------------------------ curva ABC
// A curva já chega recortada e reclassificada pela VISTA quando há casa
// escolhida — veja abcDaCasa lá em cima.
function curvaABC() {
  const abc = VISTA.abc || [];
  if (!abc.length) {
    $("#top-insumos").innerHTML = '<p class="vazio">Sem consumo valorizado no mês.</p>';
    $("#abc-tabela").innerHTML = "";
    return;
  }
  const total = abc.reduce((s, a) => s + a.valor, 0);
  const top = abc.slice(0, 4);

  $("#nota-abc").textContent =
    `${abc.length} insumos · ${reais(total)} consumidos no mês`
    + (VISTA.casa_filtro ? ` · ${VISTA.casa_filtro_nome}` : " · todas as casas");
  $("#nota-top").textContent = `Levam ${parte(top.reduce((s, a) => s + a.parte, 0))} do custo`;

  // Uma linha por insumo: posição, nome e valor. O detalhe (quantidade, peso no
  // faturamento, classe) está a um clique, no relatório completo — repetir tudo
  // aqui só encheria o cartão de número que ninguém lê de relance.
  $("#top-insumos").innerHTML = `<div class="lista-top">
    ${top.map((a, i) => `
      <div class="lt-linha">
        <span class="lt-pos">${i + 1}</span>
        <span class="lt-nome">${esc(a.insumo)}</span>
        <span class="lt-val">${curto(a.valor)}
          <small>${a.sobre_faturamento !== null ? parte(a.sobre_faturamento) + " do fat. bruto" : "—"}</small></span>
      </div>`).join("")}
  </div>`;

  $("#abc-tabela").innerHTML = `<table>
    <thead><tr><th>Classe</th><th>Insumo</th><th>Quantidade</th><th>Custo no mês</th>
      <th>% do custo</th><th>Acumulado</th><th>% do fat. bruto</th></tr></thead>
    <tbody>${abc.map((a) => `
      <tr>
        <td><span class="selo ${a.classe === "A" ? "ruim" : a.classe === "B" ? "aviso" : "neutro"}">${a.classe}</span></td>
        <td>${esc(a.insumo)} <span class="un">(${esc(a.un)})</span>${a.com_custo ? ""
          : ' <span class="selo-mini" title="Sem custo cadastrado — entra só na contagem">sem custo</span>'}</td>
        <td class="calc">${fmt(a.qtd, 1)}</td>
        <td class="calc">${reais(a.valor)}</td>
        <td class="calc">${parte(a.parte)}</td>
        <td class="calc">${parte(a.acumulado)}</td>
        <td class="calc">${parte(a.sobre_faturamento)}</td>
      </tr>`).join("")}</tbody></table>` +
    (VISTA.sem_custo.length
      ? `<p class="fonte" style="margin-top:8px">Sem custo cadastrado: ${VISTA.sem_custo.map(esc).join(", ")}.
         Preencha <code>dados/custos.json</code> ou vincule o produto do catálogo em Cadastros —
         o custo do catálogo só é aproveitado quando o produto é vendido em KG.</p>`
      : "");
}

// ------------------------------------------------------------------ estoque baixo
// Barra por item, medindo o estoque contra o mínimo de segurança. A régua vai
// até 100% do mínimo: passar disso não interessa aqui, o que interessa é o
// quanto falta para o item acabar.
function barrasEstoque() {
  const lista = (VISTA.criticos || []).slice(0, 4);
  $("#nota-baixo").textContent = `${VISTA.criticos.length} item(ns) no limite ou abaixo`;
  if (!lista.length) {
    $("#barras-estoque").innerHTML =
      '<p class="vazio">Estoque coberto.</p>';
    return;
  }
  // A barra mede o estoque contra o mínimo de segurança: barra curta é item
  // para comprar hoje. Cheia = 100% do mínimo, não do estoque ideal.
  $("#barras-estoque").innerHTML = `<div class="barras-min">
    ${lista.map((l) => {
      const nivel = l.minimo > 0 ? Math.min(l.qtd / l.minimo, 1) : 0;
      const cor = l.situacao === "abaixo" ? "var(--ruim)" : "var(--aviso)";
      return `<div class="bm-linha" title="${esc(l.insumo)} em ${esc(l.casa_nome)}: ${fmt(l.qtd, 2)} ${esc(l.un)} para um mínimo de ${fmt(l.minimo, 2)}">
        <span class="bm-nome">${esc(l.insumo)} <small>${esc(l.casa)}</small></span>
        <span class="bm-val${l.qtd <= 0.0005 ? " zerado" : ""}">${fmt(l.qtd, 1)} <small>/ ${fmt(l.minimo, 1)}</small></span>
        <span class="bm-trilho"><span class="bm-preenche" style="width:${(nivel * 100).toFixed(1)}%;background:${cor}"></span></span>
      </div>`;
    }).join("")}
  </div>`;
}

// ------------------------------------------------------------------ variações
// As quatro maiores mudanças de consumo contra o mês anterior, em dinheiro.
// Seta para cima é consumo a mais — que é gasto a mais, por isso vermelha.
function topVariacao() {
  const lista = (VISTA.variacao || []).slice(0, 4);
  $("#nota-var-topo").textContent = VISTA.parcial ? "No mesmo trecho do mês" : "Contra o mês anterior";
  if (!lista.length) { $("#top-variacao").innerHTML = '<p class="vazio">Sem comparação.</p>'; return; }
  $("#top-variacao").innerHTML = `<div class="lista-top">
    ${lista.map((v) => {
      const sobe = (v.diferenca || 0) > 0;
      return `<div class="lt-linha" title="${esc(v.insumo)}: ${fmt(v.atual, 1)} contra ${fmt(v.anterior, 1)} ${esc(v.un)}">
        <span class="lt-seta ${sobe ? "sobe" : "desce"}">${sobe ? "▲" : "▼"}</span>
        <span class="lt-nome">${esc(v.insumo)}</span>
        <span class="lt-val ${sobe ? "neg" : ""}">${pct(v.variacao, 0)}
          <small>${v.impacto_reais === null ? fmt(v.diferenca, 1) + " " + esc(v.un)
            : (v.impacto_reais > 0 ? "+" : "") + curto(v.impacto_reais)}</small></span>
      </div>`;
    }).join("")}
  </div>`;
}

// ------------------------------------------------------------------ últimos movimentos
function topMovimentos() {
  const lista = (VISTA.movimentos || []).slice(0, 4);
  $("#nota-mov-topo").textContent = lista.length ? brDate(lista[0].data) : "";
  if (!lista.length) { $("#top-movimentos").innerHTML = '<p class="vazio">Sem movimento.</p>'; return; }
  $("#top-movimentos").innerHTML = `<div class="lista-top">
    ${lista.map((m) => `
      <div class="lt-linha" title="${esc(m.tipo_nome)} · ${esc(m.casa_nome)} · ${brDate(m.data)}">
        <span class="lt-marca ${SELO_MOV[m.tipo] || "neutro"}"></span>
        <span class="lt-nome">${esc(m.insumo)}
          <small>${esc(m.casa)} · ${brDate(m.data).slice(0, 5)}</small></span>
        <span class="lt-val">${fmt(m.qtd, 1)}
          <small>${esc(m.un)}</small></span>
      </div>`).join("")}
  </div>`;
}

// ------------------------------------------------------------------ mínimos
function minimos() {
  const lista = VISTA.criticos || [];
  $("#nota-minimo").textContent = `${lista.length} item(ns) · Mínimo = média diária dos`
    + ` últimos ${VISTA.janela_media_dias} dias × ${VISTA.dias_seguranca} dia(s) de uso`
    + ` — ajustável em Parâmetros`;
  if (!lista.length) {
    $("#tabela-minimos").innerHTML =
      '<p class="vazio">Nenhum item abaixo do mínimo de segurança. Estoque coberto.</p>';
    return;
  }
  $("#tabela-minimos").innerHTML = `<table>
    <thead><tr><th>Insumo</th><th>Casa</th><th>Em estoque</th><th>Mínimo</th>
      <th>Consumo/dia</th><th>Cobertura</th><th>Contado em</th><th>Situação</th></tr></thead>
    <tbody>${lista.map((l) => `
      <tr>
        <td>${esc(l.insumo)} <span class="un">(${esc(l.un)})</span></td>
        <td><span class="ponto" style="background:${corCasa(l.casa)}"></span>${esc(l.casa_nome)}</td>
        <td class="calc ${l.situacao === "abaixo" ? "neg" : ""}">${fmt(l.qtd, 2)}</td>
        <td class="calc">${fmt(l.minimo, 2)}</td>
        <td class="calc">${fmt(l.media_dia, 2)}</td>
        <td class="calc">${l.dias_cobertura === null ? "—" : fmt(l.dias_cobertura, 1) + " d"}</td>
        <td class="fonte">${brDate(l.contado_em)}</td>
        <td><span class="selo ${l.situacao === "abaixo" ? "ruim" : "aviso"}">${
          l.situacao === "abaixo" ? "abaixo do mínimo" : "no limite"}</span></td>
      </tr>`).join("")}</tbody></table>`;
}

// ------------------------------------------------------------------ estoque
function posicaoEstoque() {
  const sel = $("#f-casa-estoque");
  if (!sel.options.length) {
    const casas = [...new Set(VISTA.estoque.map((l) => l.casa))];
    sel.innerHTML = '<option value="">Todas</option>' + casas.map((c) => {
      const nome = (VISTA.estoque.find((l) => l.casa === c) || {}).casa_nome || c;
      return `<option value="${c}">${esc(nome)}</option>`;
    }).join("");
    sel.onchange = () => { CASA_ESTOQUE = sel.value; posicaoEstoque(); };
  }
  const lista = VISTA.estoque.filter((l) => !CASA_ESTOQUE || l.casa === CASA_ESTOQUE);
  const total = lista.reduce((s, l) => s + (l.valor || 0), 0);
  $("#nota-estoque").textContent =
    `${lista.length} linha(s) · ${reais(total)} · última contagem de cada item`;

  $("#tabela-estoque").innerHTML = `<table>
    <thead><tr><th>Insumo</th><th>Casa</th><th>Quantidade</th><th>Custo unit.</th>
      <th>Valor</th><th>Cobertura</th><th>Contado em</th></tr></thead>
    <tbody>${lista.map((l) => `
      <tr>
        <td>${esc(l.insumo)} <span class="un">(${esc(l.un)})</span></td>
        <td><span class="ponto" style="background:${corCasa(l.casa)}"></span>${esc(l.casa_nome)}</td>
        <td class="calc">${fmt(l.qtd, 2)}</td>
        <td class="calc" title="${l.fonte_custo === "catalogo"
          ? "preço do catálogo de compras" : "dados/custos.json"}">${l.custo_un === null ? "—" : reais(l.custo_un)}</td>
        <td class="calc">${l.valor === null ? "—" : reais(l.valor)}</td>
        <td class="calc ${l.situacao === "abaixo" ? "neg" : ""}">${
          l.dias_cobertura === null ? "sem consumo" : fmt(l.dias_cobertura, 1) + " d"}</td>
        <td class="fonte">${brDate(l.contado_em)}</td>
      </tr>`).join("")}
      <tr class="linha-total"><td colspan="4"><strong>Total em estoque</strong></td>
        <td class="calc"><strong>${reais(total)}</strong></td><td></td><td></td></tr>
    </tbody></table>`;
}

// ------------------------------------------------------------------ variação
function variacaoMensal() {
  const lista = VISTA.variacao || [];
  const casas = VISTA.participacao.map((p) => p.casa);
  $("#nota-variacao").textContent = VISTA.parcial
    ? `${mesBR(VISTA.mes)} até o dia ${VISTA.dia_limite} contra o mesmo trecho de ${mesFrase(VISTA.mes_anterior)}`
    : `${mesBR(VISTA.mes)} contra ${mesFrase(VISTA.mes_anterior)}`;
  if (!lista.length) { $("#tabela-variacao").innerHTML = '<p class="vazio">Sem consumo nos dois meses.</p>'; return; }

  $("#tabela-variacao").innerHTML = `<table>
    <thead><tr><th>Insumo</th><th>Mês atual</th><th>Mês anterior</th><th>Diferença</th>
      <th>Variação</th><th>Impacto R$</th>${casas.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${lista.map((v) => `
      <tr>
        <td>${esc(v.insumo)} <span class="un">(${esc(v.un)})</span></td>
        <td class="calc">${fmt(v.atual, 1)}</td>
        <td class="calc">${fmt(v.anterior, 1)}</td>
        <td class="calc ${v.diferenca > 0 ? "neg" : ""}">${v.diferenca > 0 ? "+" : ""}${fmt(v.diferenca, 1)}</td>
        <td class="calc ${v.variacao !== null && v.variacao > 0 ? "neg" : ""}">${pct(v.variacao)}</td>
        <td class="calc ${v.impacto_reais > 0 ? "neg" : ""}">${v.impacto_reais === null ? "—"
          : (v.impacto_reais > 0 ? "+" : "") + reais(v.impacto_reais)}</td>
        ${casas.map((c) => {
          const x = v.por_casa[c] || {};
          return `<td class="calc ${x.variacao !== null && x.variacao > 0 ? "neg" : ""}"
            title="${fmt(x.atual, 1)} contra ${fmt(x.anterior, 1)}">${pct(x.variacao, 0)}</td>`;
        }).join("")}
      </tr>`).join("")}</tbody></table>
    <p class="fonte" style="margin-top:8px">Impacto em R$ = diferença de quantidade × custo unitário.
      Positivo é consumo a mais que o mês anterior.</p>`;
}

// ------------------------------------------------------------------ compras
function custosDeCompra() {
  const lista = VISTA.compras || [];
  if (!lista.length) {
    $("#tabela-compras").innerHTML = '<p class="vazio">Nenhuma ordem de compra com preço no mês.<br>' +
      '<span class="fonte">Esta tabela se enche sozinha conforme as OCs vão sendo geradas em ' +
      '<a href="ordens.html">Ordens de Compras</a>.</span></p>';
    return;
  }
  $("#tabela-compras").innerHTML = `<table>
    <thead><tr><th>Unidade compradora</th><th>Produto</th><th>Quantidade</th><th>Gasto</th>
      <th>Custo unit.</th><th>Mês anterior</th><th>Variação</th></tr></thead>
    <tbody>${lista.map((c) => `
      <tr>
        <td>${esc(c.unidade)}</td>
        <td>${esc(c.produto)} <span class="un">${esc(c.un)}</span></td>
        <td class="calc">${fmt(c.qtd, 2)}</td>
        <td class="calc">${reais(c.gasto)}</td>
        <td class="calc">${c.custo_un === null ? "—" : reais(c.custo_un)}</td>
        <td class="calc">${c.custo_un_anterior === null ? "—" : reais(c.custo_un_anterior)}</td>
        <td class="calc ${c.variacao !== null && c.variacao > 0 ? "neg" : ""}">${pct(c.variacao)}</td>
      </tr>`).join("")}</tbody></table>`;
}

// ------------------------------------------------------------------ movimentos
function movimentos() {
  const lista = VISTA.movimentos || [];
  if (!lista.length) { $("#tabela-movimentos").innerHTML = '<p class="vazio">Sem movimentação no mês.</p>'; return; }
  $("#tabela-movimentos").innerHTML = `<table>
    <thead><tr><th>Data</th><th>Casa</th><th>Insumo</th><th>Movimento</th><th>Quantidade</th><th>Origem</th></tr></thead>
    <tbody>${lista.map((m) => `
      <tr>
        <td class="fonte">${brDate(m.data)}</td>
        <td><span class="ponto" style="background:${corCasa(m.casa)}"></span>${esc(m.casa_nome)}</td>
        <td>${esc(m.insumo)}</td>
        <td><span class="selo ${SELO_MOV[m.tipo] || "neutro"}">${esc(m.tipo_nome)}</span></td>
        <td class="calc">${fmt(m.qtd, 2)} <span class="un">${esc(m.un)}</span></td>
        <td class="fonte">${esc(m.origem)}</td>
      </tr>`).join("")}</tbody></table>`;
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

// O cartão de cima é a capa do relatório de baixo. Clicar abre a seção (que
// nasce recolhida), rola até ela e pisca a borda por um instante — sem o
// piscar, quem clica não percebe que a página andou.
function abrirSecao(id) {
  const cart = document.querySelector(`.cartao.dobravel[data-secao="${id}"]`);
  if (!cart) return;
  if (!cart.classList.contains("aberta")) cart.querySelector(".dobra").click();
  cart.scrollIntoView({ behavior: "smooth", block: "start" });
  cart.classList.add("piscando");
  setTimeout(() => cart.classList.remove("piscando"), 1400);
}

function ligarAtalhos() {
  document.querySelectorAll(".card-atalho").forEach((c) => {
    c.onclick = () => abrirSecao(c.dataset.alvo);
    c.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirSecao(c.dataset.alvo); }
    };
  });
}

function ligarDobras() {
  const estado = lerDobras();
  document.querySelectorAll(".cartao.dobravel").forEach((cart) => {
    const id = cart.dataset.secao;
    const cabeca = cart.querySelector(".dobra");
    const aplicar = (aberto) => {
      cart.classList.toggle("aberta", aberto);
      cabeca.querySelector(".ordem-chev").textContent = aberto ? "▾" : "▸";
    };
    aplicar(!!estado[id]);
    cabeca.onclick = (e) => {
      if (e.target.closest("a")) return;            // o link do histórico não dobra a seção
      const aberto = !cart.classList.contains("aberta");
      aplicar(aberto);
      const guardado = lerDobras();
      guardado[id] = aberto;
      try { localStorage.setItem(DOBRA_KEY, JSON.stringify(guardado)); } catch (err) { /* sem storage: só não lembra */ }
    };
  });
}

// ------------------------------------------------------------------ início
$("#mes").onchange = carregar;
// Trocar de casa não vai ao servidor: a resposta já traz tudo por casa, e o
// recorte é uma releitura do que está em memória.
$("#f-casa").onchange = () => { if (DADOS) desenhar(); };
ligarDobras();
ligarAtalhos();
carregar();
