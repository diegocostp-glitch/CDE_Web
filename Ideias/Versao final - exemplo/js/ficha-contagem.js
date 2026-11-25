// ============================================================================
// Fichas de papel da Conferência — os três modelos de Ideias/Templates:
//   diaria   — Ficha de Contagem Diária (itens + filetamento + processamento)
//   semanal  — Ficha de Contagem Semanal (quantidade contada e observação)
//   rascunho — Ficha de Rascunho, pesagens do dia na bancada (itens da diária)
// As linhas saem da lista cadastrada em cada contagem, já filtradas pela casa:
// a ficha impressa e a tela têm sempre os mesmos itens, na mesma ordem.
// A ficha sai em branco — é para anotar à mão e depois digitar na tela.
// ============================================================================
const MODELOS = {
  diaria: { tipo: "diaria", titulo: "Ficha de Contagem Diária",
    instr: "conte no fechamento. item com embalagem: anote as embalagens, o sistema converte. desperdício sempre com o motivo." },
  semanal: { tipo: "semanal", titulo: "Ficha de Contagem Semanal",
    instr: "contagem de conferência: anote só o que está no estoque agora. item com embalagem: conte as embalagens " +
      "fechadas e anote a quantidade — o sistema converte para a unidade." },
  rascunho: { tipo: "diaria", titulo: "Ficha de Rascunho — pesagens do dia",
    instr: "fica na bancada durante o dia. a cada pesagem, anote o peso numa casa da linha do item; no fechamento " +
      "passe a soma para a ficha de contagem diária." },
};
const PESAGENS = 6;
const LINHAS_OUTROS = 3;

const parametros = new URLSearchParams(location.search);
let DADOS = null;
let PAGINA_ATUAL = "";      // nome da folha que está sendo montada (cabeçalho)

const vazias = (n, extra = "") => Array.from({ length: n }, () => `<td${extra}></td>`).join("");
// Código do ERP em coluna própria, antes do item: dentro da célula do nome ele
// empurrava o texto e as linhas quebravam. Subproduto fica com a célula vazia.
const COL_COD = '<col style="width:7%">';
const TH_COD = '<th class="th-cod">Código</th>';
const cod = (i) => `<td class="cod">${esc((i && i.codigo) || "")}</td>`;
const nomeItem = (i, comDica, l = {}) => `${esc(l.filho ? nomeNoPai(i) : i.nome)} <span class="un">${esc(i.un || "")}</span>` +
  (i.nota ? `<span class="comentario">${esc(i.nota)}</span>` : "") +
  (comDica && i.emb ? `<span class="dica">contar em ${esc(comoContar(i))}</span>` : "");

// Mesmas linhas da tela: grupo, primário e subprodutos recuados embaixo dele.
// linha(item, l) recebe a linha inteira para saber se é subproduto.
// Todo item que não é subproduto vai em negrito; o subproduto, recuado e normal.
const classeLinha = (l) => l.filho ? "filho" : "primario";
function linhasDeItens(itens, ncolSemCod, linha) {
  const ncol = ncolSemCod + 1;
  const temGrupo = itens.some((i) => i.grupo);
  return linhasDaLista(itens).map((l) =>
    l.tipo === "grupo" ? (temGrupo ? `<tr class="grupo"><td colspan="${ncol}">${esc(l.nome || "outros itens")}</td></tr>` : "")
    : l.tipo === "pai" ? `<tr class="pai"><td colspan="${ncol}">${esc(l.nome)}</td></tr>`
    : linha(l.item, l)).join("");
}

function cabecalho(m, casa, folha, total) {
  return `<header class="f-cab"><img src="ficha-mascote.png" alt="">
      <div><h1>${esc(MODELOS[m].titulo)}</h1><p>${esc(casa.nome)} · Sushi Boulevard</p></div>
      ${total > 1 ? `<span class="f-folha">folha ${folha} de ${total}<br><b>${esc(PAGINA_ATUAL)}</b></span>` : ""}</header>
    <div class="f-linha"><span class="f-data">${m === "semanal" ? "Semana de" : "Data"}
        <b>____ / ____ / ________</b></span>
      <span class="preencher">Responsável <i></i></span>
      ${m === "diaria" ? '<span class="preencher curta">Faturamento do dia (R$) <i></i></span>' : ""}</div>
    <p class="f-instr">${esc(MODELOS[m].instr)}</p>`;
}

const rodape = () => `<div class="f-obs"><span>observações</span><div><i></i><i></i><i></i></div></div>
  <div class="f-assin"><div>responsável cozinha</div><div>responsável sushibar</div><div>estoquista</div></div>`;

// Contagem diária em duas folhas, como a tela: conferência de itens (camarões
// junto dos demais); filetamento e processamento.
// O código do processado é o do in natura da lista (Anel de lula in natura: 20065).
const inNatura = (itens, nome) => itens.find((i) => chave(i.nome) === chave(nome + " in natura"));

function fichaDiaria(itens) {
  const tabela = (lista) => `<table><colgroup>${COL_COD}<col style="width:33%"><col><col><col><col><col style="width:15%"><col></colgroup>
    <thead><tr>${TH_COD}<th>Insumo</th><th>Inicial</th><th>Entrada</th><th>Saída<small>transferência</small></th>
      <th>Desperdício</th><th>Motivo</th><th class="hl">Final<small>contagem</small></th></tr></thead>
    <tbody>${linhasDeItens(lista, 7, (i, l) =>
      `<tr class="${classeLinha(l)}">${cod(i)}<td class="nome">${nomeItem(i, true, l)}</td>${vazias(5)}<td class="hl"></td></tr>`)}</tbody></table>`;
  const filet = `<h2 class="f-sec f-sec-topo">Filetamento do salmão</h2>
    <p class="f-instr">peixe inteiro eviscerado, depois filé com pele e apara, depois filé limpo. pese cada etapa; o que não vira
      filé é raspa, apara, pele ou descarte.</p>
    <table><colgroup><col style="width:13%"></colgroup>
    <thead><tr><th>Calibre</th>${CAMPOS_FILETAMENTO.map(([c, t, u]) =>
      `<th class="${c === "limpo" ? "hl" : ""}">${esc(t)}<small>${esc(u)}</small></th>`).join("")}</tr></thead>
    <tbody>${CALIBRES_FILETAMENTO.map(([, nome]) => `<tr><td>${esc(nome)}</td>${CAMPOS_FILETAMENTO.map(([c]) =>
      `<td class="${c === "limpo" ? "hl" : ""}"></td>`).join("")}</tr>`).join("")}
      <tr class="total"><td>Total do dia</td>${CAMPOS_FILETAMENTO.map(([c]) =>
      `<td class="${c === "limpo" ? "hl" : ""}"></td>`).join("")}</tr></tbody></table>`;
  const proc = `<h2 class="f-sec">Processamento</h2>
    <p class="f-instr">anote o peso in natura que foi processado e o peso processado; perda e rendimento o sistema calcula.</p>
    <table><colgroup>${COL_COD}<col style="width:30%"><col style="width:20%"><col style="width:20%"><col></colgroup>
    <thead><tr>${TH_COD}<th>Item</th><th>Insumo<small>in natura, kg</small></th><th class="hl">Rendimento<small>processado, kg</small></th>
      <th>Observação</th></tr></thead>
    <tbody>${PROCESSADOS_CONTAGEM.map(([, nome]) =>
      `<tr>${cod(inNatura(itens, nome))}<td>${esc(nome)}</td><td></td><td class="hl"></td><td></td></tr>`).join("")}</tbody></table>`;
  return [["Conferência de itens", tabela(itens)], ["Filetamento e processamento", filet + proc]];
}

function fichaSemanal(itens) {
  return [["", `<table><colgroup>${COL_COD}<col style="width:33%"><col style="width:8%"><col style="width:22%"><col style="width:11%"><col></colgroup>
    <thead><tr>${TH_COD}<th>Item</th><th>Unidade</th><th style="text-align:left">como contar</th>
      <th class="hl">Quantidade<small>contada</small></th><th>Observação</th></tr></thead>
    <tbody>${linhasDeItens(itens, 5, (i, l) => `<tr class="${classeLinha(l)}">${cod(i)}<td class="nome">${esc(l.filho ? nomeNoPai(i) : i.nome)}${i.nota ? `<span class="comentario">${esc(i.nota)}</span>` : ""}</td>
      <td class="centro">${esc(i.un || "")}</td><td class="cinza">${esc(comoContar(i))}</td>
      <td class="hl"></td><td></td></tr>`)}</tbody></table>`]];
}

function fichaRascunho(itens) {
  const ncol = PESAGENS + 2;
  const linha = (rotulo, cls = "", item = null) =>
    `<tr class="${cls}">${cod(item)}<td class="nome">${rotulo}</td>${vazias(PESAGENS)}<td class="hl"></td></tr>`;
  // Processamento: as duas pesagens de cada item, in natura e processado,
  // como na ficha de rascunho do modelo.
  // Mesmo formato da lista: o in natura é o primário (pesado na própria linha)
  // e o processado vem recuado embaixo dele.
  const proc = PROCESSADOS_CONTAGEM.map(([, nome]) =>
    linha(`${esc(nome)} in natura <span class="un">kg</span>`, "primario", inNatura(itens, nome)) +
    linha(`${esc(nome)} processado <span class="un">kg</span>`, "filho")).join("");
  return [["", `<table><colgroup>${COL_COD}<col style="width:31%"></colgroup>
    <thead><tr>${TH_COD}<th>Item</th>${Array.from({ length: PESAGENS }, (_, n) =>
      `<th>${n + 1}ª<small>pesagem</small></th>`).join("")}<th class="hl">Soma<small>vai para a ficha</small></th></tr></thead>
    <tbody>${linhasDeItens(itens, ncol, (i, l) => linha(nomeItem(i, false, l), classeLinha(l), i))}
      <tr class="grupo"><td colspan="${ncol + 1}">Processamento</td></tr>${proc}
      <tr class="grupo"><td colspan="${ncol + 1}">Outros</td></tr>${Array.from({ length: LINHAS_OUTROS }, () => linha("")).join("")}
    </tbody></table>`]];
}

function desenhar() {
  const m = $("#modelo").value;
  const casaSel = $("#casa").value;
  const casas = casaSel === "todas" ? DADOS.casas : DADOS.casas.filter((c) => c.chave === casaSel);
  const corpo = { diaria: fichaDiaria, semanal: fichaSemanal, rascunho: fichaRascunho }[m];
  if (!DADOS.itens.length) {
    $("#folhas").innerHTML = `<div class="folha"><p class="vazio">A lista da contagem
      ${MODELOS[m].tipo === "semanal" ? "semanal" : "diária"} ainda não tem itens. Cadastre na tela da contagem.</p></div>`;
    return;
  }
  // Cada casa: uma ou mais folhas, cada uma com o cabeçalho da ficha (a folha
  // separada continua dizendo de que casa e de que dia é); observações e
  // assinaturas só na última.
  $("#folhas").innerHTML = casas.map((c) => {
    const paginas = corpo(itensDaCasa(DADOS.itens, c.chave));
    return paginas.map(([nome, html], n) => {
      PAGINA_ATUAL = nome;
      return `<section class="folha">${cabecalho(m, c, n + 1, paginas.length)}${html}
        ${n === paginas.length - 1 ? rodape() : ""}</section>`;
    }).join("");
  }).join("");
  $("#nota").textContent = casas.length > 1
    ? casas.length + " fichas, uma por casa — cada casa começa numa folha nova."
    : m === "diaria" ? "A diária sai em duas folhas: conferência de itens, filetamento e processamento."
    : "Cada casa sai só com os itens dela.";
  document.title = "CDE — " + MODELOS[m].titulo + (casas.length === 1 ? " — " + casas[0].chave : "");
}

async function carregar() {
  const m = $("#modelo").value;
  try {
    const r = await (await fetch("/api/contagem?tipo=" + MODELOS[m].tipo + "&data=" +
      encodeURIComponent($("#data").value), { cache: "no-store" })).json();
    if (r.ok === false) throw new Error(r.erro);
    DADOS = r;
    const sel = $("#casa"), atual = sel.value || parametros.get("casa") || r.casas[0].chave;
    sel.innerHTML = r.casas.map((c) => `<option value="${esc(c.chave)}">${esc(c.nome)}</option>`).join("") +
      '<option value="todas">As quatro casas</option>';
    sel.value = [...sel.options].some((o) => o.value === atual) ? atual : r.casas[0].chave;
    desenhar();
  } catch (e) {
    $("#folhas").innerHTML = `<div class="folha"><p class="vazio">Não consegui ler a lista: ${esc(e.message)}</p></div>`;
  }
}

(function iniciar() {
  const m = parametros.get("modelo");
  if (MODELOS[m]) $("#modelo").value = m;
  const d = new Date();
  $("#data").value = parametros.get("data") ||
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  $("#modelo").onchange = carregar;
  $("#data").onchange = carregar;
  $("#casa").onchange = desenhar;
  $("#imprimir").onclick = () => window.print();
  carregar();
})();
