// ============================================================================
// Conferência — o que a tela de contagem e a ficha impressa dividem.
//
// As fichas de papel (Ideias/Templates) e as telas têm as MESMAS linhas e
// colunas: o que se anota na bancada se digita na tela na mesma ordem. Por
// isso os blocos fixos (filetamento do salmão, processamento) moram aqui, e
// não em cada tela — e o servidor valida as mesmas chaves (server.py).
// ============================================================================
const CALIBRES_FILETAMENTO = [
  ["salmao_0810", "Salmão 08/10"], ["salmao_1012", "Salmão 10/12"],
  ["salmao_1214", "Salmão 12/14"], ["salmao_1416", "Salmão 14/16"],
];
// [chave, título, unidade]. O filé limpo é a coluna que interessa — vai em destaque.
const CAMPOS_FILETAMENTO = [
  ["peixes", "Qnt. peixes", "unidades"], ["peso", "Peso total", "kg"],
  ["com_pele", "Filé c/ pele e apara", "kg"], ["limpo", "Filé limpo", "kg"],
  ["raspa", "Raspa", "kg"], ["apara", "Apara", "kg"], ["pele", "Pele", "kg"],
  ["descarte", "Descarte", "kg"],
];
const PROCESSADOS_CONTAGEM = [
  ["anel_lula", "Anel de lula"], ["lombo_atum", "Lombo de atum"], ["polvo", "Tentáculo de polvo"],
];

// Entrada de processamento: o que o filetamento e o processamento do dia
// produziram entra sozinho no item processado, numa coluna separada da entrada
// de NF e transferência. [id do item na lista, bloco, chave ("*" = todos os
// calibres), campo]. A mesma tabela está no artefato Conferência das Lojas.
const ENTRADA_PROC = [
  ["anel_de_lula_processado", "processamento", "anel_lula", "processado"],
  ["lombo_de_atum_processado", "processamento", "lombo_atum", "processado"],
  ["polvo_processado", "processamento", "polvo", "processado"],
  ["file_de_salmao", "filetamento", "*", "limpo"],
  ["raspa_de_salmao", "filetamento", "*", "raspa"],
  ["apara_de_salmao", "filetamento", "*", "apara"],
  ["pele_de_salmao", "filetamento", "*", "pele"],
];
// {filetamento, processamento} -> quanto entrou no item pelo processamento (ou null).
function entradaProc(id, blocos) {
  const o = ENTRADA_PROC.find((x) => x[0] === id);
  if (!o) return null;
  const bloco = blocos[o[1]] || {};
  const ks = o[2] === "*" ? CALIBRES_FILETAMENTO.map((c) => c[0]) : [o[2]];
  let s = 0, tem = false;
  ks.forEach((k) => { const n = (bloco[k] || {})[o[3]]; if (typeof n === "number") { s += n; tem = true; } });
  return tem ? Math.round(s * 1000) / 1000 : null;
}

// A contagem diária é dividida em duas folhas, na tela e no papel:
//   1. Conferência de itens — a lista inteira, camarões junto dos demais;
//   2. Filetamento e processamento — filetamento do salmão e processados.

// Item que vale só para algumas casas (ex.: camarão P fora da DLU).
const itemDaCasa = (i, casa) => !(i.casas && i.casas.length) || i.casas.includes(casa);
const itensDaCasa = (itens, casa) => itens.filter((i) => itemDaCasa(i, casa));

// "pacote de 5 kg": por extenso, sem símbolo — o mesmo texto na tela e na ficha.
const numBR = (n, casas = 3) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: casas });
const comoContar = (i) => i.emb && i.fator
  ? `${i.emb} de ${numBR(i.fator)} ${i.un || ""}`.trim() : "unidade";

// ------------------------------------------------------------------ subprodutos
// Subproduto aparece recuado embaixo do item primário dele, para ficar claro
// que os dois são o mesmo insumo em estados diferentes. O primário vem:
//   - do campo "Item primário" da lista (pai), quando preenchido — é o caso do
//     salmão (bandado, filé, raspa, pele e apara saem do salmão inteiro) e do
//     camarão (cozido e temperado saem do "Camarão M - In Natura");
//   - senão, do nome com travessão: "Polvo — in natura" é filho de "Polvo".
// Primário que também é item da lista (salmão inteiro, camarão in natura) é
// contado na própria linha; o que não é (Polvo) vira só uma linha de título.
// O recuo é o único sinal do vínculo: sem traço nem símbolo na frente.
const SEP_SUB = " — ";
function paiDoItem(i) {
  if (i.pai) return i.pai;
  const k = (i.nome || "").indexOf(SEP_SUB);
  return k > 0 ? i.nome.slice(0, k) : "";
}
// Nome dentro do primário: "Camarão M — Perda" vira "Perda".
function nomeNoPai(i) {
  const p = paiDoItem(i);
  return p && i.nome.startsWith(p + SEP_SUB) ? i.nome.slice(p.length + SEP_SUB.length) : i.nome;
}

// A lista em linhas para desenhar, na ordem cadastrada:
//   {tipo:"grupo", nome} | {tipo:"pai", nome} | {tipo:"item", item, filho, primario}
function linhasDaLista(itens) {
  const out = [];
  let grupo = null, pai = null;
  itens.forEach((i, n) => {
    const g = i.grupo || "";
    if (g !== grupo) { out.push({ tipo: "grupo", nome: g }); grupo = g; pai = null; }
    const p = paiDoItem(i);
    if (p && chave(p) !== pai) { out.push({ tipo: "pai", nome: p }); pai = chave(p); }
    if (!p) pai = chave(i.nome);       // item solto pode ser o primário dos seguintes
    const prox = itens[n + 1];
    out.push({ tipo: "item", item: i, filho: !!p,
      primario: !p && !!prox && (prox.grupo || "") === g && chave(paiDoItem(prox)) === chave(i.nome) });
  });
  return out;
}

// Agrupa na ordem em que os grupos aparecem na lista; sem grupo fica junto.
function agruparItens(itens) {
  const grupos = [];
  itens.forEach((i) => {
    const g = i.grupo || "";
    let alvo = grupos.find((x) => x.nome === g);
    if (!alvo) grupos.push(alvo = { nome: g, itens: [] });
    alvo.itens.push(i);
  });
  return grupos;
}
