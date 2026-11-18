// ============================================================================
// Quem aprova a compra. Assina a Ordem de Compra (js/oc-pdf.js) e o relatório
// de recebimento do salmão (js/pcqs.js): trocou o gerente, troca-se aqui e vale
// para os dois documentos.
//
// Arquivo à parte, e não em comum.js, porque a prévia da OC abre em qualquer
// tela (js/acoes.js carrega o PDF na hora do clique) e várias telas não têm
// comum.js.
// ============================================================================
const GERENTE_SUPRIMENTOS = "José do Couto";

// Responsáveis que assinam a OC ("Emitida por" e "Aprovada por"). Entrou
// alguém novo, acrescenta-se aqui e aparece nas listas das duas telas.
const ASSINANTES_OC = ["José do Couto", "Breno Macedo", "Marcelo"];

// As duas listas suspensas do bloco "Dados da Ordem de Compra" (Ordens e
// Importar). "Emitida por" começa no contato da unidade, como antes; "Aprovada
// por", no gerente. Nome gravado numa ordem antiga que saiu da lista continua
// aparecendo nela, para a ordem não trocar de assinatura sozinha.
function camposAssinaturaOC(d) {
  d = d || {};
  const at = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const opcoes = (atual, primeira) => {
    const nomes = ASSINANTES_OC.slice();
    if (atual && !nomes.includes(atual)) nomes.push(atual);
    return (primeira || "") + nomes.map((n) =>
      `<option value="${at(n)}"${n === atual ? " selected" : ""}>${at(n)}</option>`).join("");
  };
  const emitida = d.emitidaPor || "";
  return `
      <label class="campo"><span>Emitida por</span>
        <select data-oc="emitidaPor">${opcoes(emitida,
          `<option value=""${emitida ? "" : " selected"}>Contato da unidade</option>`)}</select></label>
      <label class="campo"><span>Aprovada por</span>
        <select data-oc="aprovadaPor">${opcoes(d.aprovadaPor || GERENTE_SUPRIMENTOS)}</select></label>`;
}
