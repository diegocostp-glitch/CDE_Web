// ============================================================================
// A base de cadastros (fornecedores, produtos, unidades, observações) — antes no
// js/comum.js, para as telas de compras (Cadastros, Ordens, Importar).
//
// É a MESMA planilha do Gerador de OCs — o servidor grava direto lá. Cadastro
// feito aqui aparece lá e vice-versa; não existe "cadastro do CDE" separado.
// O objeto vive aqui, um só para a tela inteira, e é alterado no lugar: quem
// edita uma célula muda o registro, e a gravação manda a base inteira.
// ============================================================================
import { num, chave, limpaNome, soDigitos, cnpjValido } from "./formato.js";
import { getBase, postBase, getOcsProximo, postOcsReservar } from "./api.js";

let BASE = null;
export const base = () => BASE;

export async function carregarBase(forcar) {
  if (BASE && !forcar) return BASE;
  BASE = await (await getBase()).json();
  BASE.fornecedores = BASE.fornecedores || [];
  BASE.produtos = (BASE.produtos || []).map((p) => Object.assign({}, p, { preco: num(p.preco) }));
  BASE.unidades = BASE.unidades || [];
  BASE.observacoes = BASE.observacoes || [];
  return BASE;
}

// Grava a base inteira de volta na planilha. É reescrita completa das quatro
// abas — a tela é a fonte, não um diff. `estado` é a barra de estado da tela.
export async function salvarBase(estado) {
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
  const r = await (await postBase(corpo)).json();
  if (!r.ok) throw new Error(r.erro || "erro ao gravar a planilha");
  estado("Cadastro salvo", "ok");
  return r;
}

export const produtosDoFornecedor = (k) =>
  BASE.produtos.filter((p) => chave(p.fornecedor) === chave(k));
export const obsDoFornecedor = (k) => {
  const o = BASE.observacoes.find((x) => chave(x.fornecedor) === chave(k));
  return o ? (o.texto || "") : "";
};

// ------------------------------------------------------------------ consultas
export const fornecedorPorChave = (k) =>
  BASE.fornecedores.find((f) => chave(f.chave) === chave(k)) || null;
export const unidadePorChave = (k) =>
  BASE.unidades.find((u) => chave(u.chave) === chave(k)) || null;

// O nome do fornecedor pode chegar por vários caminhos (Projeção, planilha da
// equipe, PDF da OC) e raramente vem igual ao apelido do cadastro. Vale o
// apelido MAIS LONGO que casa, para "C S HORTIFRUTI COMERCIO LTDA" não perder
// para um apelido curto qualquer.
export function casarFornecedor(nome) {
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
export function casarUnidade(dados) {
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

// O que IMPEDE gerar a OC. Mesma trava do Gerador: OC sem CNPJ válido é nota
// fiscal recusada na portaria, e item sem preço é conferência impossível na
// entrega. Melhor travar aqui do que descobrir com o caminhão no pátio.
export function pendenciasDaOC(fornecedorBase, itens) {
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
export async function proximoNumeroOC(unidade) {
  try {
    const r = await (await getOcsProximo(unidade)).json();
    return r.proximo || null;
  } catch (e) { return null; }
}

export async function reservarNumerosOC(unidade, entradas, comeco) {
  const corpo = { unidade, quantidade: entradas.length, entradas };
  const inicio = parseInt(comeco);
  if (inicio > 0) corpo.comeco = inicio;
  const r = await (await postOcsReservar(corpo)).json();
  if (!r.ok || !r.numeros || !r.numeros.length) throw new Error(r.erro || "sem número disponível");
  return r.numeros.map((n) => String(n).padStart(3, "0"));
}
