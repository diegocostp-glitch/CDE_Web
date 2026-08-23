// ============================================================================
// Peças compartilhadas pelas telas de compras (Ordens, Cadastros, Importar).
//
// Antes cada tela repetia seu próprio esc/num/fmt. Com três telas novas mexendo
// nos mesmos cadastros, repetir viraria divergência: bastava uma delas ler
// número de um jeito diferente para a mesma OC sair com quantidade errada
// conforme a porta de entrada. Aqui há uma implementação de cada coisa.
//
// A base de cadastros (fornecedores, produtos, unidades, observações) é a MESMA
// planilha do Gerador de OCs — o servidor grava direto lá. Cadastro feito aqui
// aparece lá e vice-versa; não existe "cadastro do CDE" separado.
// ============================================================================
const $ = (s, raiz) => (raiz || document).querySelector(s);
const $$ = (s, raiz) => [...(raiz || document).querySelectorAll(s)];

// Cuidado com a origem do número: o JSON usa ponto como DECIMAL (43.081 são
// quarenta e três quilos) e o campo digitado usa ponto como MILHAR
// (43.081 são quarenta e três mil). A vírgula é o que distingue: só quando ela
// aparece o ponto é separador de milhar.
function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
const hojeISO = () => new Date().toISOString().slice(0, 10);
const hojeBR = () => new Date().toLocaleDateString("pt-BR");
const hojePonto = () => new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");

// Data do Excel (número de série) ou texto já legível → dd/mm/aaaa
function dataDoExcel(v) {
  if (!v) return "";
  const n = Number(String(v).replace(",", "."));
  if (!isNaN(n) && n > 10000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000))
      .toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  return String(v).trim();
}

// Nome limpo para exibir/gravar: colapsa qualquer espaço (inclusive o
// não-quebrável que o Excel insere) e apara as pontas.
const limpaNome = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
// Chave de comparação: sem acento, minúscula, espaços normalizados. É o que
// impede "STRAW " de virar um produto diferente de "STRAW".
const chave = (s) => limpaNome(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const busca = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------------------ CNPJ
const soDigitos = (v) => String(v || "").replace(/\D/g, "");

function formatarCNPJ(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length > 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length > 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  if (d.length > 5)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length > 2)  return `${d.slice(0,2)}.${d.slice(2)}`;
  return d;
}
const mascaraCNPJ = (el) => { el.value = formatarCNPJ(el.value); };

function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base) => {
    let peso = base.length - 7, soma = 0;
    for (let i = base.length; i >= 1; i--) {
      soma += parseInt(base[base.length - i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(d.slice(0, 12));
  return d1 === parseInt(d[12]) && digito(d.slice(0, 12) + d1) === parseInt(d[13]);
}

// ------------------------------------------------------------------ recados
function aviso(t, tipo) {
  const el = $("#aviso");
  if (!el) return;
  el.textContent = t;
  el.className = "aviso-flut " + (tipo || "");
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, tipo === "mau" ? 6000 : 3400);
}
function estado(t, c) {
  const e = $("#estado");
  if (e) { e.textContent = t || ""; e.className = "estado " + (c || ""); }
}

// ------------------------------------------------------------------ base de cadastros
let BASE = null;

async function carregarBase(forcar) {
  if (BASE && !forcar) return BASE;
  BASE = await (await fetch("/api/base", { cache: "no-store" })).json();
  BASE.fornecedores = BASE.fornecedores || [];
  BASE.produtos = (BASE.produtos || []).map((p) => Object.assign({}, p, { preco: num(p.preco) }));
  BASE.unidades = BASE.unidades || [];
  BASE.observacoes = BASE.observacoes || [];
  return BASE;
}

// Grava a base inteira de volta na planilha. É reescrita completa das quatro
// abas — a tela é a fonte, não um diff.
async function salvarBase() {
  const UP = (v) => (v === null || v === undefined) ? "" : String(v).toUpperCase();
  const corpo = {
    fornecedores: BASE.fornecedores.map((f) => ({
      "Chave": UP(f.chave), "Razão Social": UP(f.razao), "Contato": UP(f.contato),
      "Telefone": UP(f.tel), "E-mail": UP(f.email), "CNPJ": UP(f.cnpj), "I.E.": UP(f.ie),
      "Endereço": UP(f.end), "Cidade": UP(f.cidade),
      "Prazo Faturado": UP(f.prazoFat), "Prazo Entrega": UP(f.prazoEntrega),
    })),
    produtos: BASE.produtos.map((p) => ({
      "Fornecedor": UP(p.fornecedor), "Produto": UP(p.produto),
      "Unidade": UP(p.un), "Preço": num(p.preco),
    })),
    unidades: BASE.unidades.map((u) => ({
      "Chave": UP(u.chave), "Nome": UP(u.nome), "Contato": UP(u.contato), "E-mail": UP(u.email),
      "CNPJ": UP(u.cnpj), "I.E.": UP(u.ie), "Telefone": UP(u.tel), "Endereço": UP(u.end),
    })),
    observacoes: BASE.observacoes
      .filter((o) => (o.texto || "").trim())
      .map((o) => ({ "Fornecedor": UP(o.fornecedor), "Observação": UP(o.texto) })),
  };
  estado("Salvando cadastro…");
  const r = await (await fetch("/api/base", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
  if (!r.ok) throw new Error(r.erro || "erro ao gravar a planilha");
  estado("Cadastro salvo", "ok");
  return r;
}

// ------------------------------------------------------------------ consultas na base
const fornecedorPorChave = (k) =>
  BASE.fornecedores.find((f) => chave(f.chave) === chave(k)) || null;
const unidadePorChave = (k) =>
  BASE.unidades.find((u) => chave(u.chave) === chave(k)) || null;
const produtosDoFornecedor = (k) =>
  BASE.produtos.filter((p) => chave(p.fornecedor) === chave(k));
const obsDoFornecedor = (k) => {
  const o = BASE.observacoes.find((x) => chave(x.fornecedor) === chave(k));
  return o ? (o.texto || "") : "";
};

// O nome do fornecedor pode chegar por vários caminhos (Projeção, planilha da
// equipe, PDF da OC) e raramente vem igual ao apelido do cadastro. Vale o
// apelido MAIS LONGO que casa, para "C S HORTIFRUTI COMERCIO LTDA" não perder
// para um apelido curto qualquer.
function casarFornecedor(nome) {
  const alvo = chave(nome);
  if (!alvo) return null;
  const exato = BASE.fornecedores.find((f) => chave(f.chave) === alvo)
             || BASE.fornecedores.find((f) => chave(f.razao) === alvo);
  if (exato) return exato;
  const letras = (s) => chave(s).replace(/[^a-z0-9]/g, "");
  const n = letras(nome);
  let achado = null, tam = 0;
  BASE.fornecedores.forEach((f) => {
    const k = letras(f.chave), r = letras(f.razao);
    [k, r].forEach((c) => {
      if (c.length < 3) return;
      if ((n.includes(c) || c.includes(n)) && c.length > tam) { achado = f; tam = c.length; }
    });
  });
  return achado;
}

// A unidade impressa no PDF → unidade cadastrada. O CNPJ é o critério
// principal; sem ele, tenta pelo nome e pelas palavras da chave.
function casarUnidade(dados) {
  if (!dados) return null;
  const dig = soDigitos(dados.cnpj);
  if (dig.length === 14) {
    const porCnpj = BASE.unidades.find((u) => soDigitos(u.cnpj) === dig);
    if (porCnpj) return porCnpj;
  }
  const nome = chave(dados.nome || "");
  if (!nome) return null;
  const porNome = BASE.unidades.find((u) => chave(u.nome) === nome);
  if (porNome) return porNome;
  let melhor = null, pontos = 0;
  BASE.unidades.forEach((u) => {
    const palavras = chave(u.chave).split(/[^a-z0-9]+/).filter((p) => p.length > 2);
    const n = palavras.filter((p) => nome.includes(p)).length;
    if (n > pontos) { pontos = n; melhor = u; }
  });
  return melhor;
}

// ------------------------------------------------------------------ pendências
// O que IMPEDE gerar a OC. Mesma trava do Gerador: OC sem CNPJ válido é nota
// fiscal recusada na portaria, e item sem preço é conferência impossível na
// entrega. Melhor travar aqui do que descobrir com o caminhão no pátio.
function pendenciasDaOC(fornecedorBase, itens) {
  const motivos = [];
  if ((itens || []).some((i) => num(i.qtd) > 0 && !(num(i.preco) > 0)))
    motivos.push("informar preço do item");
  const f = fornecedorBase ? fornecedorPorChave(fornecedorBase) : null;
  if (!f) motivos.push("vincular o fornecedor ao cadastro");
  else if (!limpaNome(f.razao)) motivos.push("informar a razão social");
  else if (!cnpjValido(f.cnpj)) motivos.push("informar CNPJ válido");
  return motivos;
}

// ------------------------------------------------------------------ numeração
// Nunca calculada no navegador: vem do Registro_OCs.json compartilhado com o
// Gerador. Contador local faria duas OCs nascerem com o mesmo número.
async function proximoNumeroOC(unidade) {
  try {
    const r = await (await fetch("/api/ocs/proximo?unidade=" + encodeURIComponent(unidade),
      { cache: "no-store" })).json();
    return r.proximo || null;
  } catch (e) { return null; }
}

async function reservarNumerosOC(unidade, entradas, comeco) {
  const corpo = { unidade, quantidade: entradas.length, entradas };
  const inicio = parseInt(comeco);
  if (inicio > 0) corpo.comeco = inicio;
  const r = await (await fetch("/api/ocs/reservar", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })).json();
  if (!r.ok || !r.numeros || !r.numeros.length) throw new Error(r.erro || "sem número disponível");
  return r.numeros.map((n) => String(n).padStart(3, "0"));
}

// ------------------------------------------------------------------ selects com busca
// Cinquenta e nove fornecedores e trezentos e cinquenta produtos num <select>
// nativo obrigam a rolar. O campo com datalist deixa digitar as três primeiras
// letras e chegar lá.
function comboBusca(id, itens, atual, placeholder) {
  return `<input class="combo" id="${id}" list="${id}-lista" autocomplete="off"
      placeholder="${esc(placeholder || "Digite para buscar")}" value="${esc(atual || "")}">
    <datalist id="${id}-lista">${itens.map((i) =>
      `<option value="${esc(i.valor)}">${esc(i.rotulo || "")}</option>`).join("")}</datalist>`;
}
