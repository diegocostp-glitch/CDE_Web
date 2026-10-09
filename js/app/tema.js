// ============================================================================
// Três temas, na chave sb_theme_v1 — a mesma do Gerador de OCs, para a
// preferência viajar junto quando os dois sistemas forem mesclados.
// O "mono" é o pedido da direção: preto, cinza e branco, sem nenhuma outra cor.
// ============================================================================
export const THEME_KEY = "sb_theme_v1";
export const TEMAS = ["light", "dark", "mono"];
export const TEMA_NOME = { light: "Modo claro", dark: "Modo escuro", mono: "Modo mono" };
// Rótulo curto de propósito: aberto, o menu deixa 176px para a linha do tema,
// os três botões comem 85, e "Modo escuro" não cabe nos 80 que restam.
export const TEMA_CURTO = { light: "Claro", dark: "Escuro", mono: "Mono" };

export function temaSalvo() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* sem storage */ }
  return TEMAS.includes(t) ? t : "light";   // chave antiga ou lixo vira claro
}

// O tema é a classe do <body> inteiro (o CSS todo depende dela), então mora
// fora do React: aplicado aqui, antes de a tela desenhar, para não piscar.
export function aplicarTema(t) {
  if (!TEMAS.includes(t)) t = "light";
  document.body.className = t;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* sem storage */ }
  return t;
}
