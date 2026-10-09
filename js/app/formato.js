// ============================================================================
// O ÚNICO lugar com num/fmt/qtd e companhia.
//
// Antes cada tela tinha a sua cópia, e foi a divergência entre cópias que fez
// um "0.184" voltar do campo como 184 e um faturamento de "20.802,90" virar
// R$ 20,80. Quem precisa ler ou escrever número importa daqui.
// ============================================================================

// Cuidado com a origem do número: o JSON usa ponto como DECIMAL (43.081 são
// quarenta e três quilos) e o campo digitado usa ponto como MILHAR
// (43.081 são quarenta e três mil). A vírgula é o que distingue: só quando ela
// aparece o ponto é separador de milhar. "69,86" -> 69.86 · "1.234,56" -> 1234.56
export function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

// Variante SEM a regra do milhar: "1.234" vale 1,234. É a que a Conversão de
// Salmão e o botão de ações sempre usaram — lá o campo é preço por quilo
// (~R$ 50) e "52.858" digitado com ponto quer dizer 52,858. Unificar com num()
// mudaria esse resultado; fica registrado como divergência a decidir depois
// da migração (MIGRACAO-REACT.md, pendências), não resolvido no meio dela.
export function numSemMilhar(v) {
  const t = String(v == null ? "" : v).replace(/[^\d,.-]/g, "");
  const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return isNaN(n) ? 0 : n;
}

// Número para exibição, com casas fixas. Nulo/indefinido/infinito vira "—".
export const fmt = (n, c = 2) => (n === null || n === undefined || !isFinite(n)) ? "—"
  : n.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

// Variante da Conversão de Salmão: não-finito vira 0 ("0,00"), não "—".
export const fmtZero = (n, c = 2) => (!isFinite(n) ? 0 : n)
  .toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });

// Valor que vai DENTRO de um campo de quantidade, sempre em pt-BR e com três
// casas (formato #,##0.000 da planilha da casa). Número cru do servidor nunca
// vai direto ao campo: "0.184" voltaria como 184. Vazio continua vazio — vazio
// é "não contado", diferente de contado zero.
export const qtd = (n) => (n === null || n === undefined || n === "") ? ""
  : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Meio milésimo: a tela mostra três casas, então tudo abaixo disso É zero para
// quem olha. Soma de decimais em binário não fecha em zero exato (20,945 +
// 9,995 − 30,940 dá -0,0000000000000036), e comparar com zero cru acusava o
// usuário de um erro que era da aritmética.
export const QUASE_ZERO = 0.0005;
export const zerado = (n) => Math.abs(n) < QUASE_ZERO;

// Escape para texto que vai a atributo ou a HTML montado à mão (PDF, CSV,
// dicas). Em JSX/htm o React já escapa sozinho.
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const brDate = (iso) => iso ? iso.split("-").reverse().join("/") : "—";

// Duas noções de "hoje", e as duas existem de propósito no sistema antigo:
//  - hojeLocal: a data do relógio da loja (Lançamento, Projeção, botão de
//    ações). Depois das 21h em Belém, o UTC já é amanhã.
//  - hojeISO: a data em UTC, como as telas de compras (comum.js) sempre
//    fizeram. Trocar uma pela outra muda o comportamento — não unifique sem
//    decidir isso à parte.
export const hojeLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const hojeISO = () => new Date().toISOString().slice(0, 10);
export const hojeBR = () => new Date().toLocaleDateString("pt-BR");
export const hojePonto = () => new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");

// Data do Excel (número de série) ou texto já legível → dd/mm/aaaa
export function dataDoExcel(v) {
  if (!v) return "";
  const n = Number(String(v).replace(",", "."));
  if (!isNaN(n) && n > 10000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000))
      .toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }
  return String(v).trim();
}

// Nome limpo para exibir/gravar: colapsa qualquer espaço (inclusive o
// não-quebrável que o Excel insere) e apara as pontas.
export const limpaNome = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
// Chave de comparação: sem acento, minúscula, espaços normalizados. É o que
// impede "STRAW " de virar um produto diferente de "STRAW".
export const chave = (s) => limpaNome(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Busca: ignora acento e caixa.
export const busca = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------------------ CNPJ
export const soDigitos = (v) => String(v || "").replace(/\D/g, "");

export function formatarCNPJ(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length > 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length > 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  if (d.length > 5)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length > 2)  return `${d.slice(0,2)}.${d.slice(2)}`;
  return d;
}

export function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base) => {
    let peso = base.length - 7, soma = 0;
    for (let i = base.length; i >= 1; i--) {
      soma += parseInt(base[base.length - i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(d.slice(0, 12));
  return d1 === parseInt(d[12]) && digito(d.slice(0, 12) + d1) === parseInt(d[13]);
}
