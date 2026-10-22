// ============================================================================
// Projeção de Compras — o modelo do PCPOE, sem os vínculos externos.
//
//   Duração do estoque = (estoque + trânsito entrada − trânsito saída) ÷ (média diária × fator)
//   Dias a cobrir      = dias desejados − duração atual
//   Pedido             = dias a cobrir × média diária × fator
//
// Os dias desejados são digitados por item na Senador Lemos (SL) e valem para
// o mesmo item nas outras casas. Item sem número próprio segue o "Dias a cobrir
// (padrão)" do topo. A média diária
// sai, por padrão, dos últimos 14 dias; em semana atípica (feriado, evento) dá
// para escolher, item a item, quais dias entram na média.
//
// O salmão é medido em peixes e pedido em quilos: a conversão (30 kg por caixa
// ÷ 7 peixes por caixa) vive em dados/compras.json, à vista de quem precisar ajustar.
// ============================================================================
let PROJ = null, CASA = "SL", sujo = false, DIAS = 7;
// Opções da lista de dias a cobrir. O padrão de Parâmetros ou o dia salvo no
// pedido entra na lista mesmo que não esteja aqui.
const OPCOES_DIAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 21, 25, 28, 30, 35, 40, 45, 60];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// Casa mostrada no consolidado. "" = todas juntas. Fica no navegador porque é
// preferência de leitura, não dado do pedido — e quem trabalha uma casa por vez
// não quer reescolher a cada abertura da tela.
const CONS_KEY = "cde_consolidado_casa_v1";
let CONS_CASA = localStorage.getItem(CONS_KEY);
if (CONS_CASA === null) CONS_CASA = CASA;      // 1ª vez: uma casa, não as quatro
const $ = (s) => document.querySelector(s);
// Cuidado com a origem do número: o campo é preenchido com fmt(), que escreve
// "19.313,76" — ponto de MILHAR. O parse ingênuo trocava a vírgula por ponto e
// entregava "19.313.76" ao parseFloat, que para no segundo ponto e devolve
// 19,313. Era isso que fazia o coeficiente sair mil vezes maior: uso 2 kg sobre
// faturamento de R$ 19.313,76 dá 0,104, e a tela mostrava 103,5.
// A vírgula é o que distingue: só quando ela aparece o ponto é separador de
// milhar. Mesma regra do js/comum.js.
const num = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";

function hoje() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function aviso(t, tipo) {
  const el = $("#aviso"); el.textContent = t; el.className = "aviso-flut " + (tipo || "");
  el.hidden = false; clearTimeout(aviso._t); aviso._t = setTimeout(() => { el.hidden = true; }, 3400);
}
function estado(t, c) { const e = $("#estado"); e.textContent = t || ""; e.className = "estado " + (c || ""); }

// ------------------------------------------------------------------ carregar
async function carregar() {
  if (sujo && !confirm("Há alterações não salvas. Recarregar mesmo assim?")) return;
  estado("Carregando…");
  try {
    PROJ = await (await fetch(`/api/projecao?data=${$("#data").value}&dias=${DIAS}`)).json();
  } catch (e) {
    $("#tela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  sujo = false; estado("");
  const cfg = PROJ.config;
  // Cada data é um pedido: o que já foi salvo volta com os dias com que foi
  // salvo; pedido novo começa no padrão de Parâmetros.
  DIAS = PROJ.dias_salvo || cfg.dias_a_cobrir_padrao || 7;
  montarDias();
  $("#janela-txt").textContent =
    `Média diária dos últimos ${PROJ.janela_media_dias} dias, ou dos dias escolhidos no item` +
    ` · estoque do último lançamento`;
  if (!$("#responsavel").options.length) {
    $("#responsavel").innerHTML = '<option value="">—</option>' +
      (cfg.responsaveis || []).map((r) => `<option>${r}</option>`).join("");
  }
  const resp = PROJ.casas[CASA].responsavel;
  if (resp) $("#responsavel").value = resp;
  montarSeletorConsolidado();
  desenharAbas(); desenhar();
}

// O seletor do consolidado é montado uma vez. Ele é INDEPENDENTE das abas de
// cima: dá para conferir a tabela de uma casa enquanto se olha o pedido de
// outra, e o filtro não muda debaixo de quem está lendo.
function montarSeletorConsolidado() {
  const sel = $("#cons-casa");
  if (sel.options.length) return;
  sel.innerHTML = Object.entries(PROJ.casas).map(([ck, c]) =>
    `<option value="${ck}">${ck} — ${c.nome}</option>`).join("") +
    '<option value="">Todas as Casas (juntas)</option>';
  sel.value = PROJ.casas[CONS_CASA] ? CONS_CASA : "";
  CONS_CASA = sel.value;
  sel.onchange = () => {
    CONS_CASA = sel.value;
    localStorage.setItem(CONS_KEY, CONS_CASA);
    consolidar();
  };
}

function desenharAbas() {
  $("#abas-casas").innerHTML = Object.entries(PROJ.casas).map(([ck, c]) =>
    `<button data-c="${ck}" class="${ck === CASA ? "ativa" : ""}" title="${c.nome}">${ck}</button>`).join("");
  document.querySelectorAll("#abas-casas button").forEach((b) => {
    b.onclick = () => { guardarLinhas(); CASA = b.dataset.c; desenharAbas(); desenhar(); };
  });
}

function montarDias() {
  const lista = OPCOES_DIAS.includes(DIAS) ? OPCOES_DIAS
    : OPCOES_DIAS.concat([DIAS]).sort((a, b) => a - b);
  $("#dias").innerHTML = lista.map((d) =>
    `<option value="${d}"${d === DIAS ? " selected" : ""}>${d} dia${d > 1 ? "s" : ""}</option>`).join("");
}

// ------------------------------------------------------------------ média
// Dias escolhidos para a média: null = os da janela padrão. A conta é a mesma
// do servidor (media_dos_dias): só dia com consumo lançado entra, e a média
// divide pelos dias escolhidos que têm lançamento.
const diasEscolhidos = (ins) => Array.isArray(ins.dias_media) ? ins.dias_media
  : (ins.dias_media_padrao || []);

function mediaDe(ins) {
  if (!Array.isArray(ins.dias_media)) return { media: ins.media_diaria, n: ins.dias_com_uso };
  const alvo = new Set(ins.dias_media);
  const usos = (ins.historico || []).filter((h) => alvo.has(h.data)).map((h) => h.uso);
  return { media: usos.length ? usos.reduce((a, b) => a + b, 0) / usos.length : 0, n: usos.length };
}

// ------------------------------------------------------------------ cálculo
// Dias a cobrir do item: o digitado na SL vale para as quatro casas; vazio,
// vale o padrão do topo.
const CASA_DIAS = "SL";
function diasDe(chave) {
  const sl = insumoDa(CASA_DIAS, chave);
  const v = sl ? sl.dias_item : null;
  return v !== null && v !== undefined && v !== "" ? num(v) : DIAS;
}

// Trânsito de salmão é digitado em peixes da libragem que chega (ou sai, numa
// transferência entre casas); a projeção conta em equivalente 08/10. Os fatores
// vêm do servidor (FATOR_LIBRA). Sem libragem, o número já é da linha.
const fatorLibra = (tam) => ((PROJ.libragens || []).find((l) => l.chave === tam) || {}).fator || 1;
const transitoEq = (qtd, tam) => num(qtd) * fatorLibra(tam);

function calcular(ins, campos) {
  const media = mediaDe(ins).media, fator = num(campos.fator) || 1;
  const disponivel = ins.estoque + transitoEq(campos.transito, campos.transito_tam)
    - transitoEq(campos.transito_saida, campos.transito_saida_tam);
  const consumoDia = media * fator;
  const duracao = consumoDia > 0 ? disponivel / consumoDia : (disponivel > 0 ? Infinity : 0);
  const cobrir = Math.max(0, diasDe(ins.chave) - (isFinite(duracao) ? duracao : 0));
  const qtd = cobrir * consumoDia;
  // o peso da caixa varia; os peixes por caixa nao. Guardamos os dois e
  // derivamos o fator, em vez de esconder a conta num numero solto.
  const c = ins.conversao;
  const conv = c ? (c.kg_por_caixa / c.peixes_por_caixa) : 1;
  const calculado = qtd * conv;
  // Ajuste feito no resumo vence o cálculo. O calculado segue junto para a
  // tela poder mostrar de quanto foi o desvio, em vez de só esquecer o número.
  const manual = ins.qtd_manual;
  const ajustado = manual !== null && manual !== undefined && manual !== "";
  return { duracao, cobrir, qtd, calculado, ajustado,
           pedido: ajustado ? num(manual) : calculado, conv: conv,
           un_pedido: c ? c.un_pedido : ins.un };
}

// Lula, tentaculo e atum: a casa CONTA o processado e COMPRA o in natura. A
// linha ja vem convertida para in natura pelo servidor; o selo diz com que
// rendimento, e se ele foi medido num processamento real ou ainda e a media de
// partida — a diferenca entre "o pedido saiu da balanca" e "o pedido saiu de um
// palpite do meio da faixa".
function selo(i) {
  const p = i.processamento;
  if (!p) return "";
  return p.medido
    ? ` <span class="selo-mini" title="Convertido para in natura pelo rendimento` +
      ` medido em ${brDate(p.rendimento_de)}: ${fmt(p.rendimento * 100, 2)}%">` +
      `${fmt(p.rendimento * 100, 1)}%</span>`
    : ` <span class="selo-mini aviso" title="Nenhum processamento lançado ainda —` +
      ` usando o rendimento médio de partida (${fmt(p.rendimento_padrao * 100, 0)}%).` +
      ` Lance o processamento no dia para o pedido usar o rendimento real.">` +
      `${fmt(p.rendimento_padrao * 100, 0)}% est.</span>`;
}

function dicaEstoque(i) {
  const base = `lançado em ${brDate(i.estoque_de)}`;
  const p = i.processamento;
  if (!p) return base;
  return `${base} — ${fmt(p.estoque_in_natura, 3)} in natura + ` +
         `${fmt(p.estoque_processado, 3)} processado ÷ ${fmt(p.rendimento * 100, 2)}%`;
}

function desenhar() {
  const casa = PROJ.casas[CASA];
  const cab = ["Insumo", "Estoque", "Trânsito entrada", "Trânsito saída", "Média/dia", "Fator", "Duração",
               "Dias a cobrir", "Pedido", "Fornecedor"];
  $("#tela").innerHTML =
    `<section class="cartao">
      <div class="cabeca"><h2>${casa.nome}</h2>
        <span class="fonte">Estoque do último lançamento de cada item</span></div>
      <div class="rolagem"><table><thead><tr>${cab.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${casa.insumos.map((i) => `
        <tr data-k="${i.chave}">
          <td>${i.nome} <span class="un">(${i.un})</span>${selo(i)}</td>
          <td class="calc" title="${dicaEstoque(i)}">${fmt(i.estoque, 3)}</td>
          ${celTransito(i, "transito", "Pedido ou transferência que ainda vai chegar")}
          ${celTransito(i, "transito_saida", "Transferência para outra casa que ainda vai sair")}
          <td class="calc media"></td>
          <td><input data-c="fator" type="text" inputmode="decimal" value="${i.fator ?? 1}" style="width:64px"></td>
          <td class="calc dur"></td>
          ${CASA === CASA_DIAS
            ? `<td><input data-c="dias" type="text" inputmode="numeric" style="width:56px"
                 value="${i.dias_item ?? ""}" placeholder="${DIAS}"
                 title="Dias a cobrir deste item — vale também para as outras casas. Vazio: usa o padrão do topo"></td>`
            : `<td class="calc cobrir" title="Digitado na ${PROJ.casas[CASA_DIAS].nome} (SL) — vale para as quatro casas"></td>`}
          <td class="calc ped"></td>
          <td><select data-c="fornecedor"><option value="">Selecione</option>${
            (PROJ.config.fornecedores || []).map((f) =>
              `<option${f === i.fornecedor ? " selected" : ""}>${f}</option>`).join("")}</select></td>
        </tr>
        <tr class="linha-dias" data-k="${i.chave}"${i._diasAbertos ? "" : " hidden"}>
          <td colspan="${cab.length}">${blocoDias(i)}</td></tr>`).join("")}</tbody></table></div>
    </section>`;
  recalcular();
}

// Célula de trânsito. No salmão vem com a libragem ao lado e, embaixo, quanto
// aquilo dá em equivalente 08/10 (preenchido no recalcular).
function celTransito(i, campo, dica) {
  const input = `<input data-c="${campo}" type="text" inputmode="decimal" value="${i[campo] ?? ""}" title="${dica}"`;
  if (i.chave !== CHAVE_SALMAO || !(PROJ.libragens || []).length) return `<td>${input}></td>`;
  const tam = i[campo + "_tam"] || PROJ.libragens[0].chave;
  return `<td>${input} style="width:56px">
    <select data-c="${campo}_tam" title="Libragem que está ${campo === "transito" ? "chegando" : "saindo"}">${
      PROJ.libragens.map((l) => `<option value="${l.chave}"${l.chave === tam ? " selected" : ""}>${l.nome}</option>`).join("")}</select>
    <span class="msg-conv eq-${campo}"></span></td>`;
}

// Os dias que formam a média do item, num calendário de segunda a domingo:
// cada dia numa linha só, data, consumo e a caixa ("10/10  19 Px  ☐"). Os dias da janela vêm marcados;
// desmarcar o feriado tira o feriado da média, marcar um dia de 30 dias atrás
// põe na conta um dia parecido com o que vem.
const UN_INTEIRA = ["Px", "Pxs", "Pct", "Bng"];

function blocoDias(ins) {
  const hist = ins.historico || [];
  if (!hist.length) return `<p class="fonte">Sem consumo lançado nos últimos ${PROJ.historico_dias} dias.</p>`;
  const marcados = new Set(diasEscolhidos(ins));
  const janela = new Set(ins.dias_media_padrao || []);
  const m = mediaDe(ins);
  // o equivalente de salmão sai fracionado (11,6 peixes): uma casa basta
  const dec = UN_INTEIRA.includes(ins.un) ? 1 : 2;
  return `<div class="dias-caixa">
    <div class="dias-topo">
      <span>Média de <strong>${m.n}</strong> dia(s): <strong>${fmt(m.media, 3)} ${ins.un}/dia</strong>
        ${Array.isArray(ins.dias_media) ? '<span class="selo-mini aviso">dias escolhidos</span>'
          : `<span class="selo-mini">últimos ${PROJ.janela_media_dias} dias</span>`}</span>
      <span style="flex:1"></span>
      <button type="button" class="botao-mini dias-acao" data-acao="padrao" data-k="${ins.chave}">Voltar aos últimos ${PROJ.janela_media_dias} dias</button>
      <button type="button" class="botao-mini dias-acao" data-acao="nenhum" data-k="${ins.chave}">Desmarcar todos</button>
      <button type="button" class="botao-mini dias-acao" data-acao="todos-itens" data-k="${ins.chave}"
        title="Usa estes mesmos dias em todos os itens de ${PROJ.casas[CASA].nome}">Usar estes dias em todos os itens da casa</button>
    </div>
    <div class="dias-grade">
      ${DOW.slice(1).concat(DOW[0]).map((d) => `<div class="dia-cab">${d}</div>`).join("")}
      ${semanasDe(hist).map((dia) => {
        if (!dia) return '<div class="dia-vazio"></div>';
        const h = hist.find((x) => x.data === dia);
        if (!h) return `<div class="dia-vazio sem-uso" title="Sem consumo lançado"><span class="dia-data">${diaMes(dia)}</span></div>`;
        return `<label class="dia-chip${marcados.has(h.data) ? " marcado" : ""}${janela.has(h.data) ? " janela" : ""}${h.uso < 0 ? " neg" : ""}"${
          h.uso < 0 ? ' title="Consumo negativo: divergência de contagem em dia de recebimento. Marcado, ele rebaixa a média."' : ""}>
          <span class="dia-data">${diaMes(h.data)}</span>
          <span class="dia-uso">${fmt(h.uso, dec)} ${ins.un}</span>
          <input type="checkbox" data-dia="${h.data}" data-k="${ins.chave}"${marcados.has(h.data) ? " checked" : ""}>
        </label>`;
      }).join("")}</div>
  </div>`;
}

// Calendário com a semana começando na segunda: da segunda da semana do dia
// mais antigo ao domingo da semana do mais recente. Cada posição é a data ISO,
// ou null antes do primeiro e depois do último dia do histórico.
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function semanasDe(hist) {
  const datas = hist.map((h) => h.data).sort();
  const ini = datas[0], fim = datas[datas.length - 1];
  const d = new Date(ini + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const out = [];
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > fim && out.length % 7 === 0) break;
    out.push(iso < ini || iso > fim ? null : iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function redesenharDias(ins) {
  const td = document.querySelector(`#tela tr.linha-dias[data-k="${ins.chave}"] td`);
  if (td) td.innerHTML = blocoDias(ins);
}

function lerLinha(tr) {
  const v = (c) => { const el = tr.querySelector(`[data-c="${c}"]`); return el ? el.value : ""; };
  return { transito: v("transito"), transito_tam: v("transito_tam") || null,
           transito_saida: v("transito_saida"), transito_saida_tam: v("transito_saida_tam") || null,
           fator: v("fator"), fornecedor: v("fornecedor") };
}

function recalcular() {
  const casa = PROJ.casas[CASA];
  document.querySelectorAll("#tela tbody tr[data-k]:not(.linha-dias)").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.k);
    const campos = lerLinha(tr);
    const r = calcular(ins, campos);
    const m = mediaDe(ins);
    ["transito", "transito_saida"].forEach((c) => {
      const el = tr.querySelector(".eq-" + c);
      if (!el) return;
      // Sempre visível: sem quantidade, mostra o fator da libragem escolhida;
      // com quantidade, quanto ela dá em equivalente 08/10.
      const q = num(campos[c]), f = fatorLibra(campos[c + "_tam"]);
      const tam = ((PROJ.libragens || []).find((l) => l.chave === campos[c + "_tam"]) || {}).nome || "08/10";
      el.textContent = q
        ? `${fmt(q, Number.isInteger(q) ? 0 : 2)} px ${tam} = ${fmt(q * f, 2)} ${ins.un} eq. 08/10`
        : `1 px ${tam} = ${fmt(f, 2)} ${ins.un} eq. 08/10`;
    });
    tr.querySelector(".media").innerHTML = `${fmt(m.media, 3)}
      <button type="button" class="botao-mini abrir-dias${Array.isArray(ins.dias_media) ? " ajustado" : ""}"
        data-k="${ins.chave}" title="Escolher os dias que formam a média">${m.n} dia${m.n === 1 ? "" : "s"}</button>`;
    const tdC = tr.querySelector(".cobrir");
    if (tdC) tdC.textContent = diasDe(ins.chave) + " d";
    const inC = tr.querySelector('[data-c="dias"]');
    if (inC) inC.placeholder = DIAS;
    const tdD = tr.querySelector(".dur"), tdP = tr.querySelector(".ped");
    tdD.textContent = r.duracao === Infinity ? "sem consumo" : fmt(r.duracao, 1) + " d";
    tdD.className = "calc dur" + (isFinite(r.duracao) && r.duracao < 3 ? " neg" : "");
    if (r.pedido <= 0.0005) {
      tdP.innerHTML = '<span class="selo bom">Não pedir</span>';
    } else {
      tdP.innerHTML = `<strong>${fmt(r.pedido, r.un_pedido === "Kg" ? 1 : 3)}</strong>
        <span class="un">${r.un_pedido}</span>` +
        (ins.conversao ? `<span class="msg-conv">${fmt(r.qtd, 1)} ${ins.un} × ${fmt(r.conv, 3)} kg
           <span title="peso da caixa ÷ peixes por caixa">(${ins.conversao.kg_por_caixa} kg ÷ ${ins.conversao.peixes_por_caixa} px)</span></span>` : "");
    }
    tdP.className = "calc ped";
  });
  consolidar();
}

// ------------------------------------------------------------------ conciliação
// O pedido consolidado fala a língua do CDE ("Camarão M"); a OC precisa falar a
// língua do fornecedor ("CAMARÃO ROSA 31/50 DESC - SC 1KG"). O de-para vem
// pronto do servidor (dados/vinculos.json) junto com o preço já negociado —
// aqui só escolhemos, quando o insumo tem mais de um produto possível.
const CHAVE_SALMAO = "salmao_equivalente";
const norm = (t) => String(t == null ? "" : t)
  .normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
const escapa = (t) => String(t == null ? "" : t).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function opcoesCatalogo(chaveInsumo, fornecedor) {
  const cad = (PROJ.fornecedor_cadastro || {})[fornecedor];
  const lista = (PROJ.catalogo || {})[chaveInsumo] || [];
  if (!cad) return [];
  return lista.filter((p) => norm(p.fornecedor) === norm(cad));
}

function produtoEscolhido(ins, opcoes) {
  const alvo = norm(ins.produto_oc || "");
  return opcoes.find((p) => norm(p.produto) === alvo) || opcoes[0] || null;
}

const partesSalmao = () => (PROJ.config && PROJ.config.salmao_partes) || [];
const insumoDa = (casa, chaveInsumo) =>
  PROJ.casas[casa].insumos.find((i) => i.chave === chaveInsumo);

// Quanto de peixe INTEIRO cada parte pedida consome. Pedir 10 kg de filé com
// pele não tira 10 kg da necessidade: tira 10 ÷ 0,6716 = 14,9 kg de inteiro.
function equivalenteDoSplit(ins) {
  const split = ins.split || {};
  return partesSalmao().reduce((soma, parte) => {
    const q = num((split[parte.chave] || {}).qtd);
    const rend = parte.rendimento || 1;
    return soma + (q > 0 && rend > 0 ? q / rend : 0);
  }, 0);
}

// ------------------------------------------------------------------ consolidado
function consolidar() {
  const grupos = {};
  Object.entries(PROJ.casas).forEach(([ck, casa]) => {
    casa.insumos.forEach((ins) => {
      const tr = ck === CASA ? document.querySelector(`#tela tr[data-k="${ins.chave}"]`) : null;
      const campos = tr ? lerLinha(tr) : {
        transito: ins.transito, transito_tam: ins.transito_tam,
        transito_saida: ins.transito_saida, transito_saida_tam: ins.transito_saida_tam,
        fator: ins.fator, fornecedor: ins.fornecedor };
      const r = calcular(ins, campos);
      if (r.pedido <= 0.0005) return;
      const forn = campos.fornecedor || "Sem fornecedor";
      grupos[forn] = grupos[forn] || { forn: forn, itens: [], total: 0 };
      grupos[forn].itens.push({
        casa: ck, chave: ins.chave, nome: ins.nome, un: r.un_pedido,
        qtd: r.pedido, calculado: r.calculado, ajustado: r.ajustado });
      grupos[forn].total += r.pedido;
    });
  });

  // O cálculo acima é sempre das quatro casas — o filtro decide só o que
  // aparece. Somar apenas a casa escolhida daria um consolidado que muda de
  // valor conforme quem está olhando.
  let lista = Object.values(grupos).sort((a, b) => a.forn.localeCompare(b.forn));
  if (CONS_CASA) {
    lista = lista
      .map((g) => Object.assign({}, g, { itens: g.itens.filter((i) => i.casa === CONS_CASA) }))
      .filter((g) => g.itens.length);
  }

  const nomeCasa = CONS_CASA ? (PROJ.casas[CONS_CASA] || {}).nome : "";
  const itensTotais = lista.reduce((n, g) => n + g.itens.length, 0);
  $("#cons-nota").textContent = itensTotais
    ? `${lista.length} fornecedor(es) · ${itensTotais} item(ns)` +
      (CONS_CASA ? ` · só ${nomeCasa}` : " · as quatro casas somadas")
    : "";

  if (!lista.length) {
    $("#consolidado").innerHTML = '<p class="vazio">' + (CONS_CASA
      ? `Nenhum item a pedir para ${nomeCasa} com os parâmetros atuais.` +
        '<br><span class="fonte">Outra casa pode ter pedido — troque a casa acima ' +
        'ou escolha <strong>Todas as casas</strong>.</span>'
      : "Nenhum item a pedir com os parâmetros atuais.") + "</p>";
    return;
  }

  // Um bloco por fornecedor: é assim que a compra acontece — uma ligação,
  // uma entrega. Item repetido em casas diferentes aparece uma vez por casa,
  // porque cada casa vira uma ordem separada.
  $("#consolidado").innerHTML = lista.map((g) => {
    const itens = g.itens.slice().sort((a, b) =>
      a.nome.localeCompare(b.nome) || a.casa.localeCompare(b.casa));
    return `<div class="grupo-forn">
      <div class="grupo-forn-cab">
        <h3>${g.forn}</h3>
        <span class="fonte">${itens.length} item(ns)${CONS_CASA ? ""
          : " · " + new Set(itens.map((i) => i.casa)).size + " casa(s)"}</span>
        <span style="flex:1"></span>
        ${g.forn === "Sem fornecedor"
          ? '<span class="fonte">Escolha o fornecedor na tabela acima para gerar a ordem</span>'
          : `<button class="botao editar-oc" data-forn="${g.forn.replace(/"/g, "&quot;")}">Editar OC</button>`}
      </div>
      <table class="tabela-curta">
        <thead><tr><th>Item</th>${CONS_CASA ? "" : "<th>Casa</th>"}<th>Quantidade</th><th>Un.</th>
          <th>Produto na OC</th><th>Custo estimado</th><th>Projetado</th></tr></thead>
        <tbody>${itens.map((i) => linhaConsolidada(i, g.forn)).join("")}</tbody>
      </table>
    </div>`;
  }).join("");

  document.querySelectorAll(".qtd-resumo").forEach((el) => {
    el.dataset.antes = el.value;
    el.onchange = () => confirmarQtd(el);
  });
  ligarConciliacao();
  document.querySelectorAll(".editar-oc").forEach((b) => {
    b.onclick = () => editarOC(b.dataset.forn);
  });
}

// Uma linha do consolidado: quantidade, o produto do catálogo em que ela vira
// e o custo estimado por esse preço. Salmão ganha a linha extra de repartição.
function linhaConsolidada(i, forn) {
  const ins = insumoDa(i.casa, i.chave);
  const ops = opcoesCatalogo(i.chave, forn);
  const escolhido = produtoEscolhido(ins, ops);
  const colunas = CONS_CASA ? 6 : 7;
  const custo = escolhido ? i.qtd * escolhido.preco : 0;
  const ehSalmao = i.chave === CHAVE_SALMAO && partesSalmao().length;
  const repartido = ehSalmao ? equivalenteDoSplit(ins) : 0;

  const seletor = ops.length
    ? `<select class="prod-oc" data-casa="${i.casa}" data-k="${i.chave}">${ops.map((p) =>
        `<option value="${escapa(p.produto)}"${escolhido && norm(p.produto) === norm(escolhido.produto)
          ? " selected" : ""}>${escapa(p.produto)}${p.preco > 0 ? " — R$ " + fmt(p.preco) : " — sem preço"}</option>`).join("")}</select>`
    : `<span class="fonte" title="Sem produto vinculado para este fornecedor">Sem vínculo —
        <a href="cadastros.html">cadastre o produto</a></span>`;

  return `<tr>
      <td>${i.nome}${ehSalmao
        ? ` <button class="botao-mini abrir-partes" data-casa="${i.casa}" title="Pedir em filé em vez de peixe inteiro">Repartir</button>` : ""}</td>
      ${CONS_CASA ? "" : `<td>${i.casa}</td>`}
      <td><input class="qtd-resumo${i.ajustado ? " ajustada" : ""}" type="text"
             inputmode="decimal" data-casa="${i.casa}" data-k="${i.chave}"
             data-calc="${i.calculado}" value="${fmt(i.qtd, 1)}"
             title="${i.ajustado ? "Ajustado à mão — o cálculo dava " + fmt(i.calculado, 1) : "Quantidade projetada pelo cálculo"}"></td>
      <td class="un">${i.un}</td>
      <td>${seletor}</td>
      <td class="calc">${escolhido && escolhido.preco > 0 ? "R$ " + fmt(custo) : "—"}</td>
      <td class="calc">${i.ajustado
        ? `<span class="selo-mini" title="Quantidade alterada à mão">${fmt(i.calculado, 1)} calc.</span>`
        : "—"}</td>
    </tr>` + (ehSalmao ? blocoPartes(i, ins, forn, colunas, repartido) : "");
}

// Repartição do salmão. A projeção calcula a necessidade em peixe inteiro; a
// compra pode ser feita em filé. Informar 10 kg de filé com pele não cobre
// 10 kg da necessidade — cobre 14,9, porque 1 kg de inteiro vira 0,6716 kg de
// filé. É essa conta que a linha de baixo mostra, para o pedido não encolher
// sem ninguém perceber.
function blocoPartes(i, ins, forn, colunas, repartido) {
  const split = ins.split || {};
  const aberto = !!ins._partesAbertas || repartido > 0;
  const ops = opcoesCatalogo(i.chave, forn);
  const linhas = partesSalmao().map((parte) => {
    const atual = split[parte.chave] || {};
    const q = num(atual.qtd);
    const rend = parte.rendimento || 1;
    const alvo = norm(atual.produto || "");
    return `<div class="parte-linha">
      <span class="parte-nome">${parte.nome}<small>${fmt(rend, 4)} kg por kg de inteiro</small></span>
      <input class="parte-qtd" type="text" inputmode="decimal" data-casa="${i.casa}"
             data-parte="${parte.chave}" value="${q > 0 ? fmt(q, 1) : ""}" placeholder="0,0">
      <span class="un">Kg</span>
      <select class="parte-prod" data-casa="${i.casa}" data-parte="${parte.chave}">
        <option value="">Produto na OC…</option>
        ${ops.map((p) => `<option value="${escapa(p.produto)}"${norm(p.produto) === alvo ? " selected" : ""}>${escapa(p.produto)}${
          p.preco > 0 ? " — R$ " + fmt(p.preco) : ""}</option>`).join("")}
      </select>
      <span class="fonte parte-eq">${q > 0 && rend > 0 ? "consome " + fmt(q / rend, 1) + " kg de inteiro" : ""}</span>
    </div>`;
  }).join("");

  const falta = i.qtd - repartido;
  return `<tr class="linha-partes"${aberto ? "" : " hidden"} data-casa="${i.casa}">
    <td colspan="${colunas}">
      <div class="partes-caixa">
        <div class="fonte">Necessidade projetada: <strong>${fmt(i.qtd, 1)} kg</strong> de peixe inteiro.
          Informe quanto quer pedir de cada tipo — o que sobrar continua indo como peixe inteiro.</div>
        ${linhas}
        <div class="partes-resumo${falta < -0.05 ? " neg" : ""}">${resumoPartes(i.qtd, repartido)}</div>
      </div>
    </td></tr>`;
}

function resumoPartes(necessario, repartido) {
  const falta = necessario - repartido;
  if (repartido <= 0.0005) return "Nada repartido — o pedido sai inteiro em peixe inteiro.";
  if (falta > 0.05)
    return `Repartido: ${fmt(repartido, 1)} kg equivalentes · faltam ${fmt(falta, 1)} kg,
            que entram na OC como peixe inteiro.`;
  if (falta < -0.05)
    return `Repartido: ${fmt(repartido, 1)} kg equivalentes · ${fmt(-falta, 1)} kg acima do projetado.`;
  return `Repartido: ${fmt(repartido, 1)} kg equivalentes — cobre a necessidade inteira.`;
}

function ligarConciliacao() {
  document.querySelectorAll(".prod-oc").forEach((sel) => {
    sel.onchange = () => {
      insumoDa(sel.dataset.casa, sel.dataset.k).produto_oc = sel.value || null;
      sujo = true; estado("Não salvo", "erro");
      consolidar();
    };
  });
  document.querySelectorAll(".abrir-partes").forEach((b) => {
    b.onclick = () => {
      const ins = insumoDa(b.dataset.casa, CHAVE_SALMAO);
      ins._partesAbertas = !ins._partesAbertas;
      consolidar();
    };
  });
  document.querySelectorAll(".parte-qtd, .parte-prod").forEach((el) => {
    el.onchange = () => {
      const ins = insumoDa(el.dataset.casa, CHAVE_SALMAO);
      ins._partesAbertas = true;
      ins.split = ins.split || {};
      const atual = ins.split[el.dataset.parte] || {};
      if (el.classList.contains("parte-qtd")) atual.qtd = el.value === "" ? null : num(el.value);
      else atual.produto = el.value || null;
      ins.split[el.dataset.parte] = atual;
      sujo = true; estado("Não salvo", "erro");
      consolidar();
    };
  });
}

// Mexer na quantidade projetada é uma decisão, não um deslize de teclado:
// pede confirmação mostrando de quanto para quanto, e desfaz se cancelar.
function confirmarQtd(el) {
  const novo = num(el.value), antes = num(el.dataset.antes);
  const calc = num(el.dataset.calc);
  if (Math.abs(novo - antes) < 0.0005) { el.value = fmt(antes, 1); return; }

  const ins = PROJ.casas[el.dataset.casa].insumos.find((i) => i.chave === el.dataset.k);
  const dif = calc > 0 ? ((novo - calc) / calc) * 100 : 0;
  const msg = `Alterar a quantidade de ${ins.nome} (${el.dataset.casa})?

` +
    `De ${fmt(antes, 1)} para ${fmt(novo, 1)}
` +
    `O cálculo projetou ${fmt(calc, 1)}` +
    (calc > 0 ? ` — a alteração fica ${dif > 0 ? "+" : ""}${fmt(dif, 1)}% em relação ao projetado.` : ".");
  if (!confirm(msg)) { el.value = fmt(antes, 1); return; }

  // guardado no insumo: vale para a ordem de compra e sobrevive ao recálculo
  ins.qtd_manual = novo;
  sujo = true; estado("Não salvo", "erro");
  recalcular();
}

// Leva para a tela de Ordens de Compras já na ordem deste fornecedor. Salva
// antes, senão a ordem ainda não existe do outro lado.
async function editarOC(forn) {
  if (sujo) {
    if (!confirm("As alterações precisam ser salvas antes de abrir a ordem. Salvar agora?")) return;
    await salvar();
    if (sujo) return;                        // salvar falhou: não navega
  }
  window.location = "ordens.html?f=" + encodeURIComponent(forn);
}

// ------------------------------------------------------------------ salvar
async function salvar() {
  guardarLinhas();
  PROJ.casas[CASA].responsavel = $("#responsavel").value || null;

  const corpo = { data: PROJ.data, dias_cobrir: DIAS, casas: {} };
  Object.entries(PROJ.casas).forEach(([ck, casa]) => {
    const insumos = {};
    casa.insumos.forEach((i) => {
      insumos[i.chave] = { transito: i.transito, transito_tam: i.transito_tam ?? null,
                           transito_saida: i.transito_saida,
                           transito_saida_tam: i.transito_saida_tam ?? null,
                           fator: i.fator,
                           dias_cobrir: diasDe(i.chave), fornecedor: i.fornecedor,
                           dias_item: ck === CASA_DIAS ? (i.dias_item ?? null) : null,
                           dias_media: Array.isArray(i.dias_media) ? i.dias_media : null,
                           qtd_manual: i.qtd_manual ?? null,
                           produto_oc: i.produto_oc ?? null,
                           split: i.split ?? null };
    });
    corpo.casas[ck] = { responsavel: casa.responsavel, insumos: insumos };
  });

  $("#btn-salvar").disabled = true; estado("Salvando…");
  try {
    const r = await (await fetch("/api/pedido", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");
    sujo = false; estado("Salvo", "ok");
    aviso("Pedido de " + brDate(PROJ.data) + " salvo.", "bom");
  } catch (e) {
    estado("Falha ao salvar", "erro");
    aviso("Não consegui salvar: " + e.message, "mau");
  } finally { $("#btn-salvar").disabled = false; }
}

// O que está digitado na casa à vista vai para o objeto do insumo. Precisa
// acontecer antes de trocar de casa, senão o redesenho apaga o que foi digitado.
function guardarLinhas() {
  if (!PROJ) return;
  document.querySelectorAll("#tela tbody tr[data-k]:not(.linha-dias)").forEach((tr) => {
    const ins = PROJ.casas[CASA].insumos.find((i) => i.chave === tr.dataset.k);
    const c = lerLinha(tr);
    ins.transito = c.transito === "" ? null : num(c.transito);
    ins.transito_saida = c.transito_saida === "" ? null : num(c.transito_saida);
    ins.transito_tam = c.transito_tam;
    ins.transito_saida_tam = c.transito_saida_tam;
    ins.fator = num(c.fator) || 1;
    ins.fornecedor = c.fornecedor || null;
  });
}

function marcarSujo() { sujo = true; estado("Não salvo", "erro"); }

// Eventos da tabela, ligados UMA vez: a tabela é redesenhada a cada troca de
// casa, e o contêiner fica.
function ligarTabela() {
  const tela = $("#tela");
  const insumo = (k) => PROJ.casas[CASA].insumos.find((i) => i.chave === k);
  tela.addEventListener("input", (e) => {
    if (!e.target.matches("input[data-c],select[data-c]")) return;
    if (e.target.dataset.c === "dias") {
      const ins = insumo(e.target.closest("tr").dataset.k);
      const v = e.target.value.trim();
      ins.dias_item = v === "" ? null : Math.min(60, Math.max(1, num(v) || 1));
    }
    marcarSujo(); recalcular();
  });
  tela.addEventListener("change", (e) => {
    if (e.target.matches("select[data-c]")) { marcarSujo(); consolidar(); return; }
    const cx = e.target.closest("input[data-dia]");
    if (!cx) return;
    const ins = insumo(cx.dataset.k);
    const sel = new Set(diasEscolhidos(ins));
    if (cx.checked) sel.add(cx.dataset.dia); else sel.delete(cx.dataset.dia);
    ins.dias_media = [...sel].sort().reverse();
    marcarSujo(); redesenharDias(ins); recalcular();
  });
  tela.addEventListener("click", (e) => {
    const abrir = e.target.closest(".abrir-dias");
    if (abrir) {
      const ins = insumo(abrir.dataset.k);
      ins._diasAbertos = !ins._diasAbertos;
      const linha = tela.querySelector(`tr.linha-dias[data-k="${ins.chave}"]`);
      if (linha) { linha.hidden = !ins._diasAbertos; if (ins._diasAbertos) redesenharDias(ins); }
      return;
    }
    const b = e.target.closest(".dias-acao");
    if (!b) return;
    const casa = PROJ.casas[CASA];
    const ins = insumo(b.dataset.k);
    if (b.dataset.acao === "padrao") ins.dias_media = null;
    else if (b.dataset.acao === "nenhum") ins.dias_media = [];
    else if (b.dataset.acao === "todos-itens") {
      // Mesmos dias de calendário para todos — feriado é feriado para a casa
      // inteira. Dia sem consumo lançado num item simplesmente não conta nele.
      const padrao = !Array.isArray(ins.dias_media);
      const dias = diasEscolhidos(ins).slice();
      guardarLinhas();
      casa.insumos.forEach((o) => { o.dias_media = padrao ? null : dias.slice(); });
      aviso(`Dias de ${ins.nome} aplicados aos ${casa.insumos.length} itens de ${casa.nome}.`, "bom");
      marcarSujo(); desenhar(); return;
    }
    marcarSujo(); redesenharDias(ins); recalcular();
  });
}

// Enter desce para o campo de baixo. A tabela da casa usa o comportamento
// geral (js/navegacao.js); aqui ficam os dois casos que ele não cobre: a
// quantidade do consolidado, que segue de um fornecedor para o outro mesmo
// com colunas diferentes, e a repartição do salmão, que não é uma coluna de
// tabela. A lista é lida de novo depois do blur porque confirmar a quantidade
// redesenha o consolidado — o campo de baixo é achado pela posição.
const COLUNAS_ENTER = (el) =>
  el.matches(".qtd-resumo") ? ".qtd-resumo"
  : el.matches(".parte-qtd") ? ".parte-qtd" : null;

function enterDesce(e) {
  if (e.key !== "Enter" || e.shiftKey || !e.target.matches("input")) return;
  const seletor = COLUNAS_ENTER(e.target);
  if (!seletor) return;
  e.preventDefault();
  const visiveis = () => [...document.querySelectorAll(seletor)].filter((el) => el.offsetParent);
  const pos = visiveis().indexOf(e.target);
  e.target.blur();
  const prox = visiveis()[pos + 1];
  if (prox) { prox.focus(); prox.select(); }
}

// ------------------------------------------------------------------ início
(async function iniciar() {
  $("#data").value = hoje();
  montarDias();
  ligarTabela();
  document.addEventListener("keydown", enterDesce);
  $("#data").onchange = carregar;
  // Padrão do pedido: vale para os itens sem dias próprios digitados na SL.
  $("#dias").onchange = () => {
    DIAS = num($("#dias").value) || 7;
    marcarSujo(); recalcular();
  };
  $("#btn-salvar").onclick = salvar;
  window.addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });
  carregar();
})();
