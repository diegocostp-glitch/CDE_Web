// ============================================================================
// Aviso flutuante e barra de estado.
//
// O aviso é chamado de qualquer lugar da tela (depois de um fetch, num catch),
// então vive como um pequeno estado de módulo com assinantes, e não como prop
// que precisaria descer por toda a árvore. Uma tela chama aviso("texto", "mau")
// e o <AvisoFlutuante/> montado pelo Layout mostra.
//
// O tempo na tela NÃO é igual em todas as telas antigas, e a migração mantém:
//   Lançamento, Movimentações e outras: 3,2 s fixos;
//   telas de compras (comum.js): 3,4 s, e 6 s quando é erro ("mau").
// Por isso aviso() aceita a duração; cada tela passa a sua.
// ============================================================================
import { html, useEffect, useState } from "../html.js";

let atual = null;          // { texto, tipo, id }
let timer = null;
const assinantes = new Set();
const avisa = () => assinantes.forEach((f) => f(atual));

export function aviso(texto, tipo, ms = 3200) {
  atual = { texto, tipo: tipo || "", id: Date.now() + Math.random() };
  avisa();
  clearTimeout(timer);
  timer = setTimeout(() => { atual = null; avisa(); }, ms);
}
// Variante das telas de compras (Ordens, Cadastros, Importar, Parâmetros,
// Qualidade): 6 s para erro, 3,4 s para o resto — como o comum.js.
export const avisoCompras = (texto, tipo) => aviso(texto, tipo, tipo === "mau" ? 6000 : 3400);

export function AvisoFlutuante() {
  const [a, setA] = useState(atual);
  useEffect(() => { assinantes.add(setA); return () => assinantes.delete(setA); }, []);
  return html`<div id="aviso" class=${"aviso-flut " + (a ? a.tipo : "")} hidden=${!a}>
    ${a ? a.texto : ""}</div>`;
}

// Barra de estado ("Salvando…", "Salvo"). Componente controlado: a tela guarda
// { texto, classe } no próprio estado e passa aqui.
export function Estado({ texto, classe, id = "estado" }) {
  return html`<span id=${id} class=${"estado " + (classe || "")}>${texto || ""}</span>`;
}
