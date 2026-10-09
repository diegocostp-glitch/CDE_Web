// ============================================================================
// Monta uma tela React: tema antes de desenhar (para não piscar), e em volta
// do conteúdo o que toda tela tem — menu lateral, aviso flutuante e o botão de
// voltar ao topo. O botão de ações (js/acoes.js) continua sendo carregado por
// <script> no HTML de cada tela até ser migrado; ele é autocontido.
//
// A tela entrega o próprio <main class="main-content">: algumas põem coisas
// fora dele (painéis, diálogos), como já faziam no HTML antigo.
// ============================================================================
import { html, createRoot } from "./html.js";
import { aplicarTema, temaSalvo } from "./tema.js";
import { Sidebar, VoltarAoTopo } from "./componentes/Sidebar.js";
import { AvisoFlutuante } from "./componentes/Aviso.js";

export function Layout({ atual, children }) {
  return html`
    <div class="app-layout">
      <${Sidebar} atual=${atual} />
      ${children}
    </div>
    <${AvisoFlutuante} />
    <${VoltarAoTopo} />`;
}

export function montarTela(atual, Tela) {
  aplicarTema(temaSalvo());
  const raiz = document.getElementById("raiz");
  createRoot(raiz).render(html`<${Layout} atual=${atual}><${Tela} /></${Layout}>`);
}
