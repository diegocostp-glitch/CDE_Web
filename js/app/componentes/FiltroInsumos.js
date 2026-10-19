// ============================================================================
// Filtro de vários insumos (Movimentações).
//
// Um <select> comum respondia "qual insumo?" e a pergunta de quem confere é
// quase sempre um CONJUNTO: os três camarões, as quatro libragens de salmão, os
// dois lados de um processado. Antes isso era uma consulta por item e uma soma
// à mão — e o placar, que resume o período, nunca mostrava o grupo.
//
// A lista repete o agrupamento do lançamento diário (Salmão, Camarão, Peixe e
// frutos do mar, secos) porque é nessa ordem que a pessoa procura.
//
// O componente guarda só se está aberto; as chaves marcadas são da tela (lista
// vazia = todos). Ele avisa a mudança na hora (aoMudar) e pede a consulta
// (aoAplicar) meio segundo depois do último clique, ou na hora, se o painel
// fechar antes: uma consulta por clique faria três buscas no histórico para
// marcar três camarões; esperar só o fechamento deixaria a tela parada enquanto
// a pessoa marca. Quem decide se a escolha mudou mesmo é a tela.
// ============================================================================
import { html, useState, useEffect, useRef } from "../html.js";

export function agrupar(insumos) {
  const grupos = [];
  insumos.forEach((i) => {
    let g = grupos.find((x) => x.nome === i.grupo);
    if (!g) { g = { nome: i.grupo, itens: [] }; grupos.push(g); }
    g.itens.push(i);
  });
  return grupos;
}

export function FiltroInsumos({ insumos, marcados, aoMudar, aoAplicar }) {
  const [aberta, setAberta] = useState(false);
  const abertaRef = useRef(false);
  const timer = useRef(null);
  const aplicar = useRef(aoAplicar);
  aplicar.current = aoAplicar;

  const abrir = (sim) => {
    abertaRef.current = sim;
    setAberta(sim);
    if (!sim) { clearTimeout(timer.current); aplicar.current(); }
  };

  // Clicar fora fecha: o painel cobre parte da barra, e deixá-lo aberto
  // esconderia justamente o filtro seguinte. Os ouvintes ficam ligados o tempo
  // todo e olham a ref: ligá-los só ao abrir (num efeito, que roda depois do
  // desenho) deixava escapar um Esc logo em seguida.
  useEffect(() => {
    const clique = (e) => { if (abertaRef.current && !e.target.closest("#f-insumo")) abrir(false); };
    const tecla = (e) => { if (e.key === "Escape" && abertaRef.current) abrir(false); };
    document.addEventListener("click", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("click", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, []);

  // Marcados sempre na ordem da lista, não na ordem dos cliques.
  const mudar = (nova) => {
    aoMudar(insumos.filter((i) => nova.has(i.chave)).map((i) => i.chave));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => aplicar.current(), 500);
  };
  const marcar = (chave, sim) => {
    const nova = new Set(marcados);
    if (sim) nova.add(chave); else nova.delete(chave);
    mudar(nova);
  };

  const total = insumos.length;
  const primeiro = insumos.find((i) => i.chave === marcados[0]);
  // Um insumo marcado mostra o nome dele no botão; vários viram a contagem,
  // porque três nomes inteiros não caberiam na barra de filtros.
  const rotulo = !marcados.length ? "Todos"
    : marcados.length === 1 ? (primeiro ? primeiro.nome : "") : marcados.length + " insumos";

  return html`<div class="multi" id="f-insumo">
    <button type="button" class="multi-botao" id="f-insumo-botao"
            aria-expanded=${aberta ? "true" : "false"} aria-haspopup="true"
            onClick=${() => abrir(!aberta)}>
      <span class="multi-rotulo" id="f-insumo-rotulo">${rotulo}</span>
      <span class="multi-seta" aria-hidden="true">▾</span>
    </button>
    <div class="multi-lista" id="f-insumo-lista" hidden=${!aberta} role="group"
         aria-label="Insumos do extrato">
      ${insumos.length ? html`
      <div class="multi-topo">
        <span class="multi-conta" id="f-insumo-conta">${!marcados.length
          ? "Todos os " + total + " insumos" : marcados.length + " de " + total + " marcados"}</span>
        <button type="button" class="multi-acao" id="f-insumo-limpar"
                disabled=${!marcados.length} onClick=${() => mudar(new Set())}>Limpar</button>
      </div>` : null}
      ${agrupar(insumos).map((g) => html`
        <div class="multi-grupo" key=${"g-" + g.nome}>${g.nome}</div>
        ${g.itens.map((i) => html`
        <label class="multi-item" key=${i.chave}><input type="checkbox" value=${i.chave}
            checked=${marcados.includes(i.chave)}
            onChange=${(e) => marcar(i.chave, e.target.checked)} />
          <span>${i.nome} <span class="un">${i.un}</span></span></label>`)}`)}
    </div>
  </div>`;
}
