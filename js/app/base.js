// ============================================================================
// A base de cadastros (fornecedores, produtos, unidades, observações) — antes no
// js/comum.js, para as telas de compras (Cadastros, Ordens, Importar).
//
// É a MESMA planilha do Gerador de OCs — o servidor grava direto lá. Cadastro
// feito aqui aparece lá e vice-versa; não existe "cadastro do CDE" separado.
// O objeto vive aqui, um só para a tela inteira, e é alterado no lugar: quem
// edita uma célula muda o registro, e a gravação manda a base inteira.
// ============================================================================
import { num, chave } from "./formato.js";
import { getBase, postBase } from "./api.js";

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
