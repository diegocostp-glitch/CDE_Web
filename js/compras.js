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
  // o pedido da data anterior grava antes de a tela trocar de data
  if (PROJ) await salvarAgora();
  if (sujo && !confirm("O pedido de " + brDate(PROJ.data) + " não foi salvo. Trocar de data mesmo assim?")) {
    $("#data").value = PROJ.data;
    return;
  }
  estado("Carregando…");
  try {
    PROJ = await (await fetch(`/api/projecao?data=${$("#data").value}&dias=${DIAS}`)).json();
  } catch (e) {
    $("#tela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  sujo = false; estado("");
  await carregarACaminho();
  const cfg = PROJ.config;
  // Cada data é um pedido: o que já foi salvo volta com os dias com que foi
  // salvo; pedido novo começa no padrão de Parâmetros.
  DIAS = PROJ.dias_salvo || cfg.dias_a_cobrir_padrao || 7;
  montarDias();
  // Pedido de dia passado vem com estoque e média de quando foi feito: o aviso
  // diz de quando, para ninguém achar que é o estoque de hoje.
  const em = PROJ.congelado_em;
  $("#janela-txt").textContent = em
    ? `Estoque e média congelados em ${brDate(em.slice(0, 10))} às ${em.slice(11, 16)}` +
      ` · lançamento corrigido depois não muda este pedido`
    : `Média diária do período escolhido, ou dos dias marcados no item` +
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
  const nav = $("#abas-casas"), realce = tirarRealce(nav);
  nav.innerHTML = Object.entries(PROJ.casas).map(([ck, c]) =>
    `<button type="button" data-c="${ck}" class="${ck === CASA ? "ativa" : ""}" title="${c.nome}">${nomeLoja(ck, c.nome)}</button>`).join("");
  porRealce(nav, realce);
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

// Período alternativo da média: os dias com consumo lançado nos últimos N dias
// antes da data do pedido. Mesma regra da janela padrão do servidor
// (base_do_item: dia >= data - janela), só que com N escolhido na tela. Vira
// uma lista de dias_media, que já é salva com o pedido e congelada com ele.
const PERIODO_ALTERNATIVO = 28;
function diasDaJanela(ins, n) {
  const d = new Date(PROJ.data + "T12:00:00");
  d.setDate(d.getDate() - n);
  const ini = d.toISOString().slice(0, 10);
  return (ins.historico || []).filter((h) => h.data >= ini && h.data < PROJ.data)
    .map((h) => h.data).sort().reverse();
}
const mesmosDias = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
// "padrao", "28" ou "" (dias escolhidos à mão) para um item
function periodoDe(ins) {
  if (!Array.isArray(ins.dias_media)) return "padrao";
  const sel = ins.dias_media.slice().sort().reverse();
  return mesmosDias(sel, diasDaJanela(ins, PERIODO_ALTERNATIVO)) ? String(PERIODO_ALTERNATIVO) : "";
}
// O seletor da barra mostra o período da casa aberta; com itens misturados,
// aparece "Dias escolhidos por item".
function sincronizarPeriodo() {
  const sel = $("#periodo-media");
  if (!sel || !PROJ) return;
  const pad = PROJ.janela_media_dias;
  const ops = [["padrao", `Últimos ${pad} dias (padrão)`]];
  if (pad !== PERIODO_ALTERNATIVO) ops.push([String(PERIODO_ALTERNATIVO), `Últimos ${PERIODO_ALTERNATIVO} dias`]);
  const its = PROJ.casas[CASA].insumos.filter((i) => (i.historico || []).length);
  const vals = new Set(its.map(periodoDe));
  const atual = vals.size === 1 ? [...vals][0] : "";
  if (atual === "") ops.push(["", "Dias escolhidos por item"]);
  sel.innerHTML = ops.map(([v, r]) => `<option value="${v}"${v === atual ? " selected" : ""}` +
    `${v === "" ? " disabled" : ""}>${r}</option>`).join("");
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
  // Estoque além do que os dias a cobrir pedem: o que fica parado se a média
  // se confirmar. Negativo quando falta (aí a linha pede compra).
  const dias = diasDe(ins.chave);
  const sobra = disponivel - consumoDia * dias;
  return { duracao, cobrir, qtd, calculado, ajustado, sobra, dias, consumoDia,
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

// Ajuste do pedido: o número digitado vai para o pedido no lugar do calculado
// (o mesmo qtd_manual do resumo). Mostrado sem separador de milhar, como se digita.
const temManual = (v) => v !== null && v !== undefined && v !== "";
const txtManual = (v) => temManual(v)
  ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false }) : "";

function desenhar() {
  sincronizarPeriodo();
  alertaACaminho();
  const casa = PROJ.casas[CASA];
  const cab = ["Insumo", "Estoque", "Trânsito entrada", "Trânsito saída", "Média/dia",
               "", "Fator", "Duração",
               "Dias a cobrir", "Pedido", "Ajuste", "Fornecedor"];
  // A coluna da curva fica sem título para ser estreita; a explicação vai na dica.
  const th = (h) => h ? `<th>${h}</th>` : `<th title="Consumo nos dias da média"></th>`;
  $("#tela").innerHTML =
    `<section class="cartao">
      <div class="cabeca"><h2>${casa.nome}</h2>
        <span class="fonte">Estoque do último lançamento de cada item</span></div>
      <div class="rolagem"><table class="tabela-proj"><thead><tr>${cab.map(th).join("")}</tr></thead>
      <tbody>${casa.insumos.map((i) => `
        <tr data-k="${i.chave}">
          <td>${i.nome} <span class="un">(${i.un})</span>${selo(i)}</td>
          <td class="calc" title="${dicaEstoque(i)}">${fmt(i.estoque, 3)}</td>
          ${celTransito(i, "transito", "Pedido ou transferência que ainda vai chegar")}
          ${celTransito(i, "transito_saida", "Transferência para outra casa que ainda vai sair")}
          <td class="calc media"></td>
          <td class="tend"></td>
          <td><input data-c="fator" type="text" inputmode="decimal" value="${i.fator ?? 1}" style="width:64px"></td>
          <td class="calc dur"></td>
          <td><input data-c="dias" type="text" inputmode="numeric" style="width:56px"
               value="${(insumoDa(CASA_DIAS, i.chave) || {}).dias_item ?? ""}" placeholder="${DIAS}"
               title="Dias a cobrir deste item — vale para as quatro casas. Vazio: usa o padrão do topo"></td>
          <td class="calc ped"></td>
          <td class="ajuste-cel"><input data-c="ajuste" class="qtd-resumo" type="text" inputmode="decimal"
               value="${txtManual(i.qtd_manual)}" placeholder="${i.conversao ? "kg" : "—"}"
               title="${i.conversao
                 ? "Em kg de peixe inteiro, a mesma unidade do Pedido — não em peixes. Vai para a ordem no lugar do calculado. Vazio: vale o calculado"
                 : "Quantidade que vai no pedido no lugar da calculada. Vazio: vale o calculado"}">
            <span class="un"></span></td>
          <td><select data-c="fornecedor"><option value="">Selecione</option>${
            fornecedoresDe(i).map((f) =>
              `<option${f === i.fornecedor ? " selected" : ""}>${f}</option>`).join("")}</select></td>
        </tr>
        <tr class="linha-dias" data-k="${i.chave}"${i._diasAbertos ? "" : " hidden"}>
          <td colspan="${cab.length}">${blocoDias(i)}</td></tr>`).join("")}</tbody></table></div>
    </section>`;
  recalcular();
}

// Fornecedores da lista do item: os vinculados a ele em compras.json, ou todos
// quando o item não tem lista. O já escolhido num pedido salvo continua na
// lista mesmo fora do vínculo, para o pedido antigo não perder o fornecedor.
function fornecedoresDe(i) {
  const lista = (i.fornecedores && i.fornecedores.length) ? i.fornecedores.slice()
    : (PROJ.config.fornecedores || []).slice();
  if (i.fornecedor && !lista.includes(i.fornecedor)) lista.push(i.fornecedor);
  return lista;
}

// Célula de trânsito. No salmão vem com a libragem ao lado e, embaixo, quanto
// aquilo dá em equivalente 08/10 (preenchido no recalcular).
// Salmão a caminho: o pedido real (espelho do fornecedor) lançado no
// Recebimento de Salmão e ainda não conferido pela loja. Aparece como alerta
// no canto da tela (não mais na linha do salmão) — só para leitura: NÃO
// preenche o trânsito, não entra no disponível nem na duração. Quem decide digitar o trânsito é quem
// faz o pedido. Vale para pedidos de datas anteriores à desta projeção (o
// pedido de terça aparece na projeção seguinte) dos últimos 14 dias.
let A_CAMINHO = [];
async function carregarACaminho() {
  A_CAMINHO = [];
  try {
    const r = await fetch("/api/recebimentos?situacao=aguardando_recebimento", { cache: "no-store" });
    if (!r.ok) return;
    const ini = new Date(PROJ.data + "T12:00:00"); ini.setDate(ini.getDate() - 14);
    const desde = ini.toISOString().slice(0, 10);
    A_CAMINHO = ((await r.json()).recebimentos || [])
      .filter((x) => x.data < PROJ.data && x.data >= desde);
  } catch (e) { /* sem acesso ao recebimento: sem tag */ }
}

function tagACaminho(casa) {
  const lista = A_CAMINHO.filter((x) => x.casa === casa);
  if (!lista.length) return "";
  const libra = (cal) => {
    const d = String(cal || "").replace(/\D/g, "");
    return (PROJ.libragens || []).find((l) => String(l.nome || "").replace(/\D/g, "") === d && d);
  };
  return lista.map((x) => {
    const linhas = x.itens.filter((i) => i.real_kg != null).map((i) => {
      const l = libra(i.real_calibre);
      const px = i.real_peixes != null ? `${fmt(i.real_peixes, 0)} px${i.real_calibre ? " " + i.real_calibre : ""}` : "";
      const eq = l && i.real_peixes != null && l.fator !== 1 ? ` ≈ ${fmt(i.real_peixes * l.fator, 2)} eq. 08/10` : "";
      const nome = /file|filé/i.test(i.nome) ? "filé " : "";
      return `${nome}${fmt(i.real_kg, 3)} kg${px ? " · " + px : ""}${eq}`;
    });
    return `<a class="ac-item" href="recebimento.html?id=${encodeURIComponent(x.id)}"
      title="Pedido real lançado no Recebimento de Salmão, ainda não conferido pela loja.
Só informativo: não está no trânsito e não muda a duração do estoque.">
      <b>OC ${x.numero_oc ? "nº " + escapa(x.numero_oc) : "—"} de ${brDate(x.data).slice(0, 5)}${
        x.pedido_real && x.pedido_real.previsto ? " · chega " + brDate(x.pedido_real.previsto).slice(0, 5) : ""}</b>${linhas.map((l) => `<span>${l}</span>`).join("")}</a>`;
  }).join("");
}

// Alerta do canto: o salmão a caminho da casa aberta. Fechado, só volta ao
// recarregar a tela (cada casa tem o seu).
const CAMINHO_FECHADO = new Set();
function alertaACaminho() {
  let el = $("#alerta-caminho");
  if (!el) {
    el = document.createElement("aside");
    el.id = "alerta-caminho";
    el.className = "alerta-canto";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  const corpo = tagACaminho(CASA);
  if (!corpo || CAMINHO_FECHADO.has(CASA)) { el.hidden = true; el.innerHTML = ""; return; }
  const casa = PROJ.casas[CASA] || {};
  el.innerHTML = `<div class="ac-cab"><span class="ac-ponto" aria-hidden="true"></span>
      <strong>Salmão a caminho</strong><span class="ac-casa">${nomeLoja(CASA, casa.nome)}</span>
      <button type="button" class="ac-fechar" title="Fechar" aria-label="Fechar">×</button></div>${corpo}`;
  el.hidden = false;
  el.querySelector(".ac-fechar").onclick = () => { CAMINHO_FECHADO.add(CASA); el.hidden = true; };
}

function celTransito(i, campo, dica) {
  const input = `<input data-c="${campo}" type="text" inputmode="decimal" value="${i[campo] == null ? "" : fmt(i[campo], 3)}" title="${dica}"`;
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

// O que o calendário mostra em cada dia: o consumo (como sempre) ou o
// coeficiente de consumo — consumo ÷ faturamento do dia × 1.000, a régua do
// CDE. Só muda a leitura: o pedido continua saindo da média de consumo. A
// escolha é de quem lê, fica no navegador e vale para todos os itens.
const VER_KEY = "cde_projecao_calendario_v1";
let VER_DIAS = "consumo";
try { if (localStorage.getItem(VER_KEY) === "coef") VER_DIAS = "coef"; } catch (e) { /* sem storage */ }
const coefDia = (h) => h.fat > 0 ? h.uso / h.fat * 1000 : null;
// Faturamento do dia ao lado do consumo/coeficiente, curto para caber na
// linha do dia: R$ 18,8 mil. O valor inteiro fica na dica do mouse.
const fatCurto = (v) => v > 0 ? "R$ " + fmt(v / 1000, 1) + " mil" : "sem fat.";

function coefDosDias(ins, marcados) {
  let uso = 0, fat = 0, n = 0;
  (ins.historico || []).forEach((h) => {
    if (marcados.has(h.data) && h.fat > 0) { uso += h.uso; fat += h.fat; n++; }
  });
  return { coef: fat > 0 ? uso / fat * 1000 : null, n, fatMedio: n ? fat / n : null };
}

// Dia fora do padrão: a 2 desvios ou mais da média dos dias de comparação —
// a mesma régua do Painel (Atenção). O próprio dia fica fora da média e do
// desvio dele, senão um pico puxaria a régua para perto de si e se esconderia.
//   consumo     — comparado com os mesmos dias da semana do calendário: sábado
//                 consome mais que terça e isso não é anormal;
//   coeficiente — comparado com todos os dias com faturamento: ele já desconta
//                 o movimento do dia.
// Menos de 4 dias de comparação: pouco para chamar alguém de anormal. E item
// que quase não varia (salmão) passaria dos 2 desvios com 15% de diferença:
// só é "muito alto/baixo" a partir de 25% de distância da média.
const LIMITE_DESVIOS = 2, MIN_COMPARACAO = 4, MIN_VARIACAO = 0.25;
const DIAS_SEMANA = ["domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados"];
const diaSemana = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();

function foraDoPadrao(ins, modo) {
  const hist = (ins.historico || []).map((h) => ({ data: h.data,
    v: modo === "coef" ? coefDia(h) : h.uso })).filter((h) => h.v !== null);
  const fora = new Map();
  hist.forEach((h) => {
    const outros = hist.filter((o) => o.data !== h.data &&
      (modo === "coef" || diaSemana(o.data) === diaSemana(h.data))).map((o) => o.v);
    if (outros.length < MIN_COMPARACAO) return;
    const m = outros.reduce((a, b) => a + b, 0) / outros.length;
    const dp = Math.sqrt(outros.reduce((a, b) => a + (b - m) ** 2, 0) / outros.length);
    if (!dp || Math.abs(h.v - m) < LIMITE_DESVIOS * dp) return;
    if (Math.abs(h.v - m) < MIN_VARIACAO * Math.abs(m)) return;
    fora.set(h.data, { alto: h.v > m, media: m, n: outros.length,
      grupo: modo === "coef" ? "dias" : DIAS_SEMANA[diaSemana(h.data)] });
  });
  return fora;
}

function blocoDias(ins) {
  const hist = ins.historico || [];
  if (!hist.length) return `<p class="fonte">Sem consumo lançado nos últimos ${PROJ.historico_dias} dias.</p>`;
  const marcados = new Set(diasEscolhidos(ins));
  const janela = new Set(ins.dias_media_padrao || []);
  const m = mediaDe(ins);
  const coef = VER_DIAS === "coef";
  const c = coefDosDias(ins, marcados);
  // o equivalente de salmão sai fracionado (11,6 peixes): uma casa basta
  const dec = UN_INTEIRA.includes(ins.un) ? 1 : 2;
  const valorDia = (h) => {
    if (!coef) return `${fmt(h.uso, dec)} ${ins.un}`;
    const k = coefDia(h);
    return k === null ? "sem fat." : fmt(k, 3);
  };
  const fora = foraDoPadrao(ins, coef ? "coef" : "consumo");
  const dicaDia = (h) => {
    if (h.uso < 0) return "Consumo negativo: divergência de contagem em dia de recebimento. Marcado, ele rebaixa a média.";
    const f = fora.get(h.data);
    const alerta = f ? `Fora do padrão, muito ${f.alto ? "alto" : "baixo"}: ` +
      `${fmt(Math.abs((coef ? coefDia(h) : h.uso) / f.media - 1) * 100, 0)}% ${f.alto ? "acima" : "abaixo"} ` +
      `da média ${/^(segundas|terças|quartas|quintas|sextas)$/.test(f.grupo) ? "das outras" : "dos outros"} ${f.n} ${f.grupo} (${coef ? fmt(f.media, 3) + " por R$ 1.000" : fmt(f.media, dec) + " " + ins.un})` : "";
    if (!coef) {
      const fatTxt = h.fat > 0 ? `Faturamento do dia: R$ ${fmt(h.fat, 2)}` : "Sem faturamento lançado no dia";
      return alerta ? alerta + "&#10;" + fatTxt : fatTxt;
    }
    const conta = coefDia(h) === null ? `Consumo ${fmt(h.uso, dec)} ${ins.un} · sem faturamento lançado no dia`
      : `Consumo ${fmt(h.uso, dec)} ${ins.un} ÷ faturamento R$ ${fmt(h.fat, 2)} × 1.000 = ${fmt(coefDia(h), 3)} ${ins.un} por R$ 1.000`;
    return alerta ? alerta + "&#10;" + conta : conta;
  };
  return `<div class="dias-caixa">
    <div class="dias-topo">
      <div class="segmentado segmentado-mini" role="group" aria-label="O que cada dia mostra">
        <button type="button" class="dias-ver${coef ? "" : " ativo"}" data-ver="consumo">Consumo</button>
        <button type="button" class="dias-ver${coef ? " ativo" : ""}" data-ver="coef"
          title="Consumo do dia ÷ faturamento do dia × 1.000. Só para leitura: o pedido continua pela média de consumo">Coeficiente</button>
      </div>
      <span>Média de <strong>${m.n}</strong> dia(s): <strong>${fmt(m.media, 3)} ${ins.un}/dia</strong>
        ${coef ? `· coeficiente${c.n < m.n ? ` de ${c.n} dia(s) com faturamento` : ""}:
          <strong>${c.coef === null ? "sem faturamento" : fmt(c.coef, 3) + " " + ins.un + " por R$ 1.000"}</strong>` : ""}
        ${c.fatMedio ? `· faturamento médio: <strong>R$ ${fmt(c.fatMedio, 2)}/dia</strong>` : ""}
        ${periodoDe(ins) === "padrao" ? `<span class="selo-mini">últimos ${PROJ.janela_media_dias} dias</span>`
          : periodoDe(ins) ? `<span class="selo-mini">últimos ${PERIODO_ALTERNATIVO} dias</span>`
          : '<span class="selo-mini aviso">dias escolhidos</span>'}</span>
      <span style="flex:1"></span>
      <button type="button" class="botao-mini dias-acao" data-acao="padrao" data-k="${ins.chave}">Voltar aos últimos ${PROJ.janela_media_dias} dias</button>
      ${PROJ.janela_media_dias !== PERIODO_ALTERNATIVO ? `<button type="button" class="botao-mini dias-acao" data-acao="alt" data-k="${ins.chave}">Últimos ${PERIODO_ALTERNATIVO} dias</button>` : ""}
      <button type="button" class="botao-mini dias-acao" data-acao="nenhum" data-k="${ins.chave}">Desmarcar todos</button>
      <button type="button" class="botao-mini dias-acao" data-acao="outras-lojas" data-k="${ins.chave}"
        title="Usa estes mesmos dias em ${escapa(ins.nome)} nas outras casas">Usar estes dias no mesmo item das outras lojas</button>
    </div>
    <div class="dias-grade">
      ${DOW.slice(1).concat(DOW[0]).map((d) => `<div class="dia-cab">${d}</div>`).join("")}
      ${semanasDe(hist).map((dia) => {
        if (!dia) return '<div class="dia-vazio"></div>';
        const h = hist.find((x) => x.data === dia);
        if (!h) return `<div class="dia-vazio sem-uso" title="Sem consumo lançado"><span class="dia-data">${diaMes(dia)}</span></div>`;
        const dica = dicaDia(h);
        return `<label class="dia-chip${marcados.has(h.data) ? " marcado" : ""}${janela.has(h.data) ? " janela" : ""}${h.uso < 0 ? " neg" : ""}${
          coef && coefDia(h) === null ? " sem-fat" : ""}${fora.has(h.data) ? " fora" : ""}"${dica ? ` title="${dica}"` : ""}>
          <span class="dia-data">${diaMes(h.data)}</span>
          <span class="dia-uso">${valorDia(h)}</span>
          <span class="dia-fat">${fatCurto(h.fat)}</span>
          <input type="checkbox" data-dia="${h.data}" data-k="${ins.chave}"${marcados.has(h.data) ? " checked" : ""}>
        </label>`;
      }).join("")}</div>
    <p class="fonte dias-legenda"><span class="dia-fora-amostra">vermelho</span>: ${
      coef ? "coeficiente" : "consumo"} fora do padrão, muito alto ou muito baixo — a 2 desvios ou mais e 25% ou mais longe da média
      ${coef ? "dos outros dias" : "dos mesmos dias da semana"}. ${fora.size
        ? `${fora.size} dia(s) neste calendário; passe o mouse para ver de quanto.` : "Nenhum dia neste calendário."}</p>
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

// ------------------------------------------------------------------ tendência
// Curva do consumo nos dias que formam a média e se ele está subindo ou caindo.
// A comparação é entre a metade mais recente desses dias e a mais antiga: com
// 14 dias, os 7 últimos contra os 7 anteriores. Média estável esconde consumo
// que dobrou na última semana — e é isso que muda o pedido seguinte.
const LIMIAR_ESTAVEL = 0.05;        // até 5% para mais ou para menos: estável

function tendencia(ins) {
  const marcados = new Set(diasEscolhidos(ins));
  const pts = (ins.historico || []).filter((h) => marcados.has(h.data))
    .sort((a, b) => a.data.localeCompare(b.data));
  const metade = Math.floor(pts.length / 2);
  if (metade < 2) return { pts, variacao: null };
  const media = (l) => l.reduce((s, h) => s + h.uso, 0) / l.length;
  const antes = media(pts.slice(0, metade)), depois = media(pts.slice(-metade));
  return { pts, metade, antes, depois,
           variacao: antes > 0 ? (depois - antes) / antes : null };
}

function celTendencia(ins) {
  const t = tendencia(ins);
  if (t.pts.length < 2) return '<span class="fonte">—</span>';
  // consumo subindo é gasto a mais: vermelho, como no Painel; caindo, verde
  // metade antiga sem consumo e a recente com: subiu, sem percentual que caiba
  const doZero = t.variacao === null && t.metade >= 2 && t.depois > 0;
  const tom = doZero ? "ruim"
    : t.variacao === null || Math.abs(t.variacao) < LIMIAR_ESTAVEL ? "neutro"
    : t.variacao > 0 ? "ruim" : "bom";
  const texto = t.variacao === null
    ? (t.metade < 2 ? "Poucos dias" : doZero ? "Subiu" : "Sem consumo")
    : tom === "neutro" ? "Estável"
    : `${t.variacao > 0 ? "Subiu" : "Caiu"} ${fmt(Math.abs(t.variacao) * 100, 0)}%`;
  const dica = t.variacao === null && t.metade < 2
    ? "Menos de 4 dias na média: pouco para dizer se subiu ou caiu"
    : `Média dos ${t.metade} dias mais recentes: ${fmt(t.depois, 3)} ${ins.un}/dia · ` +
      `dos ${t.metade} anteriores: ${fmt(t.antes, 3)} ${ins.un}/dia`;
  return `<div class="tend-cel">${curvaConsumo(t.pts, ins.un, tom)}
    <span class="tend-txt ${tom}" title="${dica}">${texto}</span></div>`;
}

// Sparkline: uma série, sem eixo. Cada dia tem uma faixa de passar o mouse
// mais larga que o ponto, com a data e o consumo.
function curvaConsumo(pts, un, tom) {
  const W = 64, H = 26, P = 3;
  const vals = pts.map((h) => h.uso);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const linha = pts.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.uso).toFixed(1)}`).join(" ");
  const faixa = (W - 2 * P) / (pts.length - 1);
  const dec = UN_INTEIRA.includes(un) ? 1 : 2;
  const ult = pts.length - 1;
  return `<svg class="tend-curva ${tom}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Consumo de ${diaMes(pts[0].data)} a ${diaMes(pts[ult].data)}">
    <path d="${linha}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(ult).toFixed(1)}" cy="${y(pts[ult].uso).toFixed(1)}" r="2.5"/>
    ${pts.map((h, i) => `<rect x="${(x(i) - faixa / 2).toFixed(1)}" y="0" width="${faixa.toFixed(1)}" height="${H}"
        fill="transparent"><title>${diaMes(h.data)}: ${fmt(h.uso, dec)} ${un}</title></rect>`).join("")}
  </svg>`;
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
        ? `${fmt(q, Number.isInteger(q) ? 0 : 2)} px ${tam} = ${fmt(q * f, 3)} ${ins.un} eq. 08/10`
        : `1 px ${tam} = ${fmt(f, 3)} ${ins.un} eq. 08/10`;
    });
    tr.querySelector(".media").innerHTML = `${fmt(m.media, 3)}
      <button type="button" class="botao-mini abrir-dias${Array.isArray(ins.dias_media) ? " ajustado" : ""}"
        data-k="${ins.chave}" title="Escolher os dias que formam a média">${m.n} dia${m.n === 1 ? "" : "s"}</button>`;
    tr.querySelector(".tend").innerHTML = celTendencia(ins);
    const tdC = tr.querySelector(".cobrir");
    if (tdC) tdC.textContent = diasDe(ins.chave) + " d";
    const inC = tr.querySelector('[data-c="dias"]');
    if (inC) inC.placeholder = DIAS;
    const tdD = tr.querySelector(".dur"), tdP = tr.querySelector(".ped");
    tdD.textContent = r.duracao === Infinity ? "sem consumo" : fmt(r.duracao, 1) + " d";
    tdD.className = "calc dur" + (isFinite(r.duracao) && r.duracao < 3 ? " neg" : "");
    // Pedido mostra sempre o calculado; com ajuste, fica riscado e a coluna
    // Ajuste carrega o número que vai valer.
    const inA = tr.querySelector('[data-c="ajuste"]');
    if (inA) {
      if (document.activeElement !== inA) inA.value = txtManual(ins.qtd_manual);
      inA.classList.toggle("ajustada", r.ajustado);
      inA.nextElementSibling.textContent = r.un_pedido;
    }
    if (r.calculado <= 0.0005) {
      // quanto passa da projecao: estoque parado alem dos dias a cobrir
      const alem = r.consumoDia > 0 ? r.sobra / r.consumoDia : null;
      const txtSobra = r.sobra <= 0.0005 ? ""
        : r.consumoDia > 0
          ? `${fmt(r.sobra, 3)} ${ins.un} além dos ${fmt(r.dias, 0)} dias · cobre mais ${fmt(alem, 1)} d`
          : `${fmt(r.sobra, 3)} ${ins.un} em estoque, sem consumo na média`;
      tdP.innerHTML = '<span class="selo bom">Não pedir</span>' + (txtSobra
        ? `<span class="msg-conv msg-sobra" title="Estoque + trânsito − saída, menos a média/dia × fator × dias a cobrir">${txtSobra}</span>` : "");
    } else {
      tdP.innerHTML = `<strong${r.ajustado ? ' class="riscado" title="Calculado — vale o ajuste ao lado"' : ""}>${fmt(r.calculado, 3)}</strong>
        <span class="un">${r.un_pedido}</span>` +
        (ins.conversao && !r.ajustado ? `<span class="msg-conv">${fmt(r.qtd, 3)} ${ins.un} × ${fmt(r.conv, 3)} kg
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
  const blocos = lista.map((g) => {
    const itens = g.itens.slice().sort((a, b) =>
      a.nome.localeCompare(b.nome) || a.casa.localeCompare(b.casa));
    // as linhas primeiro: cada uma deixa o seu custo em i.custo para o total
    const linhas = itens.map((i) => linhaConsolidada(i, g.forn)).join("");
    return { g, itens, linhas, salmao: CONS_CASA ? [] : itens.filter((i) => i.chave === CHAVE_SALMAO) };
  });
  // Com várias fornecedoras de salmão no mesmo pedido, o total de cada bloco
  // não diz quanto peixe o grupo está comprando: uma linha geral no topo diz.
  const comSalmao = blocos.filter((b) => b.salmao.length);
  $("#consolidado").innerHTML = (comSalmao.length > 1
    ? `<p class="nota-info">${resumoSalmao(comSalmao.flatMap((b) => b.salmao), "Salmão em todas as ordens")}` +
      ` · ${comSalmao.length} fornecedores</p>` : "") +
    blocos.map(({ g, itens, linhas, salmao }) => {
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
        <tbody>${linhas}${salmao.length ? linhaTotalSalmao(salmao) : ""}</tbody>
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

// Total do salmão quando o consolidado mostra as quatro casas: a soma das
// ordens de compra de salmão do fornecedor, em quilos e em reais. Só o salmão
// ganha a linha — é o item de maior peso no pedido e o único comprado para o
// grupo inteiro numa negociação só.
function somaSalmao(itens) {
  const kg = itens.reduce((s, i) => s + i.qtd, 0);
  const comCusto = itens.filter((i) => i.custo !== null);
  const custo = comCusto.reduce((s, i) => s + i.custo, 0);
  return { kg, custo, casas: new Set(itens.map((i) => i.casa)).size,
           semPreco: itens.length - comCusto.length };
}

function resumoSalmao(itens, rotulo) {
  const t = somaSalmao(itens);
  return `<strong>${rotulo}:</strong> ${fmt(t.kg, 3)} kg · ` +
    (t.custo > 0 ? "R$ " + fmt(t.custo) : "sem preço") +
    (t.semPreco ? ` (${t.semPreco} linha(s) sem preço fora da soma)` : "");
}

function linhaTotalSalmao(itens) {
  const t = somaSalmao(itens);
  return `<tr class="linha-total">
      <td><strong>Total Salmão</strong></td>
      <td>${t.casas} casa(s)</td>
      <td class="calc"><strong>${fmt(t.kg, 3)}</strong></td>
      <td class="un">${itens[0].un}</td>
      <td>${t.semPreco ? `<span class="fonte">${t.semPreco} linha(s) sem preço fora da soma</span>` : ""}</td>
      <td class="calc"><strong>${t.custo > 0 ? "R$ " + fmt(t.custo) : "—"}</strong></td>
      <td></td>
    </tr>`;
}

// Uma linha do consolidado: quantidade, o produto do catálogo em que ela vira
// e o custo estimado por esse preço. Salmão ganha a linha extra de repartição.
function linhaConsolidada(i, forn) {
  const ins = insumoDa(i.casa, i.chave);
  const ops = opcoesCatalogo(i.chave, forn);
  const escolhido = produtoEscolhido(ins, ops);
  const colunas = CONS_CASA ? 6 : 7;
  // O catálogo vende em caixa, fardo, bisnaga; o pedido é na unidade do CDE.
  // Converte pelo conteúdo da embalagem (compras.json → embalagens), como a OC.
  // Sem arredondar: embalagem quebrada fica marcada e quem compra decide na OC.
  const emb = escolhido && escolhido.conteudo ? i.qtd / escolhido.conteudo : null;
  // O que a ordem do dia já decidiu vale para o custo: caixa arredondada, item
  // cortado, preço digitado, ou a ordem já gerada. Decisão de pendente só vale
  // enquanto o cálculo for o mesmo de quando ela foi tomada — como no servidor.
  const oc = (PROJ.na_oc || {})[`${i.casa}|${norm(forn).replace(/\s+/g, " ")}|${i.chave}`];
  const ocVale = !!oc && (oc.gerada || (oc.qtd_calc != null && emb !== null &&
    Math.abs(oc.qtd_calc - Math.round(emb * 1000) / 1000) <= 0.0005));
  const decidida = ocVale && (oc.gerada || Math.abs(oc.qtd - oc.qtd_calc) > 0.0005);
  const qtdFinal = ocVale ? oc.qtd : emb;
  const precoFinal = ocVale && oc.preco > 0 ? oc.preco : (escolhido ? escolhido.preco : 0);
  const unFinal = ocVale ? oc.un : (escolhido ? escolhido.un : "");
  // vermelho enquanto a quantidade que vai para a OC não fecha embalagem inteira
  const fechada = !!escolhido && !escolhido.fraciona;
  const quebrada = fechada && qtdFinal !== null && Math.abs(qtdFinal - Math.round(qtdFinal)) > 0.0005;
  const custo = qtdFinal !== null ? qtdFinal * precoFinal : 0;
  i.custo = qtdFinal !== null && precoFinal > 0 ? custo : null;   // para o total do salmão
  const ehSalmao = i.chave === CHAVE_SALMAO && partesSalmao().length;
  const repartido = ehSalmao ? equivalenteDoSplit(ins) : 0;

  const seletor = ops.length
    ? `<select class="prod-oc" data-casa="${i.casa}" data-k="${i.chave}">${ops.map((p) =>
        `<option value="${escapa(p.produto)}"${escolhido && norm(p.produto) === norm(escolhido.produto)
          ? " selected" : ""}>${escapa(p.produto)}${p.preco > 0 ? " — R$ " + fmt(p.preco) : " — sem preço"}</option>`).join("")}</select>`
    : `<span class="fonte" title="Sem produto vinculado para este fornecedor">Sem vínculo —
        <a href="cadastros.html">cadastre o produto</a></span>`;

  return `<tr${quebrada ? ' class="embalagem-quebrada"' : ""}>
      <td>${i.nome}${ehSalmao
        ? ` <button class="botao-mini abrir-partes" data-casa="${i.casa}" title="Pedir em filé em vez de peixe inteiro">Repartir</button>` : ""}</td>
      ${CONS_CASA ? "" : `<td>${i.casa}</td>`}
      <td><input class="qtd-resumo${i.ajustado ? " ajustada" : ""}" type="text"
             inputmode="decimal" data-casa="${i.casa}" data-k="${i.chave}"
             data-calc="${i.calculado}" value="${fmt(i.qtd, 3)}"
             title="${i.ajustado ? "Ajustado à mão — o cálculo dava " + fmt(i.calculado, 3) : "Quantidade projetada pelo cálculo"}"></td>
      <td class="un">${i.un}</td>
      <td>${seletor}${decidida
          ? `<span class="msg-conv">${oc.gerada ? `OC ${escapa(oc.numero_oc || "")} gerada` : "Na OC"}: ` +
            `${fmt(oc.qtd, Number.isInteger(oc.qtd) ? 0 : 3)} × ${escapa(oc.un)}` +
            `${quebrada ? " — embalagem quebrada, decida na OC" : ""}</span>`
        : !escolhido ? ""
        : emb === null
          ? `<span class="msg-conv" title="Defina em compras.json → embalagens quanto vem nesta unidade">Sem conversão para ${escapa(escolhido.un)}</span>`
          // o que vai para a OC na unidade do fornecedor: "Projetado: 3 × CAIXA C/10 KG"
          : `<span class="msg-conv">Projetado: ${escolhido.fraciona
              ? `${fmt(emb, 3)} ${escapa(escolhido.un)}`
              : `${fmt(emb, quebrada ? 3 : 0)} × ${escapa(escolhido.un)}`}` +
            `${quebrada ? " — embalagem quebrada, decida na OC" : ""}</span>`}</td>
      <td class="calc">${qtdFinal !== null && precoFinal > 0 ? "R$ " + fmt(custo) : "—"}</td>
      <td class="calc">${[
          // o que o cálculo deu, quando a OC ficou com outro número
          decidida && emb !== null && Math.abs(emb - oc.qtd) > 0.0005
            ? `<span class="selo-mini" title="Quantidade calculada pela Projeção, antes da decisão na OC">${fmt(emb, 3)} ${escapa(unFinal)} calc.</span>` : "",
          i.ajustado
            ? `<span class="selo-mini" title="Quantidade alterada à mão">${fmt(i.calculado, 3)} ${i.un} calc.</span>` : "",
        ].filter(Boolean).join(" ") || "—"}</td>
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
        <div class="fonte">Necessidade projetada: <strong>${fmt(i.qtd, 3)} kg</strong> de peixe inteiro.
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
      marcarSujo();
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
      marcarSujo();
      consolidar();
    };
  });
}

// Mexer na quantidade projetada é uma decisão, não um deslize de teclado:
// pede confirmação mostrando de quanto para quanto, e desfaz se cancelar.
function confirmarQtd(el) {
  const novo = num(el.value), antes = num(el.dataset.antes);
  const calc = num(el.dataset.calc);
  if (Math.abs(novo - antes) < 0.0005) { el.value = fmt(antes, 3); return; }

  const ins = PROJ.casas[el.dataset.casa].insumos.find((i) => i.chave === el.dataset.k);
  const dif = calc > 0 ? ((novo - calc) / calc) * 100 : 0;
  const msg = `Alterar a quantidade de ${ins.nome} (${el.dataset.casa})?

` +
    `De ${fmt(antes, 3)} para ${fmt(novo, 3)}
` +
    `O cálculo projetou ${fmt(calc, 3)}` +
    (calc > 0 ? ` — a alteração fica ${dif > 0 ? "+" : ""}${fmt(dif, 1)}% em relação ao projetado.` : ".");
  if (!confirm(msg)) { el.value = fmt(antes, 3); return; }

  // guardado no insumo: vale para a ordem de compra e sobrevive ao recálculo
  ins.qtd_manual = novo;
  marcarSujo();
  recalcular();
}

// Leva para a tela de Ordens de Compras já na ordem deste fornecedor. Salva
// antes, senão a ordem ainda não existe do outro lado.
async function editarOC(forn) {
  await salvarAgora();
  if (sujo) return;                          // salvar falhou: não navega
  window.location = "ordens.html?f=" + encodeURIComponent(forn);
}

// ------------------------------------------------------------------ salvar
// Não há botão: toda alteração grava sozinha, um instante depois da última
// tecla, para não mandar um pedido ao servidor a cada dígito. Gravação que
// chega com outra em andamento espera a vez e sai em seguida com o estado
// novo; a versão diz se algo mudou enquanto a anterior estava no ar.
const ESPERA_SALVAR = 800;
let _tSalvar = null, _salvando = null, _deNovo = false, _versao = 0;

function agendarSalvar() {
  clearTimeout(_tSalvar);
  _tSalvar = setTimeout(salvar, ESPERA_SALVAR);
}

// Grava já o que estiver pendente — antes de trocar de data, abrir a ordem
// ou sair da tela.
async function salvarAgora() {
  clearTimeout(_tSalvar);
  // a gravação no ar pode ter levado o estado velho e emendar outra: espera
  // a fila inteira antes de ver se ainda falta algo
  while (_salvando) await _salvando;
  if (sujo) await salvar();
}

function salvar() {
  if (_salvando) { _deNovo = true; return _salvando; }
  _salvando = gravar().finally(() => {
    _salvando = null;
    if (_deNovo) { _deNovo = false; salvar(); }
  });
  return _salvando;
}

async function gravar() {
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

  const versao = _versao;
  estado("Salvando…");
  try {
    const r = await (await fetch("/api/pedido", { method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
    if (!r.ok) throw new Error(r.erro || "erro no servidor");
    if (versao === _versao) { sujo = false; estado("Salvo " + horaAgora(), "ok"); }
  } catch (e) {
    // fica sujo: a próxima alteração tenta de novo, e sair da tela ainda avisa
    estado("Não salvo", "erro");
    aviso("Não consegui salvar o pedido: " + e.message, "mau");
  }
}

const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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

function marcarSujo() { sujo = true; _versao++; estado("Salvando…"); agendarSalvar(); }

// Eventos da tabela, ligados UMA vez: a tabela é redesenhada a cada troca de
// casa, e o contêiner fica.
function ligarTabela() {
  const tela = $("#tela");
  const insumo = (k) => PROJ.casas[CASA].insumos.find((i) => i.chave === k);
  tela.addEventListener("input", (e) => {
    if (!e.target.matches("input[data-c],select[data-c]")) return;
    if (e.target.dataset.c === "dias") {
      // Um número por item para as quatro casas: digitado em qualquer aba, fica
      // guardado na linha da SL, que é de onde o pedido inteiro lê.
      const ins = insumoDa(CASA_DIAS, e.target.closest("tr").dataset.k);
      const v = e.target.value.trim();
      if (ins) ins.dias_item = v === "" ? null : Math.min(60, Math.max(1, num(v) || 1));
    }
    if (e.target.dataset.c === "ajuste") {
      const ins = insumo(e.target.closest("tr").dataset.k);
      const v = e.target.value.trim();
      ins.qtd_manual = v === "" ? null : Math.max(0, num(v));
    }
    marcarSujo(); recalcular();
  });
  tela.addEventListener("change", (e) => {
    // Fornecedor escolhido na SL vale para as outras casas, como os dias a cobrir;
    // cada casa ainda pode trocar o seu depois.
    if (e.target.dataset.c === "fornecedor" && CASA === CASA_DIAS) {
      const k = e.target.closest("tr").dataset.k;
      Object.values(PROJ.casas).forEach((casa) => {
        const ins = casa.insumos.find((i) => i.chave === k);
        if (ins) ins.fornecedor = e.target.value || null;
      });
    }
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
    // Consumo / Coeficiente: só a leitura muda, nada fica sujo para salvar.
    const ver = e.target.closest(".dias-ver");
    if (ver) {
      VER_DIAS = ver.dataset.ver;
      try { localStorage.setItem(VER_KEY, VER_DIAS); } catch (er) { /* sem storage */ }
      PROJ.casas[CASA].insumos.filter((i) => i._diasAbertos).forEach(redesenharDias);
      return;
    }
    const b = e.target.closest(".dias-acao");
    if (!b) return;
    const ins = insumo(b.dataset.k);
    if (b.dataset.acao === "padrao") ins.dias_media = null;
    else if (b.dataset.acao === "nenhum") ins.dias_media = [];
    else if (b.dataset.acao === "alt") ins.dias_media = diasDaJanela(ins, PERIODO_ALTERNATIVO);
    else if (b.dataset.acao === "outras-lojas") {
      // Os mesmos dias de calendário no mesmo item das outras casas: o dia que
      // distorceu o consumo (evento, falta, feriado) costuma valer para a rede.
      // Dia sem consumo lançado numa casa simplesmente não conta nela.
      const padrao = !Array.isArray(ins.dias_media);
      const dias = diasEscolhidos(ins).slice();
      guardarLinhas();
      let n = 0;
      Object.entries(PROJ.casas).forEach(([ck, outra]) => {
        if (ck === CASA) return;
        const o = outra.insumos.find((x) => x.chave === ins.chave);
        if (o) { o.dias_media = padrao ? null : dias.slice(); n++; }
      });
      aviso(`Dias de ${ins.nome} aplicados em ${n} outra(s) loja(s).`, "bom");
      marcarSujo(); desenhar(); return;
    }
    marcarSujo(); redesenharDias(ins); recalcular(); sincronizarPeriodo();
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
  // Período da média para o pedido inteiro: todos os itens de todas as casas.
  $("#periodo-media").onchange = () => {
    const v = $("#periodo-media").value;
    guardarLinhas();
    Object.values(PROJ.casas).forEach((c) => c.insumos.forEach((ins) => {
      ins.dias_media = v === "padrao" ? null : diasDaJanela(ins, Number(v));
    }));
    aviso(v === "padrao" ? `Média dos últimos ${PROJ.janela_media_dias} dias em todos os itens.`
      : `Média dos últimos ${v} dias em todos os itens de todas as casas.`, "bom");
    marcarSujo(); desenhar();
  };
  $("#dias").onchange = () => {
    DIAS = num($("#dias").value) || 7;
    marcarSujo(); recalcular();
  };
  // Voltando da tela de Ordens pelo Voltar do navegador, a página vem do cache:
  // recarrega para o custo trazer o que foi decidido na OC.
  window.addEventListener("pageshow", (e) => { if (e.persisted) carregar(); });
  $("#responsavel").onchange = () => {
    PROJ.casas[CASA].responsavel = $("#responsavel").value || null;
    marcarSujo();
  };
  // Saindo com gravação pendente: dispara já (keepalive leva a requisição
  // mesmo com a página fechando) e ainda pede confirmação, porque não dá para
  // saber aqui se ela chegou.
  window.addEventListener("beforeunload", (e) => {
    if (!sujo) return;
    salvarAgora();
    e.preventDefault();
  });
  carregar();
})();
