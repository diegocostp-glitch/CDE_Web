// ============================================================================
// Botão de ações nas telas que ainda não são React.
//
// As telas React recebem o <AcoesRapidas/> pelo Layout (montar.js). As que
// continuam em HTML + JS puro carregam este módulo no lugar do antigo
// js/acoes.js: ele monta o mesmo componente num contêiner próprio no fim da
// página, onde o antigo inseria o botão e o painel. Sai quando a última tela
// antiga for migrada.
// ============================================================================
import { html, createRoot } from "./html.js";
import { AcoesRapidas } from "./componentes/AcoesRapidas.js";

const raiz = document.createElement("div");
raiz.id = "acoes-raiz";
document.body.appendChild(raiz);
createRoot(raiz).render(html`<${AcoesRapidas} />`);
