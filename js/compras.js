// ============================================================================
// Projeção de Compras — o modelo do PCPOE, sem os vínculos externos.
//
//   Duração do estoque = (estoque + trânsito) ÷ (média diária × fator)
//   Dias a cobrir      = dias desejados − duração atual
//   Pedido             = dias a cobrir × média diária × fator
//
// O salmão é medido em peixes e pedido em quilos: a conversão (30 kg por caixa
// ÷ 7 peixes por caixa) vive em dados/compras.json, à vista de quem precisar ajustar.
// ============================================================================
let PROJ = null, CASA = "SL", sujo = false;
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
    PROJ = await (await fetch(`/api/projecao?data=${$("#data").value}&dias=${$("#dias").value || 7}`)).json();
  } catch (e) {
    $("#tela").innerHTML = '<p class="vazio">Servidor fora do ar. Rode o Servidor.bat.</p>';
    return;
  }
  sujo = false; estado("");
  const cfg = PROJ.config;
  $("#janela-txt").textContent =
    `Média diária dos últimos ${PROJ.janela_media_dias} dias · estoque do último lançamento`;
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
    b.onclick = () => { CASA = b.dataset.c; desenharAbas(); desenhar(); };
  });
}

// ------------------------------------------------------------------ cálculo
function calcular(ins, campos) {
  const media = ins.media_diaria, fator = num(campos.fator) || 1;
  const disponivel = ins.estoque + num(campos.transito);
  const consumoDia = media * fator;
  const duracao = consumoDia > 0 ? disponivel / consumoDia : (disponivel > 0 ? Infinity : 0);
  const cobrir = Math.max(0, num(campos.dias_cobrir) - (isFinite(duracao) ? duracao : 0));
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

function desenhar() {
  const casa = PROJ.casas[CASA];
  const cab = ["Insumo", "Estoque", "Trânsito", "Média/dia", "Fator", "Duração",
               "Dias a cobrir", "Pedido", "Fornecedor"];
  $("#tela").innerHTML =
    `<section class="cartao">
      <div class="cabeca"><h2>${casa.nome}</h2>
        <span class="fonte">Estoque do último lançamento de cada item</span></div>
      <div class="rolagem"><table><thead><tr>${cab.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${casa.insumos.map((i) => `
        <tr data-k="${i.chave}">
          <td>${i.nome} <span class="un">(${i.un})</span></td>
          <td class="calc" title="lançado em ${brDate(i.estoque_de)}">${fmt(i.estoque, 3)}</td>
          <td><input data-c="transito" type="text" inputmode="decimal" value="${i.transito ?? ""}"></td>
          <td class="calc" title="${i.dias_com_uso} dia(s) com consumo na janela">${fmt(i.media_diaria, 3)}</td>
          <td><input data-c="fator" type="text" inputmode="decimal" value="${i.fator ?? 1}" style="width:64px"></td>
          <td class="calc dur"></td>
          <td><input data-c="dias_cobrir" type="text" inputmode="decimal" value="${i.dias_cobrir ?? ""}" style="width:74px"></td>
          <td class="calc ped"></td>
          <td><select data-c="fornecedor"><option value="">Selecione</option>${
            (PROJ.config.fornecedores || []).map((f) =>
              `<option${f === i.fornecedor ? " selected" : ""}>${f}</option>`).join("")}</select></td>
        </tr>`).join("")}</tbody></table></div>
    </section>`;
  $("#tela").addEventListener("input", (e) => {
    if (!e.target.matches("input,select")) return;
    sujo = true; estado("Não salvo", "erro"); recalcular();
  });
  $("#tela").addEventListener("change", (e) => {
    if (e.target.matches("select")) { sujo = true; estado("Não salvo", "erro"); consolidar(); }
  });
  recalcular();
}

function lerLinha(tr) {
  const v = (c) => { const el = tr.querySelector(`[data-c="${c}"]`); return el ? el.value : ""; };
  return { transito: v("transito"), fator: v("fator"),
           dias_cobrir: v("dias_cobrir"), fornecedor: v("fornecedor") };
}

function recalcular() {
  const casa = PROJ.casas[CASA];
  document.querySelectorAll("#tela tbody tr").forEach((tr) => {
    const ins = casa.insumos.find((i) => i.chave === tr.dataset.k);
    const r = calcular(ins, lerLinha(tr));
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
        transito: ins.transito, fator: ins.fator,
        dias_cobrir: ins.dias_cobrir, fornecedor: ins.fornecedor };
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
  document.querySelectorAll("#tela tbody tr").forEach((tr) => {
    const ins = PROJ.casas[CASA].insumos.find((i) => i.chave === tr.dataset.k);
    const c = lerLinha(tr);
    ins.transito = c.transito === "" ? null : num(c.transito);
    ins.fator = num(c.fator) || 1;
    ins.dias_cobrir = c.dias_cobrir === "" ? null : num(c.dias_cobrir);
    ins.fornecedor = c.fornecedor || null;
  });
  PROJ.casas[CASA].responsavel = $("#responsavel").value || null;

  const corpo = { data: PROJ.data, casas: {} };
  Object.entries(PROJ.casas).forEach(([ck, casa]) => {
    const insumos = {};
    casa.insumos.forEach((i) => {
      insumos[i.chave] = { transito: i.transito, fator: i.fator,
                           dias_cobrir: i.dias_cobrir, fornecedor: i.fornecedor,
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

// ------------------------------------------------------------------ início
(async function iniciar() {
  $("#data").value = hoje();
  const cfg = await (await fetch("/api/projecao?data=" + hoje())).json().catch(() => null);
  $("#dias").value = (cfg && cfg.config && cfg.config.dias_a_cobrir_padrao) || 7;
  $("#data").onchange = carregar;
  $("#dias").onchange = carregar;
  $("#btn-salvar").onclick = salvar;
  window.addEventListener("beforeunload", (e) => { if (sujo) e.preventDefault(); });
  carregar();
})();
