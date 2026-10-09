// ============================================================================
// Menu lateral fixo, tema e "voltar ao topo" — antes js/navegacao.js.
//
// Padrão "Mboard": menu navy sempre visível, item ativo em laranja com filete
// lateral, rodapé com ajuda e alternador de tema. O HTML gerado é o mesmo do
// navegacao.js, classe por classe, para o css/style.css valer sem mudança.
// ============================================================================
import { html, useEffect, useState } from "../html.js";
import { getOrdens } from "../api.js";
import { TEMAS, TEMA_NOME, TEMA_CURTO, aplicarTema, temaSalvo } from "../tema.js";

export const ICO = {
  lancamento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
  painel: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  compras: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  ordens: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
  conversao: '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 6h6z"/><path d="m19 7-3 6h6z"/><path d="M8 21h8"/>',
  // escudo com visto: conformidade aprovada, o que a tela do PCQS decide
  qualidade: '<path d="M12 3l7 3v5c0 4.5-3 7.6-7 10-4-2.4-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  planilha: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  parametros: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  cadastros: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><line x1="12" y1="22" x2="12" y2="12"/>',
  overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  movimentacoes: '<path d="M17 3v12"/><path d="m21 11-4 4-4-4"/><path d="M7 21V9"/><path d="m3 13 4-4 4 4"/>',
  lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  // círculo meio preenchido: o símbolo clássico de contraste, sem cor nenhuma
  mono: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  topo: '<line x1="12" y1="20" x2="12" y2="6"/><polyline points="5 13 12 6 19 13"/>',
};
const ICO_TEMA = { light: ICO.sol, dark: ICO.lua, mono: ICO.mono };

// Ícone de traço, 18px — o mesmo svg() do navegacao.js. O desenho é constante
// do próprio sistema, nunca texto digitado, por isso o innerHTML.
export function Icone({ d, tam = 18 }) {
  return html`<svg width=${tam} height=${tam} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
}

// Três seções: o que se faz todo dia, o que gera compra e a base que sustenta
// as duas. Dentro de Compras, Ordens vem primeiro porque é o módulo — Projeção
// e Importar são fontes que abastecem a fila dele.
const SECOES = [
  ["Início", [
    { id: "overview", rotulo: "Visão Geral", href: "overview.html" },
  ]],
  ["Operação", [
    { id: "lancamento", rotulo: "Lançamento Diário", href: "index.html" },
    { id: "painel", rotulo: "Painel de Consumo", href: "painel.html" },
    { id: "movimentacoes", rotulo: "Movimentações", href: "movimentacoes.html" },
  ]],
  ["Compras", [
    { id: "ordens", rotulo: "Ordens de Compras", href: "ordens.html" },
    { id: "compras", rotulo: "Projeção de Compras", href: "compras.html" },
    { id: "importar", rotulo: "Importar OC", href: "importar.html" },
    { id: "conversao", rotulo: "Conversão de Salmão", href: "conversao.html" },
    // Fecha o ciclo do salmão dentro de Compras: a ordem sai, o peixe chega e
    // o PCQS diz se chegou o que foi comprado.
    { id: "qualidade", rotulo: "Qualidade do Salmão", href: "qualidade.html" },
  ]],
  ["Base", [
    { id: "cadastros", rotulo: "Cadastros", href: "cadastros.html" },
    { id: "parametros", rotulo: "Parâmetros", href: "parametros.html" },
  ]],
];

export function Sidebar({ atual }) {
  const [tema, setTema] = useState(temaSalvo);
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => { aplicarTema(tema); }, [tema]);

  // O selo de ordens pendentes aparece em todas as telas: quem está lançando
  // precisa ver que sobrou compra para emitir sem ir procurar. Falha em
  // silêncio se o servidor não responder — menu sem selo é melhor que erro.
  useEffect(() => {
    (async () => {
      try {
        const r = await (await getOrdens("pendente")).json();
        if (r.pendentes) setPendentes(r.pendentes);
      } catch (e) { /* servidor fora do ar: segue sem selo */ }
    })();
  }, []);

  // Dois jeitos de trocar, um para cada estado do menu:
  //   recolhido — só o ícone aparece, e o clique na linha CICLA os temas;
  //   aberto    — os três botões aparecem e cada um vai direto no seu tema.
  const ciclar = () => setTema(TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]);

  const item = (i) => {
    const badge = i.id === "ordens" && pendentes ? pendentes : null;
    return html`<a key=${i.id} class=${"sb-item" + (i.id === atual ? " active" : "")} href=${i.href}>
      <span class="sb-ico"><${Icone} d=${ICO[i.id]} /></span>
      <span class="sb-txt">${i.rotulo}</span>
      ${badge ? html`<span class="sb-badge">${badge}</span>` : html`<span class="sb-arr">→</span>`}
    </a>`;
  };

  return html`<aside class="sidebar">
    <div class="sb-logo">
      <img class="sb-marca" src="centurion_menu.png" alt="Centurion Beta" />
      <div class="sb-logo-txt">
        <div class="sb-logo-title">Centurion Beta</div>
        <div class="sb-logo-sub">Controle de estoque</div>
      </div>
    </div>
    <nav class="sb-nav">
      ${SECOES.map(([titulo, itens]) => html`<${React.Fragment} key=${titulo}>
        <div class="sb-section">${titulo}</div>
        ${itens.map(item)}
      </${React.Fragment}>`)}
    </nav>
    <div class="sb-rodape">
      <a class=${"sb-item" + (atual === "ajuda" ? " active" : "")} href="ajuda.html">
        <span class="sb-ico"><${Icone} d=${ICO.ajuda} /></span><span class="sb-txt">Ajuda</span></a>
      <div class="sb-tema" id="linha-tema" role="button" tabindex="0" title="Alternar tema"
        onClick=${ciclar}
        onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ciclar(); } }}>
        <span class="sb-ico" id="theme-ico"><${Icone} d=${ICO_TEMA[tema]} /></span>
        <span id="theme-name">${TEMA_CURTO[tema]}</span>
        <div class="tema-seg" id="tema-seg" role="group" aria-label="Tema">
          ${TEMAS.map((t) => html`<button key=${t} type="button" data-tema=${t}
            title=${TEMA_NOME[t]} aria-label=${TEMA_NOME[t]}
            class=${t === tema ? "ativo" : ""} aria-pressed=${t === tema ? "true" : "false"}
            onClick=${(e) => { e.stopPropagation(); setTema(t); }}>
            <${Icone} d=${ICO_TEMA[t]} /></button>`)}
        </div>
      </div>
    </div>
  </aside>`;
}

// Toda tela rola, e o que se procura depois de descer mora no ALTO — o
// filtro, as abas das casas, o botão de salvar. Nasce escondido e aparece
// depois de uma tela de rolagem: parado no canto de uma tela curta, seria só
// ruído em cima do botão de ações.
export function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const mostrar = () => setVisivel(window.scrollY > 260);
    document.addEventListener("scroll", mostrar, { passive: true });
    mostrar();
    return () => document.removeEventListener("scroll", mostrar);
  }, []);
  return html`<button type="button" id="voltar-topo" class=${"topo-botao" + (visivel ? " visivel" : "")}
    title="Voltar ao topo" aria-label="Voltar ao topo"
    onClick=${() => window.scrollTo({ top: 0, behavior: "smooth" })}>
    <${Icone} d=${ICO.topo} /></button>`;
}
