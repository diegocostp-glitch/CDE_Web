// ============================================================================
// Ajuda — texto fixo. Fica em HTML puro no <template id="conteudo-ajuda"> do
// ajuda.html, para ser editado sem mexer em JavaScript; esta tela só põe o menu
// e o layout em volta. O conteúdo é do próprio sistema (nada digitado pelo
// usuário), por isso o innerHTML.
// ============================================================================
import { html } from "../html.js";
import { montarTela } from "../montar.js";

const CONTEUDO = document.getElementById("conteudo-ajuda").innerHTML;

function Ajuda() {
  return html`<main class="main-content" dangerouslySetInnerHTML=${{ __html: CONTEUDO }}></main>`;
}

montarTela("ajuda", Ajuda);
