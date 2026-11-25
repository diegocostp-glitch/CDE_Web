// ============================================================================
// Conferência — Contagem diária e Contagem semanal.
//
// O desenho é o do Lançamento Diário (index.html / app.js): mesma largura,
// abas com o número do que falta contar, um cartão por casa com os campos do
// dia no cabeçalho e a mesma tabela (tabela-lancamento). Quem já lança o dia
// reconhece a tela sem aprender nada. As colunas seguem as fichas de papel
// (Ideias/Templates), para quem digita copiar a ficha na mesma ordem:
//   diária  — final anterior, inicial, entrada, saída, desperdício + motivo,
//             final contado e uso; mais o filetamento do salmão e o processamento.
//   semanal — contagem anterior, quantidade contada, diferença e observação.
// A diária grava pela data; a semanal pela segunda-feira da semana (o servidor
// faz essa conta). A ficha de RASCUNHO é só de bancada: sai da diária.
//
// Item com embalagem (arroz em pacote de 5 kg, nori em pacote de 50 fl): a
// contagem é digitada em EMBALAGENS, como na ficha, e gravada já convertida
// para a unidade do item. Em branco é "não anotado"; zero é zero.
// ============================================================================
const SEMANAL = TIPO_CONTAGEM === "semanal";

let DADOS = null;          // resposta do /api/contagem
let CASA = null;           // casa da aba aberta
let SUJO = false;          // há anotação digitada e não salva

// "Hoje" no fuso da loja: o toISOString daria o dia seguinte depois das 21h.
const isoLocal = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
  "-" + String(d.getDate()).padStart(2, "0");
const hoje = () => isoLocal(new Date());
const somarDias = (iso, n) => {
  const [a, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(a, m - 1, d + n));
};
// Três casas sempre, como no Lançamento: a coluna lê de cima a baixo igual.
const tres = (n) => n == null ? "" : Number(n).toLocaleString("pt-BR",
  { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const vazio = (v) => String(v == null ? "" : v).trim() === "";
const lerNum = (el) => !el || vazio(el.value) ? null : num(el.value);
const r3 = (n) => Math.round(n * 1000) / 1000;
const diaMes = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—";

const itensDaTela = () => itensDaCasa(DADOS.itens, CASA);
const registro = () => (DADOS.registros || {})[CASA] || {};
const anterior = () => DADOS.anteriores[CASA];
const campoContado = SEMANAL ? "qtd" : "fin";
const itemPorId = (id) => DADOS.itens.find((i) => i.id === id);
// Contagem anterior de um item, na unidade dele (final na diária, qtd na semanal).
const contadoAntes = (id) => {
  const a = anterior();
  const v = a && a.itens[id];
  return v ? v[campoContado] ?? null : null;
};

// ------------------------------------------------------------------ carga
async function carregar(data) {
  if (SUJO && !confirm("Há anotação digitada que não foi salva. Sair mesmo assim?")) {
    $("#data").value = DADOS ? DADOS.data : data;
    return;
  }
  estado("Carregando…");
  try {
    const r = await (await fetch("/api/contagem?tipo=" + TIPO_CONTAGEM +
      "&data=" + encodeURIComponent(data), { cache: "no-store" })).json();
    if (r.ok === false) throw new Error(r.erro);
    DADOS = r;
    SUJO = false;
    if (!CASA || !r.casas.some((c) => c.chave === CASA)) CASA = r.casas[0].chave;
    $("#data").value = SEMANAL ? data : r.data;
    estado("");
    desenhar();
    desenharEditor();
  } catch (e) {
    estado("Falha ao carregar", "erro");
    aviso("Não consegui ler a contagem: " + e.message +
      " — se acabou de atualizar o sistema, o servidor precisa ser reiniciado.", "mau");
  }
}

// ------------------------------------------------------------------ abas
// Igual ao Lançamento: o número é o que FALTA contar naquela casa; casa fechada
// mostra o certo verde em vez de um espaço vazio.
function faltamNaCasa(ck) {
  const v = ((DADOS.registros || {})[ck] || {}).itens || {};
  return itensDaCasa(DADOS.itens, ck).filter((i) => (v[i.id] || {})[campoContado] == null).length;
}

function desenharAbas() {
  const nav = $("#abas-casas");
  nav.innerHTML = "";
  DADOS.casas.forEach((c) => {
    const b = document.createElement("button");
    const total = itensDaCasa(DADOS.itens, c.chave).length;
    const faltam = total ? faltamNaCasa(c.chave) : 0;
    b.innerHTML = esc(c.chave) + (!total ? ""
      : faltam ? ' <span class="pend" title="itens sem contagem">' + faltam + "</span>"
      : ' <span class="pend feito" title="contagem completa">✓</span>');
    b.title = c.nome + (!total ? "" : faltam
      ? ` — faltam ${faltam} de ${total} itens sem contagem`
      : ` — contagem completa, ${total} itens contados`);
    b.className = c.chave === CASA ? "ativa" : "";
    b.onclick = () => {
      if (c.chave === CASA) return;
      if (SUJO && !confirm("Há anotação digitada que não foi salva nesta casa. Trocar mesmo assim?")) return;
      SUJO = false;
      CASA = c.chave;
      desenhar();
    };
    nav.appendChild(b);
  });
}

// ------------------------------------------------------------------ desenhar
// Folhas da contagem diária (ver contagem-comum.js). A semanal tem uma só.
// As duas ficam desenhadas o tempo todo e só a aberta aparece: o Salvar lê a
// tela inteira, então trocar de folha não perde o que foi digitado na outra.
const FOLHAS = [
  ["itens", "Conferência de itens"],
  ["salmao", "Filetamento e processamento"],
];
let FOLHA = "itens";

function tabelaDeItens(itens) {
  const ncol = SEMANAL ? 5 : 10;
  // Subproduto recuado embaixo do primário (ver linhasDaLista, contagem-comum.js).
  const linhas = linhasDaLista(itens).map((l) =>
    l.tipo === "grupo" ? `<tr class="grupo"><td colspan="${ncol}">${esc(l.nome || "Sem grupo")}</td></tr>`
    : l.tipo === "pai" ? `<tr class="pai"><td colspan="${ncol}">${esc(l.nome)}</td></tr>`
    : SEMANAL ? linhaSemanal(l.item, l) : linhaDiaria(l.item, l)).join("");
  const ant = anterior();
  const dataAnt = ant ? diaMes(ant.data) : "—";
  const thead = SEMANAL
    ? `<th>Item</th><th>${dataAnt}<br><span class="un">contagem anterior</span></th>
       <th>Quantidade<br><span class="un">contada</span></th><th>Diferença</th>
       <th class="col-texto">Observação</th>`
    : `<th>Insumo</th><th>${dataAnt}<br><span class="un">final anterior</span></th>
       <th>Inicial<br><span class="un">contagem</span></th><th>Entrada<br><span class="un">NF e transferência</span></th>
       <th>Entrada<br><span class="un">processamento</span></th>
       <th>Saída<br><span class="un">transferência</span></th><th>Desperdício</th>
       <th class="col-texto">Motivo</th><th>Final<br><span class="un">contagem</span></th><th>Uso do dia</th>`;
  return `<div class="rolagem"><table class="tabela-lancamento tabela-contagem">
    <thead><tr>${thead}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

const listaVazia = () => `<p class="vazio">A lista da ${SEMANAL ? "contagem semanal" : "contagem diária"} ainda não tem
  itens${DADOS.itens.length ? " para esta casa" : ""}. Abra <strong>Itens da lista</strong>, logo abaixo,
  e cadastre — ou cole a lista do Excel.</p>`;

function mostrarFolha() {
  $$("#painel [data-folha]").forEach((el) => { el.hidden = el.dataset.folha !== FOLHA; });
  $$("#abas-folhas button").forEach((b) => b.classList.toggle("ativa", b.dataset.f === FOLHA));
}

// Quantos itens da folha ainda estão sem contagem, lido da tela.
function faltamNaFolha(f) {
  return $$(`#painel [data-folha="${f}"] tbody tr[data-id]`)
    .filter((tr) => lerLinha(tr)[campoContado] == null).length;
}

function desenharAbasFolhas() {
  const nav = $("#abas-folhas");
  if (!nav) return;
  nav.innerHTML = FOLHAS.map(([f, rot]) => {
    const tem = $(`#painel [data-folha="${f}"] tbody tr[data-id]`);
    const faltam = tem ? faltamNaFolha(f) : 0;
    return `<button type="button" data-f="${f}" class="${f === FOLHA ? "ativa" : ""}">${esc(rot)}${!tem ? ""
      : faltam ? ` <span class="pend" title="itens sem contagem">${faltam}</span>`
      : ' <span class="pend feito" title="folha completa">✓</span>'}</button>`;
  }).join("");
  $$("#abas-folhas button").forEach((b) => {
    b.onclick = () => { FOLHA = b.dataset.f; mostrarFolha(); };
  });
}

function desenhar() {
  desenharAbas();
  const casa = DADOS.casas.find((c) => c.chave === CASA);
  const r = registro();
  const ant = anterior();
  const itens = itensDaTela();

  // Cartão da casa: nome à esquerda e os campos do cabeçalho da ficha à
  // direita, no lugar onde o Lançamento põe o faturamento.
  const cab = `<div class="cabeca"><h2>${esc(casa.nome)}</h2>
      <div class="fat">
        <label><span>Responsável</span>
          <input id="resp" type="text" class="contagem-resp" value="${esc(r.resp || "")}"></label>
        ${SEMANAL ? "" : `<label><span>Faturamento do dia (R$)</span>
          <input id="fat" class="dinheiro" type="text" inputmode="decimal"
            value="${r.fat != null ? fmt(r.fat) : ""}"></label>`}
      </div></div>
    <p class="fonte">${SEMANAL
      ? "Anote só o que está no estoque agora. Item com embalagem: conte as embalagens fechadas — o sistema converte para a unidade."
      : "Conte no fechamento. O inicial vazio vale o final da contagem anterior. Item com embalagem: o final vai em embalagens, o sistema converte. Desperdício sempre com o motivo."}
      ${SEMANAL ? ` Semana de ${brDate(DADOS.data)} (segunda) a ${brDate(DADOS.fim)} (domingo).` : ""}
      ${ant ? "" : " Ainda não há contagem anterior desta casa."}</p>`;

  let corpo;
  if (SEMANAL) {
    corpo = itens.length ? tabelaDeItens(itens) : listaVazia();
  } else {
    corpo = `<nav class="abas abas-folhas" id="abas-folhas"></nav>
      <div data-folha="itens">${itens.length ? tabelaDeItens(itens) : listaVazia()}</div>
      <div data-folha="salmao">${blocoFiletamento()}${blocoProcessamento()}</div>`;
  }

  const obs = `<section class="cartao cartao-processamento">
      <div class="cabeca"><h2>Observações</h2></div>
      <textarea id="obs" rows="3" class="campo-obs" placeholder="o que a ficha trouxe escrito em observações">${esc(r.obs || "")}</textarea>
    </section>`;

  $("#painel").innerHTML = `<section class="cartao cartao-lancamento">${cab}${corpo}</section>${obs}`;
  $$("#painel tbody tr[data-id]").forEach(atualizarLinha);
  if (!SEMANAL) {
    somarFiletamento();
    $$("#painel tr[data-proc]").forEach(rendimento);
    desenharAbasFolhas();
    mostrarFolha();
  }
}

// Nome do item como no Lançamento — nome e "(kg)" — com a nota da lista como
// comentário em cinza, logo abaixo ("Pacote, limpo e esticado"), e a
// embalagem em selo pequeno.
// Todo item que não é subproduto vai em negrito; o subproduto, recuado e normal.
const classeLinha = (l) => l.filho ? "filho" : "primario";
// Nome do item + o campo de apoio da loja, quando o item tem um (camarão espeto: nº no espeto;
// salmão inteiro em peixe: tamanho). Só na diária; o valor volta do registro salvo.
function nomeDoItem(i, l = {}) {
  const base = nomeDoItemBase(i, l), x = SEMANAL ? null : EXTRAS_DIARIA[i.id];
  if (!x) return base;
  const v = ((registro().itens || {})[i.id] || {})[x.c];
  const val = v == null ? "" : x.num ? String(v).replace(".", ",") : v;
  const campo = `<input data-c="${x.c}" type="text"${x.num ? ' inputmode="numeric"' : ""} class="extra-mini${x.num ? "" : " texto"}"
    value="${esc(val)}" placeholder="${esc(x.rotulo)}" title="${esc(x.titulo)}" aria-label="${esc(x.titulo)}" maxlength="${x.num ? 6 : 12}">`;
  return base + campo;
}
// Código do ERP antes do nome: liga a linha ao produto do estoque. Subproduto não tem.
const nomeDoItemBase = (i, l = {}) =>`<span class="cod"${i.codigo ? ' title="Código do produto no ERP"' : ""}>${esc(i.codigo || "")}</span>` + `${esc(l.filho ? nomeNoPai(i) : i.nome)} <span class="un">(${esc(i.un || "—")})</span>` +
  (i.nota ? ` <span class="comentario">${esc(i.nota)}</span>` : "") +
  (i.emb ? ` <span class="selo-mini" title="A contagem vai em ${esc(i.emb)}; o sistema converte">${esc(comoContar(i))}</span>` : "");

const campoNum = (i, c, valor, placeholder = "") => `<td><input data-c="${c}" type="text"
  inputmode="decimal" value="${tres(valor)}" placeholder="${esc(placeholder)}"></td>`;

// Final (diária) ou quantidade (semanal): em embalagens quando o item tem.
function campoContagem(i, valorUn) {
  const emb = i.emb && i.fator;
  const v = valorUn == null ? null : emb ? valorUn / i.fator : valorUn;
  return `<td><input data-c="${campoContado}" type="text" inputmode="decimal" value="${tres(v)}"
    placeholder="${emb ? esc(i.emb) : ""}"${emb ? ` title="Em ${esc(i.emb)} — 1 = ${numBR(i.fator)} ${esc(i.un)}"` : ""}>
    ${emb ? '<span class="conv"></span>' : ""}</td>`;
}

function linhaDiaria(i, l = {}) {
  const v = (registro().itens || {})[i.id] || {};
  const antes = contadoAntes(i.id);
  return `<tr data-id="${esc(i.id)}" class="${classeLinha(l)}" title="${l.filho ? esc(i.nome) : ""}"><td>${nomeDoItem(i, l)}</td>
    <td class="calc ontem">${antes == null ? "—" : tres(antes)}</td>
    ${campoNum(i, "ini", v.ini, antes == null ? "" : tres(antes))}
    ${campoNum(i, "ent", v.ent)}<td class="calc entp"${ENTRADA_PROC.some((x) => x[0] === i.id)
      ? ' title="Vem sozinha do filetamento e do processamento, na outra folha"' : ""}></td>${campoNum(i, "sai", v.sai)}${campoNum(i, "desp", v.desp)}
    <td class="col-texto"><input data-c="mot" type="text" class="texto" value="${esc(v.mot || "")}"></td>
    ${campoContagem(i, v.fin)}
    <td class="calc uso"></td></tr>`;
}

function linhaSemanal(i, l = {}) {
  const v = (registro().itens || {})[i.id] || {};
  const antes = contadoAntes(i.id);
  return `<tr data-id="${esc(i.id)}" class="${classeLinha(l)}" title="${l.filho ? esc(i.nome) : ""}"><td>${nomeDoItem(i, l)}</td>
    <td class="calc ontem">${antes == null ? "—" : tres(antes)}</td>
    ${campoContagem(i, v.qtd)}
    <td class="calc dif"></td>
    <td class="col-texto"><input data-c="obs" type="text" class="texto" value="${esc(v.obs || "")}"></td></tr>`;
}

// ------------------------------------------------------------------ contas da linha
// Lê uma linha como está na tela, já na unidade do item.
function lerLinha(tr) {
  const item = itemPorId(tr.dataset.id);
  const out = {};
  tr.querySelectorAll("input").forEach((el) => {
    const c = el.dataset.c;
    if (el.classList.contains("texto")) { if (!vazio(el.value)) out[c] = el.value.trim(); return; }
    let n = lerNum(el);
    if (n != null && c === campoContado && item.emb && item.fator) n = r3(n * item.fator);
    if (n != null) out[c] = n;
  });
  return out;
}

// Inicial vazio vale o final anterior, como no Lançamento.
const usoDaLinha = (id, v) => {
  const ini = v.ini ?? contadoAntes(id);
  return v.fin == null || ini == null ? null
    : r3(ini + (v.ent || 0) + (v.entp || 0) - (v.sai || 0) - (v.desp || 0) - v.fin);
};
// Filetamento e processamento como estão na tela agora (para a entrada de processamento).
const blocosDaTela = () => SEMANAL ? {} : {
  filetamento: lerBloco("#painel tr[data-filet]", "filet"),
  processamento: lerBloco("#painel tr[data-proc]", "proc"),
};

function atualizarLinha(tr) {
  const item = itemPorId(tr.dataset.id);
  const v = lerLinha(tr);
  tr.querySelectorAll("input:not(.texto)").forEach((el) => {
    el.classList.toggle("suspeito", !vazio(el.value) && num(el.value) < 0);
  });
  const conv = tr.querySelector(".conv");
  if (conv) conv.textContent = v[campoContado] == null ? "" : "= " + numBR(v[campoContado]) + " " + (item.un || "");
  if (SEMANAL) {
    const td = tr.querySelector(".dif"), a = contadoAntes(item.id);
    if (v.qtd == null || a == null) { td.textContent = "—"; td.className = "calc dif"; td.title = ""; return; }
    const d = r3(v.qtd - a);
    td.textContent = d === 0 ? "igual" : (d > 0 ? "+" : "") + tres(d);
    td.className = "calc dif" + (d < 0 ? " neg" : "");
    td.title = d === 0 ? "" : d > 0 ? `${numBR(d)} a mais que a semana anterior` : `${numBR(-d)} a menos que a semana anterior`;
    return;
  }
  const mot = tr.querySelector('[data-c="mot"]');
  mot.classList.toggle("suspeito", !!v.desp && !v.mot);
  mot.title = v.desp && !v.mot ? "Desperdício sempre com o motivo" : "";
  const ep = entradaProc(item.id, blocosDaTela());
  const tdp = tr.querySelector(".entp");
  if (tdp) tdp.textContent = ep == null ? (ENTRADA_PROC.some((x) => x[0] === item.id) ? "—" : "") : tres(ep);
  if (ep != null) v.entp = ep;
  const td = tr.querySelector(".uso");
  const uso = usoDaLinha(item.id, v);
  td.textContent = uso == null ? "—" : tres(uso);
  td.className = "calc uso" + (uso != null && uso < -0.0005 ? " neg" : "");
  td.title = uso != null && uso < -0.0005
    ? "Sobrou mais do que havia: confira inicial, entrada e final." : "";
}

function lerItens() {
  const out = {};
  const blocos = blocosDaTela();
  $$("#painel tbody tr[data-id]").forEach((tr) => {
    const v = lerLinha(tr);
    const ep = SEMANAL ? null : entradaProc(tr.dataset.id, blocos);
    if (ep != null) v.entp = ep;
    if (Object.keys(v).length) out[tr.dataset.id] = v;
  });
  return out;
}

// ------------------------------------------------------------------ filetamento e processamento (diária)
function blocoFiletamento() {
  const f = registro().filetamento || {};
  return `<h3 class="folha-sec">Filetamento do salmão</h3>
    <p class="fonte">Peixe inteiro eviscerado, depois filé com pele e apara, depois filé limpo. Pese cada etapa; o que não
      vira filé é raspa, apara, pele ou descarte.</p>
    <div class="rolagem"><table class="tabela-lancamento tabela-filetamento">
    <thead><tr><th>Calibre</th>${CAMPOS_FILETAMENTO.map(([, t, u]) =>
      `<th>${esc(t)}<br><span class="un">${esc(u)}</span></th>`).join("")}</tr></thead>
    <tbody>${CALIBRES_FILETAMENTO.map(([k, nome]) => `<tr data-filet="${k}"><td>${esc(nome)}</td>
      ${CAMPOS_FILETAMENTO.map(([c]) => `<td><input data-c="${c}" type="text" inputmode="decimal"
        value="${c === "peixes" ? ((f[k] || {})[c] ?? "") : tres((f[k] || {})[c])}"></td>`).join("")}</tr>`).join("")}
    <tr class="total"><td>Total do dia</td>${CAMPOS_FILETAMENTO.map(([c]) =>
      `<td class="calc" data-total="${c}"></td>`).join("")}</tr></tbody></table></div>`;
}

function somarFiletamento() {
  CAMPOS_FILETAMENTO.forEach(([c]) => {
    const t = $$(`#painel tr[data-filet] [data-c="${c}"]`).reduce((s, el) => s + (lerNum(el) || 0), 0);
    $(`#painel [data-total="${c}"]`).textContent = !t ? "—" : c === "peixes" ? numBR(t) : tres(t);
  });
}

function blocoProcessamento() {
  const p = registro().processamento || {};
  return `<h3 class="folha-sec">Processamento</h3>
    <p class="fonte">Anote o peso in natura que foi processado e o peso processado. A perda e o rendimento
      são calculados.</p>
    <div class="rolagem"><table class="tabela-lancamento tabela-processamento">
    <thead><tr><th>Item</th><th>In natura<br><span class="un">foi processar</span></th>
      <th>Processado<br><span class="un">rendeu</span></th><th>Perda<br><span class="un">no processamento</span></th>
      <th>Rendimento</th><th class="col-texto">Observação</th></tr></thead>
    <tbody>${PROCESSADOS_CONTAGEM.map(([k, nome]) => {
      const v = p[k] || {};
      return `<tr data-proc="${k}"><td>${esc(nome)} <span class="un">(kg)</span></td>
        <td><input data-c="in_natura" type="text" inputmode="decimal" value="${tres(v.in_natura)}"></td>
        <td><input data-c="processado" type="text" inputmode="decimal" value="${tres(v.processado)}"></td>
        <td class="calc perda"></td><td class="calc rend"></td>
        <td class="col-texto"><input data-c="obs" type="text" class="texto" value="${esc(v.obs || "")}"></td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function rendimento(tr) {
  const a = lerNum(tr.querySelector('[data-c="in_natura"]'));
  const b = lerNum(tr.querySelector('[data-c="processado"]'));
  const tdP = tr.querySelector(".perda"), tdR = tr.querySelector(".rend");
  if (!a || a <= 0) {
    tdP.textContent = tdR.textContent = "—";
    tdP.className = "calc perda"; tdR.className = "calc rend"; tdP.title = "";
    return;
  }
  const perda = a - (b || 0);
  tdP.textContent = tres(perda);
  tdP.className = "calc perda" + (perda < 0 ? " neg" : "");
  tdP.title = perda < 0 ? "Rendeu mais do que entrou: confira o peso do cru." : "";
  tdR.textContent = fmt((b || 0) / a * 100, 2) + "%";
  tdR.className = "calc rend";
}

// Lê um bloco {linha: {campo: valor}} da tela.
function lerBloco(sel, attr) {
  const out = {};
  $$(sel).forEach((tr) => {
    const v = {};
    tr.querySelectorAll("input").forEach((el) => {
      if (el.classList.contains("texto")) { if (!vazio(el.value)) v[el.dataset.c] = el.value.trim(); }
      else { const n = lerNum(el); if (n != null) v[el.dataset.c] = n; }
    });
    if (Object.keys(v).length) out[tr.dataset[attr]] = v;
  });
  return out;
}

// Um ouvinte só, no painel, que é redesenhado a cada troca de casa.
function aoDigitar(e) {
  const el = e.target;
  if (!el.matches("input, textarea")) return;
  SUJO = true;
  const tr = el.closest("tr");
  if (!tr) return;
  if (tr.dataset.id) { atualizarLinha(tr); if (el.dataset.c === campoContado) desenharAbasFolhas(); }
  else if (tr.dataset.filet) { somarFiletamento(); $$("#painel tbody tr[data-id]").forEach(atualizarLinha); }
  else if (tr.dataset.proc) { rendimento(tr); $$("#painel tbody tr[data-id]").forEach(atualizarLinha); }
}

// ------------------------------------------------------------------ salvar
async function salvar() {
  if (!DADOS || !itensDaTela().length) { aviso("A lista ainda não tem itens para contar.", ""); return; }
  const itens = lerItens();
  const nome = (id) => (itemPorId(id) || {}).nome || id;
  const blocos = SEMANAL ? [] : [lerBloco("#painel tr[data-filet]", "filet"),
    lerBloco("#painel tr[data-proc]", "proc")];
  const negativo = (v) => Object.values(v).some((n) => typeof n === "number" && n < 0);
  const neg = Object.entries(itens).filter(([, v]) => negativo(v));
  const fatEl = $("#fat");
  if (neg.length || blocos.some((b) => Object.values(b).some(negativo)) || (fatEl && num(fatEl.value) < 0)) {
    aviso("Quantidade negativa não existe na ficha — confira" +
      (neg.length ? ": " + neg.map(([id]) => nome(id)).join(", ") : " o filetamento e o processamento"), "mau");
    return;
  }
  const semMotivo = Object.entries(itens).filter(([, v]) => v.desp && !v.mot);
  if (semMotivo.length) {
    aviso("Desperdício sempre com o motivo — falta em: " + semMotivo.map(([id]) => nome(id)).join(", "), "mau");
    return;
  }
  const reg = { itens, resp: $("#resp").value.trim(), obs: $("#obs").value.trim() };
  if (!SEMANAL) {
    reg.fat = vazio(fatEl.value) ? null : num(fatEl.value);
    [reg.filetamento, reg.processamento] = blocos;
  }
  estado("Salvando…");
  try {
    const r = await (await fetch("/api/contagem", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: TIPO_CONTAGEM, data: DADOS.data, casa: CASA, registro: reg }) })).json();
    if (!r.ok) throw new Error(r.erro);
    DADOS.registros = DADOS.registros || {};
    DADOS.registros[CASA] = reg;
    SUJO = false;
    estado("Contagem salva", "ok");
    const faltam = faltamNaCasa(CASA);
    const negativos = SEMANAL ? 0 : Object.entries(itens).filter(([id, x]) => (usoDaLinha(id, x) ?? 0) < -0.0005).length;
    aviso(CASA + ": " + r.itens + " itens gravados" +
      (faltam ? " — faltam " + faltam + " sem contagem" : " — contagem completa") +
      (negativos ? `; ${negativos} com uso negativo para conferir` : "") + ".",
      faltam || negativos ? "" : "bom");
    desenharAbas();
  } catch (e) {
    estado("Não salvou", "erro");
    aviso("Não consegui salvar: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ impressão
// A ficha abre numa aba própria, já na casa e na data da tela; lá dá para
// trocar a casa ou imprimir as quatro de uma vez.
function imprimir(modelo) {
  window.open(`ficha-contagem.html?modelo=${modelo}&data=${encodeURIComponent(DADOS ? DADOS.data : hoje())}` +
    `&casa=${encodeURIComponent(CASA || "")}`, "_blank");
}

// ------------------------------------------------------------------ lista de itens
// Rascunho da lista: editado na tela e gravado inteiro no "Salvar lista".
let LISTA = [];
const chavesCasas = () => DADOS.casas.map((c) => c.chave);
const noCampo = (n) => n == null ? "" : String(Math.round(n * 1000) / 1000).replace(".", ",");

function desenharEditor() {
  LISTA = DADOS.itens.map((i) => Object.assign({}, i, { casas: (i.casas || []).slice() }));
  $("#resumo-lista").textContent = DADOS.itens.length + " " +
    (DADOS.itens.length === 1 ? "item" : "itens") +
    " · a mesma lista sai na ficha impressa" + (SEMANAL ? "" : " e no rascunho");
  desenharLinhasEditor();
}

function desenharLinhasEditor() {
  const ed = $("#editor-lista");
  const casas = chavesCasas();
  ed.innerHTML = `<div class="ordem-corpo">
    <div class="rolagem"><table class="tabela-lista">
      <thead><tr><th title="Código do produto no ERP. Subproduto fica em branco">Código</th><th>Item</th><th>Unidade</th><th>Grupo</th>
        <th title="Em branco: conta na unidade">Embalagem</th><th>1 embalagem =</th>
        <th title="Sem marcar nenhuma, vale para as quatro">Só nas casas</th><th>Nota</th>
        <th title="Subproduto: o item de onde ele sai. Aparece recuado embaixo dele. Nome com travessão (Camarão M — Perda) já se resolve sozinho.">Item primário</th><th></th></tr></thead>
      <tbody>${LISTA.map((i, n) => `<tr data-n="${n}">
        <td><input type="text" data-campo="codigo" value="${esc(i.codigo || "")}" placeholder="—" class="curto" inputmode="numeric"></td>
        <td><input type="text" data-campo="nome" value="${esc(i.nome)}" placeholder="Nome do item"></td>
        <td><input type="text" data-campo="un" value="${esc(i.un || "")}" placeholder="kg, und…" class="curto"></td>
        <td><input type="text" data-campo="grupo" value="${esc(i.grupo || "")}" placeholder="opcional"></td>
        <td><input type="text" data-campo="emb" value="${esc(i.emb || "")}" placeholder="pacote…" class="curto"></td>
        <td><input type="text" data-campo="fator" inputmode="decimal" value="${typeof i.fator === "number" ? noCampo(i.fator) : esc(i.fator || "")}"
              placeholder="—" class="curto"></td>
        <td class="casas-item">${casas.map((c) => `<label><input type="checkbox"
              data-casa="${esc(c)}"${(i.casas || []).includes(c) ? " checked" : ""}>${esc(c)}</label>`).join("")}</td>
        <td><input type="text" data-campo="nota" value="${esc(i.nota || "")}" placeholder="opcional" class="curto"></td>
        <td><input type="text" data-campo="pai" value="${esc(i.pai || "")}" list="lista-primarios"
              placeholder="${esc(i.pai ? "" : paiDoItem(i))}"></td>
        <td><button type="button" class="botao-mini" data-tirar="${n}" title="Tirar da lista">✕</button></td>
      </tr>`).join("") || '<tr><td colspan="10" class="vazio">Nenhum item ainda.</td></tr>'}</tbody>
    </table></div>
    <datalist id="lista-primarios">${LISTA.filter((i) => !paiDoItem(i)).map((i) =>
      `<option value="${esc(i.nome)}"></option>`).join("")}</datalist>
    <label class="campo" style="margin-top:16px"><span>Colar lista — um item por linha: item, unidade,
      grupo, embalagem e quanto vem nela, separados por tabulação (direto do Excel) ou ponto e vírgula</span>
      <textarea id="colar" rows="4" placeholder="Arroz para sushi;kg;Insumos principais;pacote;5&#10;Kani;kg;Insumos principais"></textarea></label>
    <div class="ordem-acoes">
      <button class="botao" id="btn-novo">Adicionar item</button>
      <button class="botao" id="btn-colar">Incluir os colados</button>
      <span class="fonte">Tirar um item da lista não apaga as contagens já feitas dele.</span>
      <span style="flex:1"></span>
      <button class="botao" id="btn-desfazer">Descartar mudanças</button>
      <button class="botao primario" id="btn-lista">Salvar lista</button>
    </div></div>`;

  $$("#editor-lista tbody input[data-campo]").forEach((el) => {
    el.oninput = () => { LISTA[+el.closest("tr").dataset.n][el.dataset.campo] = el.value; };
  });
  $$("#editor-lista tbody input[data-casa]").forEach((el) => {
    el.onchange = () => {
      const td = el.closest("td");
      LISTA[+el.closest("tr").dataset.n].casas =
        casas.filter((c) => td.querySelector(`[data-casa="${c}"]`).checked);
    };
  });
  $$("#editor-lista [data-tirar]").forEach((b) => {
    b.onclick = () => { LISTA.splice(+b.dataset.tirar, 1); desenharLinhasEditor(); };
  });
  $("#btn-novo").onclick = () => {
    LISTA.push({ nome: "", un: "", grupo: "", casas: [] });
    desenharLinhasEditor();
    const ult = $$("#editor-lista tbody input[data-campo=nome]").pop();
    if (ult) ult.focus();
  };
  $("#btn-colar").onclick = () => {
    const linhas = $("#colar").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const ja = new Set(LISTA.map((i) => chave(i.nome)));
    let novos = 0, repetidos = 0;
    linhas.forEach((l) => {
      const [nome, un, grupo, emb, fator] = l.split(/\t|;/).map(limpaNome);
      if (!nome) return;
      if (ja.has(chave(nome))) { repetidos++; return; }
      ja.add(chave(nome));
      LISTA.push({ nome, un: un || "", grupo: grupo || "", emb: emb || "",
        fator: fator ? num(fator) : null, casas: [] });
      novos++;
    });
    desenharLinhasEditor();
    aviso(novos + " itens incluídos" + (repetidos ? ", " + repetidos + " já estavam na lista" : "") +
      ". Confira e clique em Salvar lista.", "");
  };
  $("#btn-desfazer").onclick = desenharEditor;
  $("#btn-lista").onclick = salvarLista;
}

async function salvarLista() {
  const itens = LISTA.filter((i) => limpaNome(i.nome)).map((i) => Object.assign({}, i, {
    fator: vazio(i.fator) ? null : num(i.fator) }));
  // O mesmo nome pode repetir embaixo de primários diferentes ("Camarão
  // Temperado" sai do M e do P); repetido é só dentro do mesmo primário.
  const vistos = new Set();
  const rep = itens.find((i) => {
    const k = chave(i.pai || "") + "|" + chave(i.nome);
    if (vistos.has(k)) return true; vistos.add(k); return false;
  });
  if (rep) { aviso("Item repetido na lista: " + rep.nome + (rep.pai ? " (em " + rep.pai + ")" : ""), "mau"); return; }
  const semFator = itens.find((i) => !vazio(i.emb) && !(i.fator > 0));
  if (semFator) { aviso(`${semFator.nome}: diga quanto vem em 1 ${semFator.emb}.`, "mau"); return; }
  if (SUJO && !confirm("Há anotação digitada e não salva. Salvar a lista recarrega a tela e ela se perde. Continuar?")) return;
  estado("Salvando lista…");
  try {
    const r = await (await fetch("/api/contagem/itens", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: TIPO_CONTAGEM, itens }) })).json();
    if (!r.ok) throw new Error(r.erro);
    aviso("Lista salva: " + r.itens.length + " itens.", "bom");
    SUJO = false;
    await carregar($("#data").value || hoje());
  } catch (e) {
    estado("Lista não salva", "erro");
    aviso("Não consegui salvar a lista: " + e.message, "mau");
  }
}

// ------------------------------------------------------------------ início
(function iniciar() {
  const passo = SEMANAL ? 7 : 1;
  const dataEl = $("#data");
  dataEl.onchange = () => { if (dataEl.value) carregar(dataEl.value); };
  $("#anterior").onclick = () => carregar(somarDias(DADOS ? DADOS.data : hoje(), -passo));
  $("#seguinte").onclick = () => carregar(somarDias(DADOS ? DADOS.data : hoje(), passo));
  $("#hoje").onclick = () => carregar(hoje());
  $("#btn-salvar").onclick = salvar;
  $$("[data-imprimir]").forEach((b) => { b.onclick = () => imprimir(b.dataset.imprimir); });
  $("#painel").addEventListener("input", aoDigitar);

  const abrir = $("#abrir-lista");
  const alterna = () => {
    const p = $("#editor-lista");
    p.hidden = !p.hidden;
    $("#chev-lista").textContent = p.hidden ? "▸" : "▾";
  };
  abrir.onclick = alterna;
  abrir.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alterna(); } };

  window.addEventListener("beforeunload", (e) => { if (SUJO) { e.preventDefault(); e.returnValue = ""; } });

  carregar(hoje()).then(() => {
    // Lista vazia: abre o editor de cara, é a única coisa a fazer na tela.
    if (DADOS && !DADOS.itens.length) alterna();
  });
})();
